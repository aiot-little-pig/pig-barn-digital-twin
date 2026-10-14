import SceneEnvironment from './SceneEnvironment.jsx';
import { RingGauge, IntervalWidget, RiskBadge } from './DataWidgets.jsx';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { Barn } from './Barn.jsx';
import ControlReview from './ControlReview.jsx';
import HeatmapFloor, { riskColor } from './HeatmapFloor.jsx';
import { VIEW } from './config.js';
import useReplayClock from './useReplayClock.js';
import useTwinPredictions from './useTwinPredictions.js';
import { instant, knownTruth, makeTwinExample, riskView, uniformGrid, validateTwin } from './twinData.js';

const fmt=v=>v==null?'—':v.toFixed(2);
const stamp=v=>new Date(v).toISOString().slice(0,19).replace('T',' ')+' UTC';
const DEFAULT_MODEL={id:'mock-persistence',version:'1',condition:'baseline',lookback:60,url:import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'};
function CameraFit(){
  const {camera,size,invalidate}=useThree();
  useLayoutEffect(()=>{camera.fov=Math.min(90,2*Math.atan(Math.tan(VIEW.fov*Math.PI/360)/Math.min(1,size.width/Math.max(1,size.height)))*180/Math.PI);camera.updateProjectionMatrix();invalidate();},[camera,size,invalidate]);
  return null;
}
function TwinScene({subjects,selected,onSelect,grid,risk,controls,portal}) {
  return <><SceneEnvironment/><CameraFit/>
    <Barn showLabels={false} showSensorFixtures={false} showPigs={false} frame={null}/>
    <HeatmapFloor values={grid} visible/>
    {subjects.map(s=><group key={s.subject_id} position={s.position}>
      <mesh onClick={e=>{e.stopPropagation();onSelect(s.subject_id);}}><sphereGeometry args={[s.subject_id===selected.subject_id?0.24:0.16,16,12]}/><meshStandardMaterial color={s.subject_id===selected.subject_id && risk.normalized!==null?riskColor(risk.normalized):'#64748b'}/></mesh>
      <Html portal={portal} position={[0,0.6,0]} center><button className="sensor-label" aria-pressed={s.subject_id===selected.subject_id} onClick={()=>onSelect(s.subject_id)}>{s.label}{s.position_basis==='assumed'?' · 가정':''}</button></Html>
    </group>)}
    <OrbitControls ref={controls} makeDefault target={VIEW.target} enablePan={false} minDistance={VIEW.minDistance} maxDistance={VIEW.maxDistance} minPolarAngle={0.1} maxPolarAngle={Math.PI/2-.15}/>
  </>;
}
function TimelineChart({series,forecasts,time,bounds}) {
  const obs=series.records.filter(r=>instant(r.observed_at)<=time);
  const values=[...obs.map(r=>r.nh3),...forecasts.flatMap(r=>[r.prediction,r.lower,r.upper])].filter(v=>v!==null);
  const min=Math.min(0,...values),max=Math.max(1,...values)*1.1;
  const x=t=>50+(t-bounds.start)/Math.max(1,bounds.end-bounds.start)*800,y=v=>200-(v-min)/(max-min)*165;
  return <svg viewBox="0 0 920 265" role="img" aria-label="같은 재생 시각의 관측·예측·예측구간">
    <text x="50" y="20">{series.unit} · 파랑 관측 / 민트 30분 예측 / 막대 예측구간 / 세로선 재생 시각</text>
    {[min,(min+max)/2,max].map(v=><g key={v}><line x1="50" x2="850" y1={y(v)} y2={y(v)} stroke="#26394d"/><text x="3" y={y(v)}>{fmt(v)}</text></g>)}
    {obs.filter(r=>r.nh3!==null).map(r=><circle key={r.observed_at} cx={x(instant(r.observed_at))} cy={y(r.nh3)} r="4" fill="#83b9ee"/>)}
    {forecasts.filter(r=>r.prediction!==null).map(r=><g key={r.issued_at}>{r.lower!==null&&<line x1={x(instant(r.target_at))} x2={x(instant(r.target_at))} y1={y(r.lower)} y2={y(r.upper)} stroke="#93bea9" strokeWidth="7"/>}<circle cx={x(instant(r.target_at))} cy={y(r.prediction)} r="4" fill="#3cddc2"/></g>)}
    <line x1={x(time)} x2={x(time)} y1="25" y2="205" stroke="#bd773b" strokeDasharray="4 4"/>
    <text x="50" y="235">{stamp(bounds.start)}</text><text x="850" y="235" textAnchor="end">{stamp(bounds.end)}</text>
  </svg>;
}

function TwinSession({bundle,series,onSelect,model}) {
  const bounds=useMemo(()=>({start:instant(series.records[0].observed_at),end:instant(series.records.at(-1).observed_at)+1800000}),[series]);
  const playback=useReplayClock(bounds),time=Math.max(bounds.start,playback.time);
  const [enabled,setEnabled]=useState(false),[layer,setLayer]=useState('prediction');
  const controls=useRef(),portal=useRef(),analysisDialog=useRef();
  const api=useTwinPredictions(series,time,model,enabled);
  const observed=series.records.filter(r=>instant(r.observed_at)<=time).at(-1);
  const entry=api.entries[observed.observed_at],result=entry?.result;
  const value=layer==='current'?observed.nh3:result?.prediction??null;
  const risk=riskView(value,series.policy,layer==='prediction'?result?.lower??null:null,layer==='prediction'?result?.upper??null:null);
  const grid=useMemo(()=>uniformGrid(risk.normalized,series.scope),[risk.normalized,series.scope]);
  const subjects=bundle.series.filter(s=>s.farm_id===series.farm_id);
  const forecasts=Object.values(api.entries).filter(v=>v.result&&instant(v.result.issued_at)<=time).map(v=>v.result).sort((a,b)=>instant(a.issued_at)-instant(b.issued_at));
  const resolved=forecasts.filter(r=>instant(r.target_at)<=time);
  const errors=Object.entries(api.entries).filter(([t,v])=>instant(t)<=time&&v.error);
  return <div className="live-workspace">
    <div className="metric-deck" aria-label="NH3 상태 위젯">
      <RingGauge label="현재 NH₃ 관측" value={observed.nh3} min={series.policy?.min} max={series.policy?.max} unit={series.unit} testId="twin-current" note={series.label}/>
      <RingGauge label="30분 후 예측" value={result?.prediction} min={series.policy?.min} max={series.policy?.max} unit={series.unit} testId="twin-prediction" tone="green" note={result?.prediction_source??'예측 미수신'}/>
      <IntervalWidget lower={result?.lower} upper={result?.upper} point={result?.prediction} coverage={result?.nominal_coverage} method={result?.interval_method} unit={series.unit}/>
      <RiskBadge risk={risk} layer={layer} demo={series.policy?.demo}/>
      <small className="widget-footnote">원형 채움: 설정 범위 내 위치 · 위험 확률 아님</small>
    </div>
    <div className="playback replay-transport">
      <button onClick={()=>setEnabled(v=>!v)}>{enabled?'API 조회 중지':'예측 API 연결'}</button>
      <button className="secondary" onClick={api.retry} disabled={!errors.length}>실패 예측 재시도</button>
      <button onClick={playback.toggle}>{playback.playing?'재생 정지':'시간 재생'}</button>
      <button className="secondary" onClick={()=>playback.seek(bounds.start)}>시각 초기화</button>
      <label>통합 재생 속도 <select value={playback.speed} onChange={e=>playback.setSpeed(Number(e.target.value))}>{[1,5,10,30].map(v=><option value={v} key={v}>1초당 {v}분</option>)}</select></label>
      <input aria-label="통합 Replay 시각" type="range" min="0" max={bounds.end-bounds.start} step="1000" value={time-bounds.start} onChange={e=>playback.seek(bounds.start+Number(e.target.value))}/>
      <span data-testid="twin-time">{stamp(time)}</span>
    </div>
    <div className="connection-strip">    <p>관측 출처: {series.observation_source} · 예측 출처: <b data-testid="twin-source">{result?.prediction_source??'미수신'}</b> · 데이터 {series.dataset_id}/{series.dataset_version}</p>
    <p role="status" data-testid="twin-status">{entry?.error??(result?.status==='insufficient_input'?'현재 입력 부족':result?.status==='unavailable'?'예측 제공 불가':api.loading?'기준 시각까지 예측 조회 중':result?'저장된 발행 예측 표시':enabled?'예측 대기':'API 미연결')} · 자동 합성 대체 없음</p>
    {errors.length>0&&<p role="alert">실패한 예측 {errors.length}건. API 서버·모델 설정을 확인하고 재시도하세요.</p>}
</div>
    <div className="workspace twin-workspace"><aside><details className="inspector"><summary>대상 정보 · 표시 설정</summary><p className="eyebrow">ASSET INSPECTOR</p>
      <h2>{series.label}</h2><p>{series.subject_id} · {series.unit}</p>
      <p>관측·예측 기준 {stamp(observed.observed_at)}<br/>대상 {stamp(instant(observed.observed_at)+1800000)}<br/>관측 이후 {((time-instant(observed.observed_at))/60000).toFixed(1)}분 · 보간 없음</p>
      <p>모델 {model.id}/{model.version} · 조건 {model.condition}</p>
      <p>목표 포함률 {result?.nominal_coverage==null?'미제공':`${result.nominal_coverage*100}%`} · {result?.interval_method??'구간 산출법 미제공'}</p>
      <label>표시 값 <select value={layer} onChange={e=>setLayer(e.target.value)}><option value="prediction">30분 예측</option><option value="current">현재 관측</option></select></label>
      <div className="risk-legend"><span>낮음</span><i/><span>높음</span></div>
      <p data-testid="twin-spatial">{series.scope==='farm'?'전체 대표값의 균일 바닥 표시 · 공간 분포 아님':'선택 센서 지점만 표시 · 바닥 분포 미계산'}<br/>위치: {series.position_basis==='assumed'?'배치 가정':'제공 좌표'} [{series.position.join(', ')}] m</p>
      <details><summary>위험 기준·색상 해석</summary><p>{series.policy?`${series.policy.basis} · 색상 ${series.policy.min}~${series.policy.max} ${series.unit}, 주의 ${series.policy.warning}, 위험 ${series.policy.danger}`:'위험 기준 미설정 · 숫자만 표시'}</p><p>회색은 결측·미수신·미설정입니다. 색상 포화는 원본 수치를 바꾸지 않습니다.</p></details>
      <div className="device-state"><span>환기팬 <b>이력 미제공</b></span><span>스크러버 <b>이력 미제공</b></span></div>
      <button className="secondary" onClick={()=>controls.current?.reset()}>내부 시점 초기화</button>
    </details></aside><section className="viewport" aria-label="관측·예측 통합 3D 돈사">
      <div className="viewport-heading"><div><span className="eyebrow">DIGITAL TWIN / INTERIOR</span><h2>{series.farm_id} <small>돈사 내부</small></h2></div><button className="secondary" onClick={()=>analysisDialog.current?.showModal()}>↗ 시계열 분석</button></div><div className="scene-tools"><button className="secondary" onClick={()=>controls.current?.reset()}>⌂ 기본 시점</button><button className="secondary" onClick={()=>{controls.current.object.position.set(0,32,.01);controls.current.target.set(0,0,0);controls.current.update();}}>⊞ 평면 보기</button><button className="secondary" onClick={()=>setLayer(v=>v==='current'?'prediction':'current')}>{layer==='current'?'현재 관측':'+30분 예측'} ⇄</button></div><div ref={portal} className="label-layer"/>
      <Canvas camera={{position:[18,19,22],fov:VIEW.fov}} dpr={[1,1.5]} frameloop="demand" fallback={<p>WebGL 지원 필요</p>}>
        <TwinScene subjects={subjects} selected={series} onSelect={onSelect} grid={grid} risk={risk} controls={controls} portal={portal}/>
      </Canvas><div className="scene-caption">{series.label} · {layer==='current'?'현재':'30분 예측'} {fmt(value)} {series.unit} · {risk.level}<br/>팬·스크러버 운전 이력 미제공 · 장치 상태 추정 안 함 · CFD 아님</div>
    </section></div>
    <dialog className="analysis-dialog" ref={analysisDialog}><div className="dialog-title"><h2>시간축 분석</h2><button className="secondary" onClick={()=>analysisDialog.current.close()}>닫기 ×</button></div><div className="comparison"><h2>시간축 관측·예측</h2><TimelineChart series={series} forecasts={forecasts} time={time} bounds={bounds}/></div>
    <div className="table-scroll"><table data-testid="twin-comparison"><caption>도달한 대상 시각의 비교 · 최근 5건 / {resolved.length}건</caption><thead><tr><th>발행 → 대상 UTC</th><th>당시 예측</th><th>실제</th><th>절대오차</th></tr></thead><tbody>{resolved.slice(-5).map(r=>{
      const actual=knownTruth(series,r.target_at,time);return <tr key={r.issued_at}><td>{stamp(r.issued_at)} → {stamp(r.target_at)}</td><td>{fmt(r.prediction)}</td><td>{actual===null?'관측 없음':fmt(actual)}</td><td>{actual===null||r.prediction===null?'—':fmt(Math.abs(actual-r.prediction))}</td></tr>;
    })}</tbody></table></div>
    <p>관측 파일의 정확한 대상 시각에서만 정답을 찾습니다. 되감아도 발행 예측을 다시 계산하지 않습니다. 전이 조건별 전체 성능 비교는 기존 예측 파일 화면을 이용하세요.</p>
    <ControlReview observed={observed} prediction={result} policy={series.policy} error={entry?.error} time={time}/>
    </dialog>
  </div>;
}

export default function TwinPanel() {
  const [bundle,setBundle]=useState(makeTwinExample),[selected,setSelected]=useState(0),[revision,setRevision]=useState(0),[error,setError]=useState('');
  const [draft,setDraft]=useState(DEFAULT_MODEL),[model,setModel]=useState(DEFAULT_MODEL);
  const [inbox,setInbox]=useState({dataset:'SENSOR-MOCK',version:'1'}),[receiving,setReceiving]=useState(false);
  const uploadId=useRef(0),series=bundle.series[selected];
  const selectSubject=subject=>{setSelected(bundle.series.findIndex(s=>s.farm_id===series.farm_id&&s.subject_id===subject));};
  async function upload(file){
    const id=++uploadId.current;if(!file)return;
    setRevision(v=>v+1);setError('');
    try{if(file.size>5*1024*1024)throw new Error('파일은 5MB 이하');const raw=await file.text();if(id!==uploadId.current)return;setBundle(validateTwin(JSON.parse(raw.replace(/^\uFEFF/,''))));setSelected(0);setRevision(v=>v+1);}
    catch(e){if(id===uploadId.current)setError(e.message);}
  }
  async function receive(){
    const id=++uploadId.current;setReceiving(true);setError('');
    try {
      const url=new URL('/api/v2/telemetry/bundle',model.url);
      url.search=new URLSearchParams({dataset_id:inbox.dataset,dataset_version:inbox.version}).toString();
      const response=await fetch(url,{signal:AbortSignal.timeout(8000),cache:'no-store'});
      if(!response.ok)throw new Error(`수신 기록 조회 실패 (${response.status}) · 데이터 ID/버전과 송신 여부 확인`);
      const next=validateTwin(await response.json());
      if(id!==uploadId.current)return;
      setBundle(next);setSelected(0);setRevision(v=>v+1);
    }catch(e){if(id===uploadId.current)setError(e.message);}
    finally{setReceiving(false);}
  }
  return <section className="twin-panel"><div className="section-heading"><div><p className="eyebrow">ENVIRONMENT OVERVIEW</p><h2>내부 환경 모니터링</h2></div><span className="source-tag">{series.observation_source==='synthetic_fixture'?'합성 시연 데이터':'역사 관측 데이터'}</span></div><details className="data-settings service-popover"><summary>관측 데이터 가져오기 · 배치 설정</summary>
    <p>입력은 현재·과거 관측만 사용합니다. ‘예측 API 연결’을 누르면 선택한 관측 대상의 이력을 아래 주소로 전송합니다. 합성 예시의 농장·센서·위치·위험 기준은 모두 시연 가정입니다.</p>
    <div className="playback"><label>관측·배치 JSON <input type="file" accept=".json" onChange={e=>{upload(e.target.files[0]);e.target.value='';}}/></label>
      <button className="secondary" onClick={()=>{++uploadId.current;setBundle(makeTwinExample());setSelected(0);setRevision(v=>v+1);setError('');}}>통합 합성 예시</button>
      <button className="secondary" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(makeTwinExample(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='twin-SYNTHETIC.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>관측·배치 예시 내려받기</button>
    </div>
    <div className="playback"><label>수신 데이터 ID<input value={inbox.dataset} onChange={e=>setInbox({...inbox,dataset:e.target.value})}/></label><label>버전<input value={inbox.version} onChange={e=>setInbox({...inbox,version:e.target.value})}/></label><button disabled={receiving} onClick={receive}>{receiving?'조회 중…':'센서 수신 기록 불러오기'}</button></div>
    <p>서버에 도착한 기록을 가져와 Replay합니다. 자동 실시간 구독이 아니며, 추가 수신분은 다시 불러오세요. 적용된 API 주소를 사용하고 새 기록 로드 후 예측 API를 다시 연결합니다.</p>
    <details><summary>돈사 구조 근거</summary><p>중앙집중 배기형 개념 배치 · 12×18 m 및 센서 위치는 설계 가정입니다.</p><p><a href="https://koreapork.or.kr/board/notice_view?Ncode=pignews&number=42057" target="_blank" rel="noreferrer">한돈혁신센터: 중앙 배기</a> · <a href="https://cdn.bigdutchman.com/fileadmin/content/pig/products/en/Pig-production-Air-cleaning-Porcus-Big-Dutchman-en.pdf#page=2" target="_blank" rel="noreferrer">스크러버 단면도: 하부 유입·상향 통과</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10416980/#sec2-animals-13-02451" target="_blank" rel="noreferrer">국내 연구 돈사 구조 비교</a></p></details>
    </details><details className="connection-settings service-popover"><summary>예측 연결 설정</summary><div className="playback">{[['url','API 주소'],['id','모델 ID'],['version','모델 버전'],['condition','모델 조건'],['lookback','입력 이력(분)']].map(([key,label])=><label key={key}>{label}<input value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
      <button onClick={()=>{try{const url=new URL(draft.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('인증정보 없는 HTTP(S) API 기본 주소 필요');if(!['id','version','condition'].every(k=>draft[k].trim().length>0&&draft[k].length<=120)||!Number.isFinite(Number(draft.lookback))||Number(draft.lookback)<=0)throw new Error('모델 식별자·입력 이력 확인');setModel({...draft,lookback:Number(draft.lookback)});setRevision(v=>v+1);setError('');}catch(e){setError(e.message);}}}>설정 적용</button>
    </div></details>
    {error&&<p role="alert">입력 오류: {error} · 기존 데이터 유지, API 재연결 필요</p>}
    <div className="playback asset-select"><label>통합 농장 <select value={series.farm_id} onChange={e=>setSelected(bundle.series.findIndex(s=>s.farm_id===e.target.value))}>{[...new Set(bundle.series.map(s=>s.farm_id))].map(id=><option key={id}>{id}</option>)}</select></label>
      <label>관측 대상 <select value={series.subject_id} onChange={e=>selectSubject(e.target.value)}>{bundle.series.filter(s=>s.farm_id===series.farm_id).map(s=><option key={s.subject_id} value={s.subject_id}>{s.label}</option>)}</select></label>
    </div>
    <TwinSession key={`${revision}/${selected}`} bundle={bundle} series={series} onSelect={selectSubject} model={model}/>
  </section>;
}
