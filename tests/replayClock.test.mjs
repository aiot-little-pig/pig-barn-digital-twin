import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceReplay, latestIssued, replayBounds, resolvedComparisons, visibleReplay } from '../src/replayClock.js';
import { makeReplayExample, replayMetrics, validateReplay } from '../src/replayData.js';

const records = validateReplay(makeReplayExample()).records;
const start = Date.parse(records[0].observed_at);
const at = minutes => start + minutes * 60000;

test('재생은 행 수가 아닌 실제 경과 시간·배속으로 움직이고 마지막 정답까지 도달한다', () => {
  assert.deepEqual(replayBounds(records), {start, end:at(120)});
  assert.equal(advanceReplay(start, 250, 5, at(120)), at(1.25));
  assert.equal(advanceReplay(at(119), 1000, 5, at(120)), at(120));
  assert.throws(() => advanceReplay(start, -1, 5, at(120)));
});
test('예측은 발행 시각, 실제값은 정확히 목표 시각부터 공개한다', () => {
  const before = visibleReplay(records, at(30)-1);
  assert.equal(before[0].actual, null);
  assert.equal(before[0].prediction, records[0].prediction);
  assert.equal(before[6].prediction, null); // issue minute 30
  const boundary = visibleReplay(records, at(30));
  assert.equal(boundary[0].actual, records[0].actual);
  assert.equal(boundary[6].prediction, records[6].prediction);
  assert.equal(boundary[6].actual, null);
});
test('되감기 시 정답·지표를 숨기며 원본 예측을 변경하지 않는다', () => {
  const original = JSON.stringify(records);
  assert.equal(replayMetrics(visibleReplay(records, at(60)))[0].count, 4);
  const rewind = visibleReplay(records, at(10));
  assert.equal(replayMetrics(rewind)[0].count, 0);
  assert.equal(replayMetrics(rewind)[0].mae, null);
  assert.equal(JSON.stringify(records), original);
  assert.equal(rewind[0].prediction, records[0].prediction);
});
test('전체 사후 평가에서만 미래 정답을 포함한다', () => {
  const full = visibleReplay(records, start, true);
  assert.equal(replayMetrics(full)[0].count, 10);
  assert.equal(replayMetrics(visibleReplay(records, start))[0].count, 0);
});
test('불규칙 기록에서도 정답 시각을 근접 행으로 대체하지 않는다', () => {
  const irregular = [records[0], {...records[2], observed_at:new Date(at(7)).toISOString(), target_at:new Date(at(37)).toISOString()}];
  assert.equal(resolvedComparisons(visibleReplay(irregular, at(36)), at(36)).length, 1);
  assert.equal(resolvedComparisons(visibleReplay(irregular, at(37)), at(37)).length, 2);
  assert.equal(latestIssued(irregular, at(6)), irregular[0]);
  assert.equal(latestIssued(irregular, at(7)), irregular[1]);
});
test('정답 결측은 평가에서 제외하고 구간 미제공은 포함 여부를 생성하지 않는다', () => {
  const missing = [{...records[0], actual:null}, {...records[2], lower:null, upper:null}];
  const resolved = resolvedComparisons(missing, at(60));
  assert.equal(resolved[0].absoluteError, null);
  assert.equal(resolved[0].included, null);
  assert.equal(resolved[1].included, null);
  assert.ok(Math.abs(resolved[1].absoluteError-.06) < 1e-10);
});
test('미래 예측과 실제값은 그래프 입력에도 남지 않는다', () => {
  const view = visibleReplay(records, start);
  assert.equal(view.filter(r => r.actual !== null).length, 0);
  for (const field of ['current','prediction','lower','upper','actual']) assert.equal(view[2][field], null);
});
test('이전 예측의 실제값과 같은 시각의 현재 관측값이 다르면 파일을 거부한다', () => {
  const inconsistent = makeReplayExample();
  inconsistent.records[6].current = 8;
  inconsistent.records[7].current = 8;
  assert.throws(() => validateReplay(inconsistent), /현재값·실제값 불일치/);
});
