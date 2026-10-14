import React, { useState } from 'react';
import { evaluateWindow } from './evaluationData.js';
const n=v=>v==null?'—':v.toFixed(3);
const utc=v=>new Date(v).toISOString().slice(0,19);
export default function EvaluationPanel({ rows, data, retrospective }) {
  const ids=[...new Set(rows.map(r=>r.condition_id))];
  const [selected,setSelected]=useState(ids),[baseline,setBaseline]=useState(ids[0]);
  const [start,setStart]=useState(utc(Math.min(...rows.map(r=>Date.parse(r.target_at)))));
  const [end,setEnd]=useState(utc(Math.max(...rows.map(r=>Date.parse(r.target_at)))));
  let metrics=[],error='';
  try { metrics=evaluateWindow(rows,selected,Date.parse(start+'Z'),Date.parse(end+'Z'),baseline); } catch(e){error=e.message;}
  return <section className="evaluation-panel"><p className="eyebrow">TRANSFER & RELIABILITY</p><h3>전이 조건 · 예측 신뢰도 비교</h3>
    <p>선택 농장 안에서 동일한 발행·대상 시각의 공통 유효 표본을 비교합니다. {retrospective?'전체 사후 평가':'현재 Replay 시각까지 공개된 정답만 평가'} · 기간은 예측 대상 시각 기준, 양끝 포함입니다.</p>
    <div className="condition-choices">{ids.map(id=><label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={e=>setSelected(v=>e.target.checked?[...v,id]:v.filter(x=>x!==id))}/>{id}</label>)}</div>
    <div className="evaluation-controls"><label>평가 시작 UTC<input type="datetime-local" step="1" value={start} onChange={e=>setStart(e.target.value)}/></label><label>평가 종료 UTC<input type="datetime-local" step="1" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>비교 기준 조건<select value={baseline} onChange={e=>setBaseline(e.target.value)}>{ids.map(id=><option key={id}>{id}</option>)}</select></label></div>
    {error&&<p role="alert">{error}</p>}{!selected.length&&<p>비교할 조건을 선택하세요.</p>}
    <div className="table-scroll"><table data-testid="metrics-table"><caption>목표 포함률 {data.nominal_coverage==null?'미제공':`${data.nominal_coverage*100}%`} · {data.interval_method||'구간 산출법 미제공'} · ΔMAE 음수는 기준보다 오차가 작음</caption><thead><tr>{['조건 / 전이 단계','모델 / 버전','기간 내 N','유효 N','공통 N','제외 N','MAE','ΔMAE','RMSE','구간 N','실제 포함률','평균 폭'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{metrics.map(m=>{const r=rows.find(r=>r.condition_id===m.id);return <tr key={m.id}><th>{m.id}<br/><small>{r?.transfer_stage??'전이 단계 미제공'}</small></th><td>{r?.model_id}<br/>{r?.model_version??'버전 미제공'}</td><td>{m.candidates}</td><td>{m.valid}</td><td>{m.count}</td><td>{m.excluded}</td><td>{n(m.mae)}</td><td>{n(m.deltaMae)}</td><td>{n(m.rmse)}</td><td>{m.intervalCount}</td><td>{m.coverage==null?'—':`${(m.coverage*100).toFixed(1)}%`}</td><td>{n(m.width)}</td></tr>})}</tbody></table></div>
    <p>유효 N: 공개된 정답·예측 쌍. 제외 N: 기간 내 행 중 공통 비교에 쓰이지 않은 행(미래 정답·결측·상대 조건 부재 포함). 구간 N은 모든 선택 조건에 구간도 존재하는 공통 표본입니다. 기준 조건을 해제하면 ΔMAE는 표시하지 않습니다.</p>
    <p>평가 기간 선택은 학습/평가 분리 검증을 대신하지 않습니다. 농장 ID만으로 독립 농장 실증을 주장하지 않으며, 목표 포함률은 개별 예측의 정확도나 위험 확률이 아닙니다.</p>
  </section>;
}
