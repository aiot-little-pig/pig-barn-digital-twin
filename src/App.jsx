import SceneEnvironment from './SceneEnvironment.jsx';
import { RingGauge, FanGauge, DeviceBadge } from './DataWidgets.jsx';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Barn } from './Barn.jsx';
import HeatmapFloor, { riskColor } from './HeatmapFloor.jsx';
import { createScenarioGrid } from './heatmapData.js';
import { simulateScenario, frameAt } from './simulation.js';
import ScenarioChart from './ScenarioChart.jsx';
import ReplayPanel from './ReplayPanel.jsx';
import TwinPanel from './TwinPanel.jsx';
import useApiSnapshot from './useApiSnapshot.js';
import { frameFromSnapshot } from './apiContract.js';
import { BARN, DEMO_SOURCE, HEATMAP, SCENARIOS, SIMULATION as P, VIEW } from './config.js';

const MISSING_GRID = Array.from({ length: HEATMAP.rows }, () => Array(HEATMAP.columns).fill(null));
const UNKNOWN_FRAME = { current: null, predicted: null, pwm: null, rpm: null, scrubberOn: null, detected: false, reason: '서버의 유효한 데이터를 기다리는 중' };
const formatIndex = value => value === null ? '—' : value.toFixed(3);

function ResponsiveCamera() {
  const { camera, size, invalidate } = useThree();
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    camera.fov = Math.min(90, 2 * Math.atan(Math.tan(VIEW.fov * Math.PI / 360) / Math.min(1, aspect)) * 180 / Math.PI);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);
  return null;
}
function SourceMarker({ detected }) {
  return <group visible={detected} position={[BARN.width * DEMO_SOURCE.xRatio, 0.06, BARN.length * DEMO_SOURCE.zRatio]}>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * 0.8, 0, 0]}><boxGeometry args={[0.045, 0.035, 1.6]} /><meshBasicMaterial color="#382923" /></mesh>
      <mesh position={[0, 0, side * 0.8]}><boxGeometry args={[1.6, 0.035, 0.045]} /><meshBasicMaterial color="#382923" /></mesh>
    </group>)}
  </group>;
}
function FarmScene({ showLabels, showHeatmap, showEnvelope, showPigs, values, controlsRef, labelPortal, frame, playing }) {
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => { invalidate(); }, [showEnvelope, showPigs, showLabels, frame, playing, invalidate]);
  return <>
    <SceneEnvironment />
    <ResponsiveCamera />
    <Barn showLabels={showLabels} labelPortal={labelPortal} showEnvelope={showEnvelope} showPigs={showPigs} frame={frame} playing={playing} />
    <HeatmapFloor values={values} visible={showHeatmap} /><SourceMarker detected={frame.detected} />
    <OrbitControls ref={controlsRef} makeDefault target={VIEW.target} enablePan={false}
      minDistance={VIEW.minDistance} maxDistance={VIEW.maxDistance} minPolarAngle={0.1} maxPolarAngle={Math.PI / 2 - 0.15} />
  </>;
}

