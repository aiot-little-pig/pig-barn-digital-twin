import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTwinExample, validateTwin, buildPredictionRequest, validatePrediction, riskView, uniformGrid, knownTruth, instant } from '../src/twinData.js';

test('농장·대상 예시의 범위와 시각을 검증하고 정렬한다',()=>{
  const bundle=makeTwinExample();assert.equal(bundle.series.length,3);
  bundle.series[0].records.reverse();
  assert.equal(validateTwin(bundle).series[0].records[0].observed_at,'2024-01-01T00:00:00.000Z');
  for(const edit of [b=>b.series.push(b.series[0]),b=>b.series[0].position=[99,0,0],b=>b.series[0].unit='unknown',b=>b.series[0].records[0].nh3=-1,b=>b.series[0].records.push(b.series[0].records[0]),b=>b.series[0].policy.danger=1,b=>b.series[0].observation_source='historical']){
    const b=makeTwinExample();edit(b);assert.throws(()=>validateTwin(b));
  }
});
test('모델 입력에는 해당 대상의 기준 시각 이하 이력만 포함한다',()=>{
  const s=makeTwinExample().series[0],model={id:'mock-persistence',version:'1',condition:'baseline',lookback:10};
  const request=buildPredictionRequest(s,s.records[2].observed_at,model);
  assert.deepEqual(request.history.map(r=>r.nh3),[14,18]);
  assert.equal(request.horizon_minutes,30);assert.equal(request.subject_id,'farm-average');
  assert.ok(!JSON.stringify(request).includes('actual'));
});
const makeResponse=q=>({...Object.fromEntries(Object.entries(q).filter(([k])=>k!=='history')),prediction_source:'mock',target_at:new Date(instant(q.issued_at)+1800000).toISOString(),generated_at:null,status:'ok',prediction:10,lower:null,upper:null,nominal_coverage:null,interval_method:null});
test('예측 응답의 시각·농장·단위·요청 ID가 다르면 거부한다',()=>{
  const s=makeTwinExample().series[0],q=buildPredictionRequest(s,s.records[0].observed_at,{id:'mock-persistence',version:'1',condition:'baseline',lookback:60});
  assert.equal(validatePrediction(makeResponse(q),q).prediction,10);
  for(const change of [{farm_id:'other'},{request_id:'late'},{unit:'relative_index'},{target_at:q.issued_at},{prediction:NaN},{lower:3},{status:'insufficient_input'}])assert.throws(()=>validatePrediction({...makeResponse(q),...change},q));
  assert.equal(validatePrediction({...makeResponse(q),lower:-1,upper:20,nominal_coverage:.9,interval_method:'test-only'},q).lower,-1);
});
test('위험 기준 없으면 숫자만 유지하며 위험등급을 만들지 않는다',()=>{
  assert.deepEqual(riskView(20,null),{level:'기준 미설정',normalized:null,crossing:false});
  assert.equal(riskView(null,makeTwinExample().series[0].policy).level,'값 없음');
  assert.equal(riskView(-1,makeTwinExample().series[0].policy).normalized,null);
});
test('구간 경계 통과와 색상 포화는 원본 농도를 바꾸지 않는다',()=>{
  const policy=makeTwinExample().series[0].policy;
  assert.equal(riskView(20,policy,18,25).crossing,true);
  assert.equal(riskView(20,policy).level,'주의');assert.equal(riskView(60,policy).normalized,1);
});
test('농장 대표값만 균일 바닥 표시하고 센서값은 바닥에 복제하지 않는다',()=>{
  assert.ok(uniformGrid(.5,'farm').flat().every(v=>v===.5));
  assert.ok(uniformGrid(.5,'sensor').flat().every(v=>v===null));
});
test('정답은 대상 시각 도달 이후 정확히 일치하는 관측만 사용한다',()=>{
  const s=makeTwinExample().series[0],target=s.records[3].observed_at,t=instant(target);
  assert.equal(knownTruth(s,target,t-1),null);assert.equal(knownTruth(s,target,t),24);
  assert.equal(knownTruth(s,new Date(t+1000).toISOString(),t+1000),null);
  assert.equal(knownTruth(s,target,t-1),null);
});
