import React from 'react';
import { SIMULATION } from './config.js';

const COLORS = { C1: '#c84941', C2: '#bd8429', C3: '#21806b', C4: '#7059bb' };
export default function ScenarioChart({ runs, time }) {
  const width = 900, height = 230, left = 48, top = 18, plotW = 820, plotH = 165;
  const maxY = Math.max(1, ...Object.values(runs).map(run => run.metrics.peak)) * 1.08;
  const x = t => left + t / SIMULATION.durationMinutes * plotW;
  const y = value => top + plotH * (1 - value / maxY);
  return <section className="comparison" aria-label="시나리오 비교 결과">
    <h2>같은 오염원, 다른 대응 시점</h2>
    <p>전체 {SIMULATION.durationMinutes}분의 합성 실험 결과 · 세로선은 현재 재생 위치입니다. C3·C4의 실내 곡선은 겹칩니다.</p>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="C1부터 C4까지 모의 실내 NH3 지수 비교 그래프">
      {[0, 0.5, 1].map(v => <g key={v}><line x1={left} x2={left + plotW} y1={y(v)} y2={y(v)} stroke="#dce5dd" /><text x={left - 9} y={y(v) + 4} textAnchor="end">{v.toFixed(1)}</text></g>)}
      <line x1={left} x2={left + plotW} y1={y(SIMULATION.triggerIndex)} y2={y(SIMULATION.triggerIndex)} stroke="#a58276" strokeDasharray="3 5" />
      <text x={left + 5} y={y(SIMULATION.triggerIndex) - 5}>시연 진입 기준 {SIMULATION.triggerIndex} (안전기준 아님)</text>
      {Object.entries(runs).map(([id, run]) => <polyline key={id} fill="none" stroke={COLORS[id]} strokeWidth={id === 'C3' ? 4 : 2.5} strokeDasharray={id === 'C4' ? '5 5' : undefined}
        points={run.frames.map(f => `${x(f.time)},${y(f.current)}`).join(' ')} />)}
      <line x1={x(time)} x2={x(time)} y1={top} y2={top + plotH} stroke="#2c4243" />
      {[0, 30, 60, 90, 120].filter(t => t <= SIMULATION.durationMinutes).map(t => <text key={t} x={x(t)} y={top + plotH + 24} textAnchor="middle">{t}분</text>)}
    </svg>
    <div className="chart-legend">{Object.keys(runs).map(id => <span key={id} style={{ color: COLORS[id] }}>━ {id}{id === 'C4' ? ' (점선)' : ''}</span>)}</div>
    <div className="table-scroll"><table><caption>전체 구간 비교 · 모든 값은 합성 모델 결과</caption><thead><tr><th>조건</th><th>최고 실내 지수</th><th>HIGH 최초 전환</th><th>기준 이상 시간*</th><th>누적 실내 지수·분</th><th>세정 후 누적 배출지수**</th></tr></thead>
      <tbody>{Object.entries(runs).map(([id, r]) => <tr key={id}><th>{id}</th><td>{r.metrics.peak.toFixed(3)}</td><td>{r.metrics.firstHigh === null ? '없음' : `${r.metrics.firstHigh}분`}</td><td>{r.metrics.overMinutes}분</td><td>{r.metrics.exposure.toFixed(2)}</td><td>{r.metrics.emitted.toFixed(3)}</td></tr>)}</tbody></table></div>
    <p className="assumption">* 계산 간격 기준 근사치. ** 장치 경계의 상대량이며 외부 확산·민가 노출량이 아닙니다. C1의 배출량 0은 실내 축적과 별개이며 안전을 뜻하지 않습니다.</p>
  </section>;
}