export default function App() {
  const [mode, setMode] = useState('twin');
  const [hudVisible, setHudVisible] = useState(true);
  const [scenario, setScenario] = useState('C3');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(P.defaultPlaybackSpeed);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showEnvelope, setShowEnvelope] = useState(false);
  const [showPigs, setShowPigs] = useState(true);
  const controlsRef = useRef(null), labelPortal = useRef(null);
  const runs = useMemo(() => Object.fromEntries(SCENARIOS.map(s => [s.id, simulateScenario(s.id)])), []);
  const run = runs[scenario], localFrame = frameAt(run, time);
  const serverMode = mode === 'api';
  const api = useApiSnapshot(serverMode, scenario, localFrame.time);
  const usable = !!api.data && !api.stale && !api.error;
  const frame = serverMode ? (usable ? frameFromSnapshot(api.data) : UNKNOWN_FRAME) : localFrame;
  const localValues = useMemo(() => createScenarioGrid(localFrame.current), [localFrame.current]);
  const values = serverMode ? (usable ? api.data.grid.values : MISSING_GRID) : localValues;
  const missingCount = values.flat().filter(v => v === null).length;
  const events = run.events.filter(e => e.time <= frame.time).slice(-6);
  const gradient = Array.from({ length: 21 }, (_, i) => `#${riskColor(i / 20).getHexString()} ${i * 5}%`).join(', ');

  useEffect(() => {
    if (!playing) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), elapsed = (now - previous) / 1000;
      previous = now;
      setTime(t => Math.min(P.durationMinutes, t + elapsed * speed));
    }, 100);
    return () => clearInterval(timer);
  }, [playing, speed]);
  useEffect(() => { if (time >= P.durationMinutes) setPlaying(false); }, [time]);
  useEffect(() => {
    const pauseHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pauseHidden);
    return () => document.removeEventListener('visibilitychange', pauseHidden);
  }, []);
  const chooseScenario = id => { setPlaying(false); setTime(0); setScenario(id); };
  const seek = value => { setPlaying(false); setTime(Number(value)); };

  return <main className={`app-shell mode-${mode} ${hudVisible ? '' : 'hud-hidden'}`}>
    <nav className="app-rail" aria-label="작업 공간"><div className="brand-mark">AD<span>아기데지</span></div>{[['twin','◈','디지털트윈'],['file','▥','모델 검증'],['local','⊞','제어 시나리오'],['api','⇄','API 모니터']].map(([id,icon,label])=><button key={id} aria-pressed={mode===id} onClick={()=>{setPlaying(false);setMode(id);}}><i>{icon}</i>{label}</button>)}<small>INTERNAL<br/>CLOSED LOOP</small></nav>
    {mode !== 'file' && <button className="hud-toggle" aria-label="플로팅 패널 표시" aria-pressed={hudVisible} onClick={()=>setHudVisible(v=>!v)}>{hudVisible ? '접기' : '패널'}</button>}
    <header><div><p className="eyebrow">BARN INTELLIGENCE / 아기데지</p><h1>돈사 디지털트윈</h1></div><span className="badge">REPLAY WORKSPACE · 실물 제어 없음</span></header>
    <section className="data-source" aria-label="데이터 연결">
      <label>데이터 모드 <select value={mode} onChange={e => { setPlaying(false); setMode(e.target.value); }}>
        <option value="local">브라우저 합성 재생</option><option value="api">FastAPI 합성 재생</option><option value="twin">관측·예측 3D 통합</option><option value="file">예측 결과 파일</option>
      </select></label>
      <p role="status" data-testid="api-status">{mode === 'twin' ? '관측과 Predictor API를 같은 시각으로 표시 · 실물 장치 제어 없음' : mode === 'file' ? '로컬 파일 시간순 Replay / 사후 평가 · 실시간 제어와 분리' : !serverMode ? '브라우저에서 계산 · 실제 AI/센서 미연결' : api.error ? `연결/데이터 오류 · ${api.error} · 자동 재시도 중` : api.stale ? '오래된 데이터 · 지수와 장치 상태 표시 중단' : !usable ? '서버 응답 대기 중' : 'FastAPI 연결 정상 · synthetic-replay · 실제 AI/센서 미연결'}</p>
      {serverMode && <small>서버 재생 결과를 읽기만 합니다. 실물 장치에 제어 명령을 보내지 않습니다.
        {usable && <> 수신 데이터 시각: {new Date(api.data.data_at).toLocaleTimeString('ko-KR')} · 예측 간격 {api.data.horizon_minutes}분</>}
      </small>}
    </section>
    {mode === 'twin' ? <TwinPanel /> : mode === 'file' ? <ReplayPanel /> : <>
    <nav className="scenario-tabs" aria-label="시나리오 선택">{SCENARIOS.map(s =>
      <button key={s.id} aria-pressed={scenario === s.id} onClick={() => chooseScenario(s.id)}><b>{s.id}</b><span>{s.title}</span></button>)}</nav>
    <div className="playback">
      <button onClick={() => { if (time >= P.durationMinutes) setTime(0); setPlaying(v => !v); }}>{playing ? '일시정지' : time >= P.durationMinutes ? '다시 재생' : '재생'}</button>
      <button className="secondary" onClick={() => { setPlaying(false); setTime(0); }}>실험 초기화</button>
      <label>재생 속도 <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[1, 2, 5, 10].map(v => <option key={v} value={v}>{v}분/초</option>)}</select></label>
      <label className="timeline">모의 시간 <input aria-label="모의 시간" type="range" min="0" max={P.durationMinutes} step={P.stepMinutes} value={time} onChange={e => seek(e.target.value)} /></label>
      <output data-testid="simulation-time">{localFrame.time} / {P.durationMinutes}분</output>
    </div>
    <div className="workspace"><aside>
      <p className="eyebrow">{scenario} / {playing ? '재생 중' : '일시정지'}</p><h2>{SCENARIOS.find(s => s.id === scenario).title}</h2>
      <div className="synthetic-widgets">
        <RingGauge label="현재 실내 지수" value={frame.current} min={0} max={1} unit="상대지수" digits={3} testId="current-index" note="합성 표시 범위 0–1"/>
        <RingGauge label="30분 모의 예측" value={frame.predicted} min={0} max={1} unit="상대지수" digits={3} testId="forecast-index" tone="green" note="학습 AI 예측 아님"/>
        <FanGauge pwm={frame.pwm} rpm={frame.rpm}/><DeviceBadge on={frame.scrubberOn}/>
      </div>
      <p className="widget-footnote">합성 오염원: {serverMode ? '탐지 정보 미제공' : frame.detected ? '탐지 / 고발생' : '기본 발생'}</p>
      <p className="control-reason">{frame.reason}</p>
      <p className="coordinate">예측은 {scenario === 'C1' ? '환기 OFF' : '기본 환기'}와 현재 발생 강도 유지 가정입니다. 실제 AI·ppm·안전기준이 아닙니다.</p>
      <div className="options">
        <label><input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} />바닥 히트맵 표시</label>
        <label><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />공간 이름 표시</label>
        <label><input type="checkbox" checked={showEnvelope} onChange={e => setShowEnvelope(e.target.checked)} />지붕·외벽 닫아 보기</label>
        <label><input type="checkbox" checked={showPigs} onChange={e => setShowPigs(e.target.checked)} />참고용 돼지 표시</label>
        <button className="secondary" onClick={() => controlsRef.current?.reset()}>시점 초기화 ↗</button>
      </div>
      <div className="legend"><div className="color-bar" style={{ background: `linear-gradient(to right, ${gradient})` }} /><div className="legend-ticks"><span>0 낮음</span><span>0.5</span><span>≥1 높음</span></div><p>공간 배분은 시각화 가정 · 1 이상 색상 포화<br />반투명 레이어이므로 바닥색과 혼합됩니다.<br /><span data-testid="missing-count">회색: 결측/사용 불가 {missingCount}셀</span></p></div>
      <div className="note"><strong>비교 조건을 동일하게 유지</strong><p>초기 지수 {P.initialIndex} · {P.sourceStart}~{P.sourceEnd}분 고발생<br />진입 {P.triggerIndex} / 해제 {P.releaseIndex} (시연용)<br />팬 회전은 감속 표시합니다.</p></div>
    </aside><section className="viewport" aria-label="돈사 내부 3D 위험도 히트맵">
      <div ref={labelPortal} className="label-layer" />
      <Canvas camera={{ position: VIEW.cameraPosition, fov: VIEW.fov }} dpr={[1, 1.5]} frameloop="demand" fallback={<p>WebGL을 지원하는 브라우저가 필요합니다.</p>}>
        <FarmScene showLabels={showLabels} showHeatmap={showHeatmap} showEnvelope={showEnvelope} showPigs={showPigs} values={values} controlsRef={controlsRef} labelPortal={labelPortal} frame={frame} playing={playing && (!serverMode || usable)} />
      </Canvas><div className="scene-caption">드래그 회전 · 휠 확대 · {serverMode ? 'FastAPI 합성 격자' : '검정 테두리: 합성 탐지 위치'}</div>
    </section></div>
    <details className="scenario-analysis"><summary>시나리오 분석 · 제어 기록</summary>
    {!serverMode && <><ScenarioChart runs={runs} time={time} />
    <section className="event-log"><h2>현재 시점까지의 제어 기록</h2>{events.length ? <ol>{events.map((e, i) => <li key={`${e.time}-${i}`}><b>{e.time}분 · {e.action}</b><span>{e.reason}</span></li>)}</ol> : <p>아직 전환 기록이 없습니다. 10분부터 합성 오염원 강도가 증가합니다.</p>}</section></>}
    {serverMode && <section className="event-log"><h2>서버 스냅샷 모드</h2><p>이 API는 선택 시점의 상태와 격자를 제공합니다. 전체 비교 그래프·이벤트 이력·탐지 좌표는 응답에 포함되지 않습니다. 브라우저 합성 재생 모드에서 기존 실험 비교를 볼 수 있습니다.</p></section>}
    <details className="model-notes"><summary>모델 가정과 구조 참고</summary>
      <p>현재 발생 강도를 30분간 유지한다고 가정한 수식 예측이며 학습 AI가 아닙니다. 모든 조건은 같은 초기 상태·발생 입력을 사용합니다. C2는 현재값, C3·C4는 모의 예측으로 제어하고 최소 {P.minimumHoldMinutes}분 유지 및 별도 해제 기준을 적용합니다.</p>
      <p>C4의 배기 제거율 {P.scrubberEfficiency * 100}%는 가정입니다. 동일 환기량으로 C3와 실내 지수가 같으며 세정기는 배출측 계산에만 적용됩니다. 실제 압력손실·RPM-풍량 관계·검증된 모델 성능은 반영하지 않았습니다. C1 환기 OFF는 가상 스트레스 실험입니다.</p>
      <p>한돈혁신센터 중앙배기 개념을 참고한 구조 모형입니다. 부분 슬랫·치수·감지장치 위치는 설계 가정이며 돼지 수는 정원이 아닙니다. 카메라 표면 관측은 피트 발생량을 직접 측정하지 않습니다. FastAPI는 합성 재생 데이터를 제공하며 실제 비전 AI·물리 장치는 미연결입니다.</p>
    </details>
    </details>
    </>}
    <footer><span>아기데지 · BARN INTELLIGENCE</span><span>관측과 예측을 연결하는 내부 환경 분석 공간</span></footer>
  </main>;
}
