import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateScenario, integrateIndex, frameAt } from '../src/simulation.js';
import { SIMULATION as P } from '../src/config.js';
import { createScenarioGrid, validateGrid } from '../src/heatmapData.js';
const runs = Object.fromEntries(['C1', 'C2', 'C3', 'C4'].map(id => [id, simulateScenario(id)]));

test('공통 초기조건·오염원과 C1 무환기 축적', () => {
  for (const r of Object.values(runs)) {
    assert.equal(r.frames[0].current, P.initialIndex);
    assert.deepEqual(r.frames.map(f => f.source), runs.C1.frames.map(f => f.source));
    assert(r.frames.every(f => Number.isFinite(f.current) && f.current >= 0));
  }
  assert(runs.C1.frames.every(f => f.pwm === 0 && !f.scrubberOn));
  assert(runs.C1.frames.every((f, i, a) => i === 0 || f.current >= a[i - 1].current));
  const final = P.initialIndex + P.activeSource * (P.sourceEnd - P.sourceStart)
    + P.backgroundSource * (P.durationMinutes - P.sourceEnd + P.sourceStart);
  assert(Math.abs(runs.C1.frames.at(-1).current - final) < 1e-10);
});
test('C2는 현재 기준 이후, C3는 이전에 HIGH 전환', () => {
  const c2 = runs.C2.frames.find(f => f.high), c3 = runs.C3.frames.find(f => f.high);
  assert(c2.current >= P.triggerIndex);
  assert(c3.current < P.triggerIndex && c3.predicted >= P.triggerIndex);
  assert(c3.time < c2.time);
  assert(runs.C3.metrics.peak < runs.C2.metrics.peak);
  assert(runs.C3.metrics.exposure < runs.C2.metrics.exposure);
});
test('C4는 C3와 같은 실내·팬 궤적, 배출측에서만 저감', () => {
  assert.deepEqual(runs.C3.frames.map(f => f.current), runs.C4.frames.map(f => f.current));
  assert.deepEqual(runs.C3.frames.map(f => f.pwm), runs.C4.frames.map(f => f.pwm));
  assert(runs.C4.metrics.emitted < runs.C3.metrics.emitted);
  const off = simulateScenario('C4', { ...P, scrubberEfficiency: 0 });
  assert.equal(off.metrics.emitted, runs.C3.metrics.emitted);
  assert(runs.C4.frames.every(f => f.scrubberOn === f.high));
});
test('최소 유지시간과 결정론적 되감기', () => {
  for (const id of ['C2', 'C3', 'C4']) {
    let started = null;
    for (const e of runs[id].events) {
      if (e.action === '팬 HIGH') started = e.time;
      if (e.action === '팬 BASE') assert(e.time - started >= P.minimumHoldMinutes);
    }
    assert.deepEqual(simulateScenario(id), runs[id]);
    assert.equal(frameAt(runs[id], -10).time, 0);
    assert.equal(frameAt(runs[id], 999).time, P.durationMinutes);
    assert.equal(frameAt(runs[id], 25.8).time, 25);
  }
});
test('발생량·실내 축적·배출의 수지 보존', () => {
  const generated = P.activeSource * (P.sourceEnd - P.sourceStart)
    + P.backgroundSource * (P.durationMinutes - P.sourceEnd + P.sourceStart);
  for (const id of ['C1', 'C2', 'C3'])
    assert(Math.abs(P.initialIndex + generated - runs[id].frames.at(-1).current - runs[id].metrics.emitted) < 1e-9);
  assert(Math.abs(integrateIndex(1, 0, 0.1, 10) - Math.exp(-1)) < 1e-12);
});
test('공간 시각화의 포화·결측 검사와 잘못된 시간 설정 거부', () => {
  assert(createScenarioGrid(0).flat().every(v => v === 0));
  assert(createScenarioGrid(2).flat().every(v => v === 1));
  assert.doesNotThrow(() => validateGrid(createScenarioGrid(0.5)));
  assert.doesNotThrow(() => validateGrid([[0, null], [0.5, 1]]));
  assert.throws(() => validateGrid([[NaN]]));
  assert.throws(() => simulateScenario('C5'));
  assert.throws(() => simulateScenario('C3', { ...P, stepMinutes: 3 }));
});
