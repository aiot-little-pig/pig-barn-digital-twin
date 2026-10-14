import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReplayExample, replayMetrics, validateReplay } from '../src/replayData.js';

test('과거 기록을 신선도 오류 없이 수용하고 단위·출처·순서를 보존', () => {
  const raw = makeReplayExample(); raw.records.reverse(); raw.unit = 'ppm';
  const data = validateReplay(raw);
  assert.equal(data.records.length, 20); assert.equal(data.unit, 'ppm');
  assert.equal(data.records[0].observed_at, '2024-01-01T00:00:00.000Z');
  assert.equal(data.source, 'synthetic_fixture');
});
test('합성 예시 지표를 독립적인 예상값과 비교', () => {
  const [before, after] = replayMetrics(validateReplay(makeReplayExample()).records);
  assert.equal(before.count, 10); assert.equal(before.intervalCount, 10);
  assert.ok(Math.abs(before.mae - 0.06) < 1e-12);
  assert.ok(Math.abs(after.rmse - 0.02) < 1e-12);
  assert.equal(before.coverage, 0); assert.equal(after.coverage, 1);
  assert.ok(Math.abs(after.width - 0.1) < 1e-12);
});
test('비교는 공통 유효 시각만 사용하고 결측·구간 미제공을 0점으로 만들지 않는다', () => {
  const raw = makeReplayExample();
  raw.records[0].prediction = null;
  raw.records[3].lower = null; raw.records[3].upper = null;
  const results = replayMetrics(validateReplay(raw).records);
  assert.ok(results.every(m => m.count === 9 && m.intervalCount === 8));
  for (const r of raw.records) r.actual = null;
  assert.ok(replayMetrics(validateReplay(raw).records).every(m => m.count === 0 && m.mae === null && m.coverage === null));
});
test('중복·시간대/간격·구간·실제값 불일치·모델 혼합 검출', () => {
  for (const edit of [
    d => d.records.push({ ...d.records[0] }),
    d => d.records[0].observed_at = '2024-01-01T00:00:00',
    d => d.records[0].target_at = d.records[0].observed_at,
    d => d.records[0].lower = d.records[0].upper + 1,
    d => d.records[0].upper = null,
    d => d.records[1].actual += 1,
    d => d.records[2].model_id = 'DIFFERENT',
    d => d.records[0].prediction = '0.3',
    d => d.nominal_coverage = 90,
    d => d.unit = 'unknown',
  ]) {
    const raw = makeReplayExample(); edit(raw);
    assert.throws(() => validateReplay(raw));
  }
});
test('동일 순간의 다른 시간대 표기는 정규화하여 중복 검출', () => {
  const raw = makeReplayExample();
  raw.records.push({ ...raw.records[0], observed_at: '2024-01-01T09:00:00+09:00', target_at: '2024-01-01T09:30:00+09:00' });
  assert.throws(() => validateReplay(raw), /중복/);
});
