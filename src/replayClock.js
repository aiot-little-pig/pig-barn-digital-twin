// Pure data-time logic. Stored forecasts are never recalculated from future truth.
export function replayBounds(records) {
  if (!records.length) return null;
  return { start: Math.min(...records.map(r => Date.parse(r.observed_at))), end: Math.max(...records.map(r => Date.parse(r.target_at))) };
}
export function advanceReplay(time, elapsedMs, minutesPerSecond, end) {
  if (![time, elapsedMs, minutesPerSecond, end].every(Number.isFinite) || elapsedMs < 0 || minutesPerSecond <= 0)
    throw new Error('Invalid replay clock input');
  return Math.min(end, time + elapsedMs * minutesPerSecond * 60);
}
export function visibleReplay(records, time, retrospective = false) {
  // Redact before chart scaling and metrics, not just in visible text.
  return records.map(row => {
    const issued = retrospective || Date.parse(row.observed_at) <= time;
    const resolved = retrospective || Date.parse(row.target_at) <= time;
    return { ...row, current: issued ? row.current : null,
      prediction: issued ? row.prediction : null, lower: issued ? row.lower : null,
      upper: issued ? row.upper : null, actual: issued && resolved ? row.actual : null };
  });
}
export function latestIssued(records, time) {
  return records.filter(r => Date.parse(r.observed_at) <= time).at(-1) || null;
}
export function resolvedComparisons(records, time) {
  return records.filter(r => Date.parse(r.target_at) <= time).map(r => ({ ...r,
    absoluteError: r.prediction === null || r.actual === null ? null : Math.abs(r.prediction - r.actual),
    included: r.lower === null || r.upper === null || r.actual === null ? null : r.lower <= r.actual && r.actual <= r.upper,
  }));
}
