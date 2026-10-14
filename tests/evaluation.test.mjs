import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWindow } from '../src/evaluationData.js';
import { makeReplayExample, validateReplay } from '../src/replayData.js';
import { visibleReplay } from '../src/replayClock.js';
const fixture=()=>validateReplay(makeReplayExample());
test('common evaluation computes baseline delta and interval coverage',()=>{
 const r=fixture().records,m=evaluateWindow(r,['before','after'],0,Date.now(),'before');
 assert.equal(m[0].count,10);assert.ok(Math.abs(m[1].deltaMae+.04)<1e-9);
 assert.equal(m[0].coverage,0);assert.equal(m[1].coverage,1);
});
test('window retains an absent selected condition and exposes excluded samples',()=>{
 const r=fixture().records.filter(r=>r.condition_id==='before');
 const m=evaluateWindow(r,['before','after'],0,Date.now(),'before');
 assert.equal(m[0].count,0);assert.equal(m[0].excluded,10);assert.equal(m[1].candidates,0);
});
test('Replay evaluation never reveals future actuals; interval N excludes missing bounds',()=>{
 const r=fixture().records,t=Date.parse(r[0].target_at);
 assert.equal(evaluateWindow(visibleReplay(r,t-1,false),['before','after'],0,t,'before')[0].count,0);
 r[1].lower=null;r[1].upper=null;
 const m=evaluateWindow(visibleReplay(r,t,false),['before','after'],t,t,'before');
 assert.equal(m[0].count,1);assert.equal(m[0].intervalCount,0);
});
test('reject mixed farms, reversed dates and mixed model versions',()=>{
 const f=fixture();f.records[2].model_version='other';assert.throws(()=>validateReplay(f),/버전/);
 assert.throws(()=>evaluateWindow(f.records,[],3,2,''),/시각/);
 f.records[0].farm_id='another';assert.throws(()=>evaluateWindow(f.records,[],0,3,''),/농장/);
});
