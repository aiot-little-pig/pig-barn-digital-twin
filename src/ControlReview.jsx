import React from 'react';
import { controlReview } from './controlReview.js';
export default function ControlReview({ observed, prediction, policy, error, time }) {
  const review=controlReview({current:observed.nh3,prediction,policy,error});
  return <section className="control-review"><h2>가상 제어 검토</h2>
    <p>최근 관측 기준 판단 · 관측 이후 {((time-Date.parse(observed.observed_at))/60000).toFixed(1)}분 경과 · {review.confidence}</p>
    <div className="table-scroll"><table data-testid="control-review"><caption>{policy?.demo?'합성 시연 위험 기준':'제공된 위험 기준'}을 이용한 조건 비교 · 실제 명령 전송 없음</caption><thead><tr><th>조건</th><th>환기팬 판단</th><th>스크러버 판단</th><th>근거</th></tr></thead><tbody>{review.rows.map(r=><tr key={r.id}><th>{r.id}</th><td>{r.fan}</td><td>{r.scrubber}</td><td>{r.reason}</td></tr>)}</tbody></table></div>
    <p>이 표는 한 시점의 조건 검토이며 실제 운전 상태·RPM·연속 제어 이력을 생성하지 않습니다. 구간 미제공을 높은 신뢰도로 해석하지 않습니다. 최소 유지시간과 해제 조건이 적용된 연속 제어는 ‘제어 시나리오’의 합성 실험에서 확인하세요.</p>
    <p>C2~C4는 기본 환기를 전제합니다. C4는 C3와 같은 팬 판단에 배출측 스크러버를 추가하며, 과거 관측이나 실내 농도를 더 낮춰 표시하지 않습니다.</p>
  </section>;
}
