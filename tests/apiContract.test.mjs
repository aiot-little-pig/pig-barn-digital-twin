import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot, frameFromSnapshot, snapshotIsStale, API } from '../src/apiContract.js';
import { BARN } from '../src/config.js';

const now = Date.parse('2026-10-07T00:00:00Z');
const fixture = () => ({
  schema_version: '1.0', source: 'synthetic-replay', scenario: 'C3', simulation_minute: 11,
  generated_at: new Date(now).toISOString(), data_at: new Date(now).toISOString(),
  forecast_for: new Date(now + 30 * 60000).toISOString(), horizon_minutes: 30,
  unit: 'relative_index', normalization: 'demo-index-v1;heatmap-clipped-0-1',
  current_index: 1.2, predicted_index: null,
  grid: { width_m: BARN.width, length_m: BARN.length, rows: 2, columns: 2,
    coordinates: 'center-origin:column=+X,row=+Z', meaning: 'current_relative_index', values: [[0, null], [0.5, 1]] },
  actuators: { pwm_percent: null, rpm: null, scrubber_on: null }, reason: '모의 데이터',
});
const check = d => validateSnapshot(d, 'C3', 11, now);

test('API의 결측과 1 초과 원지수를 보존하고 장치 미확인을 OFF로 바꾸지 않는다', () => {
  const data = check(fixture());
  assert.equal(data.grid.values[0][1], null);
  const frame = frameFromSnapshot(data);
  assert.equal(frame.current, 1.2);
  assert.equal(frame.predicted, null);
  assert.equal(frame.scrubberOn, null);
});
test('단위·좌표·공간 크기·시나리오·시간이 다른 응답 거부', () => {
  for (const mutate of [d => d.unit = 'ppm', d => d.source = 'real-ai', d => d.scenario = 'C4',
    d => d.simulation_minute = 10, d => d.grid.width_m += 1, d => d.grid.coordinates = 'row=+X',
    d => d.grid.meaning = 'forecast', d => d.grid.rows = 1, d => d.grid.values[0].pop(),
    d => d.grid.values[0][0] = 1.1, d => d.actuators.pwm_percent = 101,
    d => d.actuators.scrubber_on = 'false', d => d.current_index = undefined]) {
    const data = fixture(); mutate(data); assert.throws(() => check(data));
  }
});
test('데이터 시각으로 신선도 판정, 생성 시각만 갱신해도 오래된 데이터 감지', () => {
  const data = check(fixture());
  assert.equal(snapshotIsStale(data, now + API.staleMs), false);
  assert.equal(snapshotIsStale(data, now + API.staleMs + 1), true);
  data.generated_at = new Date(now + 60000).toISOString();
  assert.equal(snapshotIsStale(data, now + 60000), true);
});
test('미래 생성 시각·시간대 누락·예측 간격 오류 거부', () => {
  for (const mutate of [d => d.generated_at = new Date(now + API.futureToleranceMs + 1).toISOString(),
    d => d.data_at = '2026-10-07T00:00:00', d => d.forecast_for = d.data_at,
    d => d.horizon_minutes = 0]) {
    const data = fixture(); mutate(data); assert.throws(() => check(data));
  }
});
