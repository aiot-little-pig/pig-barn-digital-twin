from copy import deepcopy
from datetime import timedelta
import unittest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from backend.app import app, DATA, Snapshot, build_snapshot


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_all_scenarios_match_exported_frames(self):
        for scenario in DATA['runs']:
            for minute in (0, 11, 41, 120):
                with self.subTest(scenario=scenario, minute=minute):
                    response = self.client.get('/api/v1/snapshot', params={'scenario': scenario, 'minute': minute})
                    self.assertEqual(response.status_code, 200)
                    snapshot = Snapshot.model_validate(response.json())
                    expected = DATA['runs'][scenario][minute]
                    self.assertEqual(snapshot.current_index, expected['current'])
                    self.assertEqual(snapshot.actuators.scrubber_on, expected['scrubberOn'])
                    self.assertEqual(snapshot.grid.rows, 36)
                    self.assertEqual(snapshot.grid.columns, 24)
                    self.assertEqual(snapshot.grid.values[0][0], min(1, expected['current'] * DATA['weights'][0][0]))
                    self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_invalid_requests_and_read_only(self):
        for query in ('scenario=C5', 'minute=-1', 'minute=121', 'minute=0.5', 'minute=nan', 'minute=inf'):
            self.assertEqual(self.client.get('/api/v1/snapshot?' + query).status_code, 422)
        self.assertEqual(self.client.post('/api/v1/snapshot').status_code, 405)

    def test_cors_origin_allowlist(self):
        good = self.client.get('/health', headers={'Origin': 'http://127.0.0.1:4173'})
        self.assertEqual(good.headers['access-control-allow-origin'], 'http://127.0.0.1:4173')
        bad = self.client.get('/health', headers={'Origin': 'https://example.org'})
        self.assertNotIn('access-control-allow-origin', bad.headers)

    def test_schema_preserves_missing_and_rejects_broken_grid_and_time(self):
        original = build_snapshot('C3', 11).model_dump()
        missing = deepcopy(original)
        missing['grid']['values'][0][0] = None
        missing['current_index'] = None
        missing['actuators']['scrubber_on'] = None
        self.assertIsNone(Snapshot.model_validate(missing).current_index)
        for field in ('grid', 'time', 'index'):
            invalid = deepcopy(original)
            if field == 'grid': invalid['grid']['values'][0].pop()
            if field == 'time': invalid['forecast_for'] += timedelta(minutes=1)
            if field == 'index': invalid['current_index'] = float('nan')
            with self.assertRaises(ValidationError): Snapshot.model_validate(invalid)


if __name__ == '__main__':
    unittest.main()
