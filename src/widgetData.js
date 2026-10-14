// Display geometry only. Values remain unchanged; a filled ring is not a probability.
export function gaugeView(value, min, max) {
  const valid = typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const ranged = Number.isFinite(min) && Number.isFinite(max) && max > min;
  if (!valid || !ranged) return { ratio: null, outside: false };
  return { ratio: Math.max(0, Math.min(1, (value - min) / (max - min))), outside: value < min || value > max };
}
export function intervalView(lower, upper, point) {
  if (![lower, upper].every(v => typeof v === 'number' && Number.isFinite(v)) || lower > upper) return null;
  const values = [lower, upper];
  if (typeof point === 'number' && Number.isFinite(point)) values.push(point);
  const min = Math.min(...values), max = Math.max(...values);
  const pad = Math.max((max - min) * .15, .01);
  const position = value => 8 + (value - (min - pad)) / (max - min + pad * 2) * 184;
  return { lower: position(lower), upper: position(upper), point: typeof point === 'number' && Number.isFinite(point) ? position(point) : null };
}
