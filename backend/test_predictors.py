import json
import os
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app import app
from backend.schemas import PredictionRequest, PredictionResult, PredictionArchive
from backend.predictors import MockPredictor, FilePredictor, HttpPredictor, ProviderError
from backend.data_sources import ObservationDataset, ObservationStore, load_csv
from backend.data_sources.legacy_replay import convert_replay

NOW = datetime(2024, 1, 1, tzinfo=timezone.utc)


def request_data():
    return dict(request_id='test-1', dataset_id='fixture', dataset_version='1',
                farm_id='farm-a', subject_id='aggregate', condition_id='baseline',
                model_id='mock-persistence', model_version='1',
                observation_source='synthetic_fixture', unit='ppm', issued_at=NOW,
                history=[dict(observed_at=NOW, nh3=12.0)])


class PredictorTests(unittest.TestCase):
    def setUp(self):
        self.request = PredictionRequest(**request_data())

    def test_persistence_and_missing_current(self):
        result = MockPredictor().predict(self.request)
        self.assertEqual(result.prediction, 12)
        self.assertEqual(result.prediction_source, 'mock')
        self.assertIsNone(result.lower)
        self.assertEqual(result.target_at, NOW + timedelta(minutes=30))
        for history in ([], [dict(observed_at=NOW, nh3=None)],
                        [dict(observed_at=NOW-timedelta(minutes=5), nh3=12)]):
            request = PredictionRequest(**{**request_data(), 'history': history})
            self.assertEqual(MockPredictor().predict(request).status, 'insufficient_input')

    def test_future_duplicate_unsorted_and_nonfinite_rejected(self):
        cases = [
            [dict(observed_at=NOW+timedelta(seconds=1), nh3=99)],
            [dict(observed_at=NOW, nh3=12)] * 2,
            [dict(observed_at=NOW, nh3=12), dict(observed_at=NOW-timedelta(minutes=1), nh3=11)],
            [dict(observed_at=NOW, nh3=float('nan'))],
            [dict(observed_at=NOW, nh3=-1)],
            [dict(observed_at=NOW.replace(tzinfo=None), nh3=12)],
            [dict(observed_at=NOW, nh3=True)],
        ]
        for history in cases:
            with self.subTest(history=history), self.assertRaises(ValidationError):
                PredictionRequest(**{**request_data(), 'history': history})
        with self.assertRaises(ValidationError):
            PredictionRequest(**request_data(), actual=14)

    def test_response_bounds_and_status(self):
        original = MockPredictor().predict(self.request).model_dump()
        for change in ({'target_at': NOW}, {'prediction': None}, {'status': 'unavailable'},
                       {'lower': 1}, {'lower': 15, 'upper': 10, 'nominal_coverage': .9, 'interval_method': 'fixture'},
                       {'prediction': float('inf')}, {'nominal_coverage': .9}):
            with self.subTest(change=change), self.assertRaises(ValidationError):
                PredictionResult(**{**original, **change})
        # Preserve a model's raw lower bound; rendering must not rewrite evaluation data.
        row = PredictionResult(**{**original, 'lower': -2, 'upper': 14,
                                  'nominal_coverage': .9, 'interval_method': 'test-only'})
        self.assertEqual(row.lower, -2)

    def test_file_provider_exact_identity_and_duplicate_guard(self):
        result = MockPredictor().predict(self.request)
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'forecasts.json'
            path.write_text(PredictionArchive(records=[result]).model_dump_json(), encoding='utf-8')
            provider = FilePredictor(path)
            other = self.request.model_copy(update={'request_id': 'new-request'})
            self.assertEqual(provider.predict(other).request_id, 'new-request')
            for field, value in [('farm_id', 'farm-b'), ('model_version', '2'), ('unit', 'relative_index')]:
                with self.subTest(field=field), self.assertRaises(ProviderError):
                    provider.predict(self.request.model_copy(update={field: value}))
        with self.assertRaises(ValidationError):
            PredictionArchive(records=[result, result])

    def test_http_failures_and_mismatched_response(self):
        original = MockPredictor().predict(self.request).model_dump(mode='json')
        def timeout(request):
            raise httpx.ReadTimeout('secret upstream details', request=request)
        for handler in [timeout, lambda r: httpx.Response(500, text='secret'),
                        lambda r: httpx.Response(200, json={'invalid': True})] + [
                            lambda r, f=field, v=value: httpx.Response(200, json={**original, f: v})
                            for field, value in [('request_id', 'wrong'), ('farm_id', 'wrong'), ('unit', 'relative_index')]
                        ]:
            with self.subTest(handler=handler), self.assertRaises(ProviderError) as error:
                HttpPredictor('http://test/predict', transport=httpx.MockTransport(handler)).predict(self.request)
            self.assertNotIn('secret', str(error.exception))

    def test_mock_to_real_local_http_without_api_contract_change(self):
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                result = MockPredictor().predict(PredictionRequest.model_validate(payload))
                body = result.model_dump_json().encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = TestClient(app)
            body = self.request.model_dump(mode='json')
            with patch.dict(os.environ, {'PREDICTOR_MODE': 'mock'}):
                mock = client.post('/api/v2/predict', json=body)
            with patch.dict(os.environ, {'PREDICTOR_MODE': 'http',
                                        'PREDICTOR_URL': f'http://127.0.0.1:{server.server_port}/predict'}):
                remote = client.post('/api/v2/predict', json=body)
            self.assertEqual(mock.status_code, 200, mock.text)
            self.assertEqual(remote.status_code, 200, remote.text)
            a, b = mock.json(), remote.json()
            a.pop('generated_at'); b.pop('generated_at')
            self.assertEqual(a, b)
            self.assertEqual(remote.headers['cache-control'], 'no-store')
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_api_errors_and_no_fallback(self):
        client = TestClient(app)
        body = self.request.model_dump(mode='json')
        with patch.dict(os.environ, {'PREDICTOR_MODE': 'invalid'}):
            self.assertEqual(client.post('/api/v2/predict', json=body).status_code, 503)
        with patch('backend.app.get_predictor') as factory:
            factory.return_value.predict.side_effect = ProviderError('no connection')
            self.assertEqual(client.post('/api/v2/predict', json=body).status_code, 502)
        invalid = deepcopy(body)
        invalid['history'][0]['observed_at'] = '2024-01-02T00:00:00Z'
        self.assertEqual(client.post('/api/v2/predict', json=invalid).status_code, 422)
        cors = client.options('/api/v2/predict', headers={
            'Origin': 'http://127.0.0.1:4173', 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type'})
        self.assertEqual(cors.status_code, 200)


class DataSourceTests(unittest.TestCase):
    def test_shipped_examples_match_across_mock_file_and_observation_store(self):
        from backend.data_sources import load_json
        examples = Path(__file__).parents[1] / 'examples'
        request = PredictionRequest.model_validate_json(
            (examples / 'prediction-request-SYNTHETIC.json').read_text(encoding='utf-8'))
        stored = FilePredictor(examples / 'predictions-SYNTHETIC.json').predict(request)
        self.assertEqual(stored.prediction, MockPredictor().predict(request).prediction)
        dataset = load_json(examples / 'observations-SYNTHETIC.json')
        rebuilt = ObservationStore(dataset).request_at(
            issued_at=request.issued_at, request_id=request.request_id,
            condition_id=request.condition_id, model_id=request.model_id, model_version=request.model_version)
        self.assertEqual(rebuilt, request)

    def metadata(self):
        keys = ('dataset_id', 'dataset_version', 'farm_id', 'subject_id', 'observation_source', 'unit')
        return {key: request_data()[key] for key in keys}

    def test_store_sorts_filters_future_and_preserves_gaps(self):
        rows = [dict(observed_at=NOW+timedelta(minutes=m), nh3=v) for m, v in [(30, 99), (0, 12), (-7, None)]]
        store = ObservationStore(ObservationDataset(**self.metadata(), records=rows))
        req = store.request_at(issued_at=NOW, request_id='r', condition_id='baseline',
                               model_id='mock-persistence', model_version='1')
        self.assertEqual([r.nh3 for r in req.history], [None, 12])
        self.assertEqual(MockPredictor().predict(req).prediction, 12)
        with self.assertRaises(ValidationError):
            ObservationDataset(**self.metadata(), records=[rows[0], rows[0]])

    def test_csv_mapping_and_missing(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'observations.csv'
            path.write_text('timestamp,value\n2024-01-01T00:00:00Z,12\n2024-01-01T00:05:00Z,\n', encoding='utf-8')
            data = load_csv(path, self.metadata(), {'observed_at': 'timestamp', 'nh3': 'value'})
            self.assertEqual([r.nh3 for r in data.records], [12, None])
            with self.assertRaises(ValueError):
                load_csv(path, self.metadata())

    def test_legacy_forecast_adapter_requires_metadata_and_excludes_truth(self):
        path = Path(__file__).parents[1] / 'examples/replay-example-SYNTHETIC.json'
        legacy = json.loads(path.read_text(encoding='utf-8'))
        archive = convert_replay(legacy, dataset_version='fixture-1', subject_id='aggregate',
                                model_versions={r['model_id']: 'fixture-1' for r in legacy['records']},
                                observation_source='synthetic_fixture')
        self.assertEqual(len(archive.records), 20)
        self.assertIsNone(archive.records[0].generated_at)
        self.assertNotIn('actual', archive.records[0].model_dump())
        self.assertEqual(archive.records[0].prediction_source, 'synthetic_fixture')


if __name__ == '__main__':
    unittest.main()
