import { BARN, HEATMAP } from './config.js';
const finite = v => typeof v === 'number' && Number.isFinite(v);
const id = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 120;
export const instant = v => typeof v === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) ? Date.parse(v) : NaN;
const fail = message => { throw new Error(message); };

export function validateTwin(input) {
  if (input?.schema_version !== 'twin-1' || !Array.isArray(input.series) || !input.series.length || input.series.length > 100) fail('twin-1 series는 1~100개 필요합니다.');
  const seen = new Set(); let total = 0;
  const series = input.series.map(s => {
    for (const key of ['dataset_id','dataset_version','farm_id','subject_id','label']) if (!id(s[key])) fail(`식별자 오류: ${key}`);
    const key = `${s.farm_id}/${s.subject_id}`;
    if (seen.has(key)) fail('중복 농장/관측 대상'); seen.add(key);
    if (!['ppm','relative_index'].includes(s.unit) || !['historical','synthetic_fixture'].includes(s.observation_source)) fail('단위/관측 출처 오류');
    if (!['farm','sensor'].includes(s.scope) || !['assumed','verified'].includes(s.position_basis)) fail('공간 범위/위치 근거 오류');
    if (!Array.isArray(s.position) || s.position.length !== 3 || !s.position.every(finite) || Math.abs(s.position[0]) > BARN.width/2 || s.position[1] < 0 || s.position[1] > BARN.height || Math.abs(s.position[2]) > BARN.length/2) fail('위치는 돈사 내부 [x,y,z] 좌표여야 합니다.');
    if (!Array.isArray(s.records) || !s.records.length || (total += s.records.length) > 20000) fail('총 관측 1~20,000행 필요');
    const times = new Set();
    const records = s.records.map(r => {
      const t = instant(r.observed_at);
      if (!Number.isFinite(t) || times.has(t)) fail('관측 시각 오류/중복'); times.add(t);
      if (!(r.nh3 === null || finite(r.nh3) && r.nh3 >= 0)) fail('NH3는 비음수 또는 null');
      const features = r.features ?? {};
      if (!features || typeof features !== 'object' || Array.isArray(features) || !Object.values(features).every(v => v === null || finite(v))) fail('입력 변수 오류');
      return {observed_at:new Date(t).toISOString(), nh3:r.nh3, features};
    }).sort((a,b) => Date.parse(a.observed_at)-Date.parse(b.observed_at));
    const p = s.policy;
    if (p !== null && (!p || ![p.min,p.max,p.warning,p.danger].every(finite) || !(p.min < p.max && p.min <= p.warning && p.warning < p.danger && p.danger <= p.max) || !id(p.basis) || typeof p.demo !== 'boolean')) fail('색상/위험 기준 오류. 미정이면 policy:null');
    if (s.observation_source === 'historical' && p?.demo) fail('실제 관측에는 합성 위험 기준을 적용할 수 없습니다.');
    return {...s, records};
  });
  return {schema_version:'twin-1',series};
}

export function makeTwinExample() {
  return validateTwin({schema_version:'twin-1',series:[
    {farm_id:'DEMO-A',subject_id:'farm-average',label:'돈사 전체 대표값',scope:'farm',position:[0,1.2,0]},
    {farm_id:'DEMO-B',subject_id:'sensor-1',label:'센서 1',scope:'sensor',position:[-3,1.2,-4]},
    {farm_id:'DEMO-B',subject_id:'sensor-2',label:'센서 2',scope:'sensor',position:[3,1.2,4]},
  ].map((s,j)=>({...s,dataset_id:'SYNTHETIC-TWIN',dataset_version:'1',unit:'ppm',observation_source:'synthetic_fixture',position_basis:'assumed',
    policy:{min:0,max:30,warning:15,danger:22,basis:'UI 시연용 임의 기준 · 안전 기준 아님',demo:true},
    records:[0,7,15,30,37,45,60].map((m,i)=>({observed_at:new Date(Date.UTC(2024,0,1,0,m)).toISOString(),nh3:j===2&&i===2?null:[10,14,18,24,20,15,11][i]+j,features:{}}))
  }))});
}

export function buildPredictionRequest(series, observedAt, model) {
  const t = Date.parse(observedAt);
  return {schema_version:'prediction-1',request_id:crypto.randomUUID(),
    ...Object.fromEntries(['dataset_id','dataset_version','farm_id','subject_id','observation_source','unit'].map(k=>[k,series[k]])),
    condition_id:model.condition,model_id:model.id,model_version:model.version,issued_at:observedAt,horizon_minutes:30,
    history:series.records.filter(r=>Date.parse(r.observed_at)<=t && Date.parse(r.observed_at)>=t-model.lookback*60000)};
}

export function validatePrediction(result, request) {
  for (const k of ['schema_version','request_id','dataset_id','dataset_version','farm_id','subject_id','condition_id','model_id','model_version','observation_source','unit','horizon_minutes']) if(result?.[k]!==request[k]) fail(`응답 불일치: ${k}`);
  if (instant(result.issued_at)!==instant(request.issued_at) || instant(result.target_at)!==instant(request.issued_at)+1800000) fail('예측 시각 불일치');
  if(result.generated_at !== null && !Number.isFinite(instant(result.generated_at))) fail('응답 생성 시각 오류');
  if(!['mock','model_output','synthetic_fixture'].includes(result.prediction_source) || !['ok','insufficient_input','unavailable'].includes(result.status)) fail('출처/상태 오류');
  if(result.status==='ok' ? !finite(result.prediction) : result.prediction!==null) fail('점예측/상태 오류');
  const fields=[result.lower,result.upper,result.nominal_coverage,result.interval_method];
  if(fields.some(v=>v!==null) && !(result.status==='ok' && finite(result.lower) && finite(result.upper) && result.lower<=result.upper && finite(result.nominal_coverage) && result.nominal_coverage>0 && result.nominal_coverage<1 && id(result.interval_method))) fail('예측구간 오류');
  return result;
}

export function riskView(value, policy, lower=null, upper=null) {
  if(value===null || !finite(value)) return {level:'값 없음',normalized:null,crossing:false};
  if(value<0) return {level:'음수 모델 출력 · 원본 확인',normalized:null,crossing:false};
  if(!policy) return {level:'기준 미설정',normalized:null,crossing:false};
  return {level:value>=policy.danger?'위험':value>=policy.warning?'주의':'낮음',
    normalized:Math.max(0,Math.min(1,(value-policy.min)/(policy.max-policy.min))),
    crossing:lower!==null && upper!==null && [policy.warning,policy.danger].some(v=>lower<v&&upper>=v)};
}
export function uniformGrid(value, scope) {
  return Array.from({length:HEATMAP.rows},()=>Array(HEATMAP.columns).fill(scope==='farm'?value:null));
}
export function knownTruth(series, targetAt, time) {
  if(instant(targetAt)>time) return null;
  return series.records.find(r=>instant(r.observed_at)===instant(targetAt))?.nh3 ?? null;
}
