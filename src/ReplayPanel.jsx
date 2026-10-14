import EvaluationPanel from './EvaluationPanel.jsx';
import React, { useMemo, useRef, useState } from 'react';
import { makeReplayExample, recordKey, validateReplay } from './replayData.js';
import { latestIssued, replayBounds, resolvedComparisons, visibleReplay } from './replayClock.js';
import useReplayClock from './useReplayClock.js';

const number = value => value === null ? '—' : value.toFixed(3);
const clock = value => new Date(value).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
function downloadExample() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(makeReplayExample(), null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'replay-example-SYNTHETIC.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ForecastPlot({ rows, active, unit, retrospective }) {
  if (!rows.length) return <p>이 시각까지 발행된 예측이 없습니다.</p>;
  const times = rows.map(r => Date.parse(r.target_at)), start = Math.min(...times), end = Math.max(...times);
  // rows has already been redacted: future actuals cannot affect the Y scale.
  const max = Math.max(1, ...rows.flatMap(r => [r.actual, r.prediction, r.upper].filter(v => v !== null))) * 1.1;
  const x = r => 60 + (Date.parse(r.target_at) - start) / Math.max(1, end - start) * 800;
  const y = v => 220 - v / max * 180;
  const path = field => { let pen = false; return rows.map(r => {
    if (r[field] === null) { pen = false; return ''; }
    const p = `${pen ? 'L' : 'M'}${x(r)},${y(r[field])}`; pen = true; return p;
  }).join(' '); };
  return <svg viewBox="0 0 920 280" role="img" aria-label="예측 대상 시각별 실제값과 예측구간">
    {[0, max / 2, max].map(v => <g key={v}><line x1="60" x2="860" y1={y(v)} y2={y(v)} stroke="#26394d" /><text x="4" y={y(v) + 4}>{v.toFixed(2)}</text></g>)}
    {rows.filter(r => r.lower !== null).map(r => <line key={recordKey(r)} x1={x(r)} x2={x(r)} y1={y(r.lower)} y2={y(r.upper)} stroke="#93bea9" strokeWidth="10" opacity="0.65" />)}
    <path data-testid="actual-path" d={path('actual')} fill="none" stroke="#83b9ee" strokeWidth="2" />
    <path d={path('prediction')} fill="none" stroke="#3cddc2" strokeWidth="3" />
    {rows.map(r => <g key={recordKey(r)}>{r.prediction !== null && <circle cx={x(r)} cy={y(r.prediction)} r="3" fill="#3cddc2" />}{r.actual !== null && <circle cx={x(r)} cy={y(r.actual)} r="2" fill="#83b9ee" />}</g>)}
    {active && <line x1={x(active)} x2={x(active)} y1="28" y2="220" stroke="#bd773b" strokeDasharray="4 4" />}
    <text x="60" y="20">{unit} · 민트: 예측 / 파랑: 실제 / 연녹색 막대: 예측구간</text>
    <text x="60" y="247">{clock(rows[0].target_at)}</text><text x="860" y="247" textAnchor="end">{clock(rows.at(-1).target_at)}</text>
    <text x="440" y="272" textAnchor="middle">예측 대상 시각 · {retrospective ? '전체 사후 평가' : '발행된 예측과 도달한 정답만 표시'}</text>
  </svg>;
}

