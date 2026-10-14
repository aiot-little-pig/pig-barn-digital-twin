import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app import app
from backend.telemetry import TelemetryStore


def sample():
    return dict(label='Sensor 1', position=[-3.,1.2,-3.], scope='sensor', position_basis='assumed', policy=None,
        dataset=dict(dataset_id='TEST',dataset_version='1',farm_id='farm',subject_id='sensor',
            observation_source='historical',unit='ppm',feature_units={},
            records=[dict(observed_at='2026-10-14T00:00:00Z',nh3=12.)]))


class TelemetryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = TelemetryStore(Path(self.tmp.name)/'inbox.sqlite3')
        self.patch = patch('backend.telemetry.store', self.store)
        self.patch.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def post(self, batch):
        return self.client.post('/api/v2/telemetry/observations',json=batch)

    def bundle(self):
        return self.client.get('/api/v2/telemetry/bundle?dataset_id=TEST&dataset_version=1')

    def test_ingestion_to_prediction_and_persistence(self):
        self.assertEqual(self.post(sample()).json()['accepted'],1)
        series = self.bundle().json()['series'][0]
        request = {k:series[k] for k in ('dataset_id','dataset_version','farm_id','subject_id','observation_source','unit')}
        request.update(request_id='test',condition_id='baseline',model_id='mock-persistence',model_version='1',
                       issued_at=series['records'][0]['observed_at'],history=series['records'])
        with patch.dict('os.environ', {'PREDICTOR_MODE':'mock'}):
            result = self.client.post('/api/v2/predict',json=request)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['prediction'],12.)
        self.assertEqual(result.json()['prediction_source'],'mock')
        self.assertEqual(TelemetryStore(self.store.path).bundle('TEST','1')['series'][0]['records'],series['records'])

    def test_idempotence_equivalent_timezone_and_atomic_conflict(self):
        self.post(sample())
        same = sample(); same['dataset']['records'][0]['observed_at']='2026-10-14T09:00:00+09:00'
        self.assertEqual(self.post(same).json()['accepted'],0)
        bad = sample(); bad['dataset']['records'][0]['nh3']=22.
        bad['dataset']['records'].append(dict(observed_at='2026-10-14T00:01:00Z',nh3=13.))
        self.assertEqual(self.post(bad).status_code,409)
        self.assertEqual(len(self.bundle().json()['series'][0]['records']),1)

    def test_metadata_and_invalid_measurements(self):
        self.post(sample())
        changed=sample();changed['position']=[0.,1.,0.]
        self.assertEqual(self.post(changed).status_code,409)
        for change in ('negative','naive','out_of_bounds','demo'):
            batch=copy.deepcopy(sample())
            if change=='negative': batch['dataset']['records'][0]['nh3']=-1.
            if change=='naive': batch['dataset']['records'][0]['observed_at']='2026-10-14T00:00:00'
            if change=='out_of_bounds': batch['position']=[40.,1.,0.]
            if change=='demo': batch['policy']=dict(min=0.,max=30.,warning=15.,danger=22.,basis='demo',demo=True)
            self.assertEqual(self.post(batch).status_code,422,change)

    def test_missing_dataset_and_missing_value(self):
        self.assertEqual(self.bundle().status_code,404)
        batch=sample();batch['dataset']['records'][0]['nh3']=None
        self.assertEqual(self.post(batch).status_code,200)
        self.assertIsNone(self.bundle().json()['series'][0]['records'][0]['nh3'])


if __name__=='__main__': unittest.main()
