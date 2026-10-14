import test from 'node:test';
import assert from 'node:assert/strict';
import { controlReview } from '../src/controlReview.js';
const policy={warning:15,danger:22};
const prediction={status:'ok',prediction:25,lower:null,upper:null};
const evaluate=changes=>controlReview({current:10,prediction,policy,...changes});
test('C2 follows current while C3/C4 review forecast; input remains unchanged',()=>{
 const before=JSON.stringify(prediction),r=evaluate({});
 assert.equal(r.rows[1].fan,'강화 조건 미도달');assert.equal(r.rows[2].fan,'강화 검토');
 assert.equal(r.rows[3].fan,r.rows[2].fan);assert.equal(r.rows[3].scrubber,'배출측 가동 검토');
 assert.equal(JSON.stringify(prediction),before);assert.match(r.confidence,/구간 미제공/);
});
test('missing/error/negative/unavailable forecast blocks predictive decisions but not C2',()=>{
 for(const changes of [{prediction:null},{error:'timeout'},{prediction:{status:'unavailable',prediction:null}},{prediction:{status:'ok',prediction:-1}}]){
  const r=evaluate(changes);assert.equal(r.rows[2].fan,'판단 보류');assert.equal(r.rows[3].scrubber,'판단 보류');assert.equal(r.rows[1].fan,'강화 조건 미도달');
 }
});
test('missing current or policy never manufactures normal operation',()=>{
 for(const changes of [{current:null},{policy:null}]) assert.ok(evaluate(changes).rows.slice(1).every(r=>r.fan==='판단 보류'));
});
test('interval crossing requires review instead of declaring normal; boundary inclusive',()=>{
 const r=evaluate({prediction:{status:'ok',prediction:20,lower:18,upper:22}});
 assert.equal(r.rows[2].fan,'구간 경계 검토');assert.equal(r.rows[3].scrubber,'판단 보류');
 assert.equal(evaluate({current:22}).rows[1].fan,'강화 검토');
});
