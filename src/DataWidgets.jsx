import React from 'react';
import { gaugeView, intervalView } from './widgetData.js';
const format=(v,d=2)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(d):'—';

export function RingGauge({label,value,min,max,unit,testId,digits=2,tone='cyan',note}) {
  const g=gaugeView(value,min,max),circumference=2*Math.PI*39;
  return <article className={`ring-widget tone-${tone}`}>
    <span className="widget-title">{label}</span>
    <div className="ring-face">
      <svg viewBox="0 0 100 100" aria-hidden="true"><circle className="ring-track" cx="50" cy="50" r="39"/>
        {g.ratio!==null?<circle className="ring-fill" cx="50" cy="50" r="39" strokeDasharray={`${g.ratio*circumference} ${circumference}`} transform="rotate(-90 50 50)"/>:<circle className="ring-unknown" cx="50" cy="50" r="39"/>}
      </svg><div className="ring-number"><strong data-testid={testId}>{format(value,digits)}</strong><small>{unit}</small></div>
    </div>
    <small className="widget-scale">{g.ratio===null?(value==null?'값 미수신':value<0?'원본 값 확인':'표시 범위 미설정'):`${min}–${max} ${unit}`}</small>
    <small className="widget-note">{g.outside?'표시 범위 초과 · 원값 유지':note}</small>
  </article>;
}

export function IntervalWidget({lower,upper,point,coverage,method,unit}) {
  const g=intervalView(lower,upper,point);
  return <article className="interval-widget"><div className="widget-heading"><span>30분 예측구간</span><span className="mini-tag">{g?'INTERVAL':'미제공'}</span></div>
    {g?<><div className="interval-labels"><b>{format(lower)}</b><span>{unit}</span><b>{format(upper)}</b></div>
      <svg viewBox="0 0 200 30" role="img" aria-label={`예측구간 ${lower}부터 ${upper} ${unit}, 점예측 ${point ?? '없음'}`}><line className="interval-track" x1="8" x2="192" y1="15" y2="15"/><line className="interval-band" x1={g.lower} x2={g.upper} y1="15" y2="15"/>{[g.lower,g.upper].map((x,i)=><line key={i} className="interval-cap" x1={x} x2={x} y1="7" y2="23"/>)}{g.point!==null&&<circle className="interval-point" cx={g.point} cy="15" r="4"/>}</svg>
      <small>목표 포함률 {coverage==null?'미제공':`${(coverage*100).toFixed(1)}%`} · 점: 예측값</small><small className="widget-note" title={method}>{method??'산출법 미제공'}</small></>:<div className="widget-empty"><span>—</span><small>구간 수신 후 표시 · 신뢰도 추정 안 함</small></div>}
  </article>;
}

export function RiskBadge({risk,layer,demo}) {
  const code={'낮음':'NORMAL','주의':'WARNING','위험':'DANGER'}[risk.level]??'UNKNOWN';
  return <article className={`status-widget state-${code.toLowerCase()}`}><div className="widget-heading"><span>{layer==='current'?'현재':'예측'} 위험등급</span><small>{demo?'시연 기준':'설정 기준'}</small></div><div className="status-line"><i aria-hidden="true"/ ><strong data-testid="twin-risk">{risk.level}{risk.crossing&&<small>예측구간이 위험 경계를 걸침</small>}</strong><span className="status-code">{code}</span></div></article>;
}

export function FanGauge({pwm,rpm}) {
  const g=gaugeView(pwm,0,100);
  return <div className="fan-widget"><div className="widget-heading"><span>환기팬 · 모의 출력</span><b data-testid="fan-state">{pwm===null?'—':`${pwm}%`} / {rpm??'—'}</b></div><div className="fan-gauge" role="img" aria-label={pwm===null?'팬 출력 미확인':`팬 PWM ${pwm}%, ${rpm} RPM`}><div style={{width:g.ratio===null?'0%':`${g.ratio*100}%`}}/></div><div className="gauge-ticks"><span>0</span><span>PWM % / RPM</span><span>100</span></div></div>;
}

export function DeviceBadge({on}) {
  return <div className={`device-widget ${on===null?'device-unknown':on?'device-on':'device-off'}`}><span>스크러버 · 모의 상태</span><b data-testid="scrubber-state"><i aria-hidden="true"/>{on===null?'미확인':on?'ON':'OFF'}</b></div>;
}
