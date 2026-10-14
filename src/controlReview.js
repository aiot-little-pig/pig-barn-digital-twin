// Replay-only decision review. Never dispatches commands or changes observations.
export function controlReview({ current, prediction, policy, error = null }) {
  const blocked = reason => ({ fan: '판단 보류', scrubber: '판단 보류', reason });
  const valid = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const currentIssue = !policy ? '위험 기준 미설정' : !valid(current) ? '현재 관측 결측' : null;
  const predictionIssue = error ? '예측 요청 실패' : !prediction ? '예측 미수신' : prediction.status !== 'ok' ? '입력 부족 또는 예측 제공 불가' : !valid(prediction.prediction) ? '예측 원본 확인 필요' : null;
  const interval = prediction?.lower != null && prediction?.upper != null;
  const crossing = interval && policy && prediction.lower < policy.danger && prediction.upper >= policy.danger;
  const review = predictive => {
    if (currentIssue) return blocked(currentIssue);
    if (predictive && predictionIssue) return blocked(predictionIssue);
    const score = predictive ? Math.max(current, prediction.prediction) : current;
    if (score >= policy.danger) return { fan: '강화 검토', scrubber: '해당 없음', reason: predictive ? '현재 또는 30분 예측이 위험 경계 이상' : '현재 관측이 위험 경계 이상' };
    if (predictive && crossing) return { fan: '구간 경계 검토', scrubber: '판단 보류', reason: '점예측은 경계 아래이나 예측구간이 위험 경계를 걸침' };
    return { fan: '강화 조건 미도달', scrubber: '해당 없음', reason: predictive ? '현재·점예측이 위험 경계 아래' : '현재 관측이 위험 경계 아래' };
  };
  const c3 = review(true);
  return {
    confidence: predictionIssue ? '예측 평가 불가' : !interval ? '구간 미제공 · 점예측만 비교' : '구간 제공 · 보정 품질은 별도 평가',
    rows: [
      { id: 'C1', fan: 'OFF 가정', scrubber: 'OFF 가정', reason: '무환기 가상 통제군 · 운전 권고 아님' },
      { id: 'C2', ...review(false) },
      { id: 'C3', ...c3 },
      { id: 'C4', ...c3, scrubber: c3.fan === '강화 검토' ? '배출측 가동 검토' : c3.scrubber === '판단 보류' ? '판단 보류' : '가동 조건 미도달' },
    ],
  };
}