export default function ReplayPanel() {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const [farm, setFarm] = useState(''), [condition, setCondition] = useState('');
  const [retrospective, setRetrospective] = useState(false);
  const importId = useRef(0);
  const farmRows = useMemo(() => data?.records.filter(r => r.farm_id === farm) || [], [data, farm]);
  const bounds = useMemo(() => replayBounds(farmRows), [farmRows]);
  const playback = useReplayClock(bounds);
  const time = bounds ? Math.max(bounds.start, Math.min(bounds.end, playback.time)) : 0;
  const conditions = [...new Set(farmRows.map(r => r.condition_id))];
  const visible = visibleReplay(farmRows, time, retrospective);
  const rows = visible.filter(r => r.condition_id === condition && (retrospective || Date.parse(r.observed_at) <= time));
  const active = latestIssued(rows, time);
  const resolved = resolvedComparisons(rows, retrospective ? Infinity : time);

  const load = value => {
    const valid = validateReplay(value), firstFarm = valid.records[0].farm_id;
    setData(valid); setFarm(firstFarm); setCondition(valid.records[0].condition_id);
    playback.resetTime(replayBounds(valid.records.filter(r => r.farm_id === firstFarm)).start);
    setRetrospective(false); setError('');
  };
  async function upload(file) {
    const id = ++importId.current;
    playback.pause(); setData(null); setError('');
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('파일은 5MB 이하여야 합니다.');
      const content = await file.text();
      if (id === importId.current) load(JSON.parse(content.replace(/^\uFEFF/, '')));
    } catch (e) { if (id === importId.current) setError(e.message); }
  }
  return <section className="replay-panel">
    <h2>예측 Replay · 실제 시각 기준 재생</h2>
    <p>저장된 예측을 기준 시각에 공개하고, 대상 시각에 도달하면 실제값과 비교합니다. 파일은 브라우저 안에서 처리하며 제어 동작으로 관측값을 바꾸지 않습니다.</p>
    <div className="playback">
      <label>예측 JSON 파일 <input aria-label="예측 JSON 파일" type="file" accept=".json,application/json" onChange={e => { upload(e.target.files[0]); e.target.value = ''; }} /></label>
      <button className="secondary" onClick={() => { ++importId.current; load(makeReplayExample()); }}>합성 형식 예시 열기</button>
      <button className="secondary" onClick={downloadExample}>JSON 예시 내려받기</button>
    </div>
    {error && <p role="alert" className="control-reason">파일을 표시하지 않았습니다: {error}</p>}
    {!data && <p>파일을 선택하거나 형식 예시를 여세요. 실제 모델 결과는 아직 연결하지 않았습니다.</p>}
    {data && bounds && <>
      <p className="control-reason" data-testid="replay-source">{data.source === 'synthetic_fixture' ? '합성 UI 점검용 · 아래 수치와 구간은 학습 성능이 아닙니다.' : '업로드된 모델 출력 · 파일의 출처·학습 절차는 별도 검증이 필요합니다.'}</p>
      <div className="playback">
        <label>보기 방식 <select value={retrospective ? 'evaluation' : 'replay'} onChange={e => { playback.pause(); setRetrospective(e.target.value === 'evaluation'); }}><option value="replay">시간순 Replay</option><option value="evaluation">전체 사후 평가</option></select></label>
        <label>농장 <select value={farm} onChange={e => {
          const id = e.target.value, selected = data.records.filter(r => r.farm_id === id);
          setFarm(id); setCondition(selected[0].condition_id); playback.resetTime(replayBounds(selected).start);
        }}>{[...new Set(data.records.map(r => r.farm_id))].map(id => <option key={id}>{id}</option>)}</select></label>
        <label>모델 조건 <select value={condition} onChange={e => { setCondition(e.target.value); playback.seek(bounds.start); }}>{conditions.map(id => <option key={id}>{id}</option>)}</select></label>
      </div>
      {retrospective ? <p className="control-reason">전체 사후 평가: 미래 정답과 전체 평가 지표를 포함합니다. 시간순 Replay와 구분해 확인하세요.</p> : <div className="playback">
        <button onClick={playback.toggle}>{playback.playing ? '기록 정지' : '기록 재생'}</button>
        <button className="secondary" onClick={() => playback.seek(bounds.start)}>처음으로</button>
        <label>재생 속도 <select value={playback.speed} onChange={e => playback.setSpeed(Number(e.target.value))}>{[1, 5, 10, 30].map(v => <option key={v} value={v}>1초당 {v}분</option>)}</select></label>
        <input aria-label="Replay 시각" type="range" min="0" max={bounds.end - bounds.start} step="1000" value={time - bounds.start} onChange={e => playback.seek(bounds.start + Number(e.target.value))} />
        <span data-testid="replay-clock">{clock(time)}</span>
      </div>}
      <p>데이터 {data.dataset_id} · 단위 {data.unit} · 예측 간격 {data.horizon_minutes}분</p>
      {!retrospective && <>
        {active ? <>
          <p>최근 관측·예측 기준 {clock(active.observed_at)} → 대상 {clock(active.target_at)} · 모델 {active.model_id}</p>
          <div className="replay-values">
            <span>최근 관측 <b>{number(active.current)}</b></span><span>발행된 예측 <b>{number(active.prediction)}</b></span>
            <span>예측구간 <b>{number(active.lower)} ~ {number(active.upper)}</b></span>
            <span data-testid="active-actual">대상 실제값 <b>{Date.parse(active.target_at) > time ? '아직 대상 시각 전' : number(active.actual)}</b></span>
          </div>
          <p>최근 관측 이후 {((time - Date.parse(active.observed_at)) / 60000).toFixed(1)}분 경과. 새 관측이 없으면 보간하지 않습니다.</p>
        </> : <p>선택한 조건에서 아직 발행된 예측이 없습니다.</p>}
      </>}
      <div className="comparison"><ForecastPlot rows={rows} active={retrospective ? null : active} unit={data.unit} retrospective={retrospective} /></div>
      <p>목표 포함률 {data.nominal_coverage === null ? '미제공' : `${(data.nominal_coverage * 100).toFixed(1)}%`} · 방법 {data.interval_method || '미제공'}. 목표 포함률은 개별 예측의 정확도와 다릅니다.</p>
      <div className="table-scroll"><table data-testid="resolved-table"><caption>{retrospective ? '전체 대상 시각' : '대상 시각에 도달한 예측'} 비교 · 최근 5건 / {resolved.length}건</caption>
        <thead><tr><th>발행 시각 UTC</th><th>대상 시각 UTC</th><th>당시 예측</th><th>실제값</th><th>절대오차</th><th>구간 포함</th></tr></thead>
        <tbody>{resolved.slice(-5).map(r => <tr key={recordKey(r)}><td>{clock(r.observed_at)}</td><td>{clock(r.target_at)}</td><td>{number(r.prediction)}</td><td>{r.actual === null ? '관측 없음' : number(r.actual)}</td><td>{number(r.absoluteError)}</td><td>{r.included === null ? '—' : r.included ? '포함' : '미포함'}</td></tr>)}</tbody>
      </table></div>
      {!resolved.length && <p>아직 비교할 대상 시각에 도달하지 않았습니다.</p>}
      <EvaluationPanel key={`${importId.current}/${data.dataset_id}/${farm}`} rows={visible} data={data} retrospective={retrospective}/>
      <p>누락된 실제값은 가까운 시각의 관측으로 대신하지 않습니다. 시간순 Replay를 되감으면 공개 정답과 지표도 그 시각까지로 되돌아갑니다. 저장된 예측값은 바뀌지 않습니다.</p>
      <p>관측·예측의 3D 표시는 디지털트윈 화면, 가상 제어 비교는 제어 시나리오 화면에서 확인합니다.</p>
    </>}
  </section>;
}
