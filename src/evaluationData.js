import { replayMetrics } from './replayData.js';
// Receive already redacted Replay rows. Never reconstruct unavailable truths.
export function evaluateWindow(records, ids, start, end, baseline) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error('평가 시작·종료 시각을 확인하세요.');
  if (new Set(records.map(r => r.farm_id)).size > 1) throw new Error('농장별로 평가해야 합니다.');
  const selected = [...new Set(ids)];
  const filtered = records.filter(r => selected.includes(r.condition_id) && Date.parse(r.target_at) >= start && Date.parse(r.target_at) <= end);
  const metrics = replayMetrics(filtered, selected);
  const base = metrics.find(m => m.id === baseline);
  return metrics.map(m => ({ ...m, excluded: m.candidates - m.count,
    deltaMae: m.mae !== null && base?.mae != null ? m.mae - base.mae : null }));
}
