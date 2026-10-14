// 과거 예측 결과 파일 전용. 벽시계 신선도 검사 및 실물 제어와 분리합니다.
const numeric = value => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
const identifier = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
export const recordKey = r => `${r.observed_at}|${r.target_at}`;
export function validateReplay(input) {
  const fail = message => { throw new Error(`재생 파일 오류: ${message}`); };
  if (input?.schema_version !== 'replay-1') fail('schema_version은 replay-1이어야 합니다.');
  if (!['synthetic_fixture', 'model_output'].includes(input.source)) fail('데이터 출처를 지정하세요.');
  if (!identifier(input.dataset_id) || !['ppm', 'relative_index'].includes(input.unit)) fail('데이터 ID 또는 단위');
  if (!(Number.isFinite(input.horizon_minutes) && input.horizon_minutes > 0)) fail('예측 간격');
  if (!(input.nominal_coverage === null || (Number.isFinite(input.nominal_coverage) && input.nominal_coverage > 0 && input.nominal_coverage < 1))) fail('목표 포함률은 0~1 사이 또는 null');
  if (!Array.isArray(input.records) || !input.records.length || input.records.length > 20000) fail('행 수는 1~20,000');
  const seen = new Set(), reference = new Map(), models = new Map(), observations = new Map();
  const records = input.records.map((record, i) => {
    const row = i + 1, r = { ...record };
    for (const field of ['farm_id', 'condition_id', 'model_id']) if (!identifier(r[field])) fail(`${row}행 ${field}`);
    for (const field of ['model_version', 'transfer_stage']) {
      if (r[field] != null && !identifier(r[field])) fail(`${row}행 ${field}`);
      r[field] = r[field] ?? null;
    }
    const modelKey = JSON.stringify([r.farm_id, r.condition_id]);
    const identity = JSON.stringify([r.model_id, r.model_version, r.transfer_stage]);
    if (models.has(modelKey) && models.get(modelKey) !== identity) fail(`${row}행 같은 조건에 여러 모델/버전/전이 단계: condition_id를 구분하세요.`);
    models.set(modelKey, identity);
    const observed = instant(r.observed_at), target = instant(r.target_at);
    if (!Number.isFinite(observed) || !Number.isFinite(target) || Math.abs(target - observed - input.horizon_minutes * 60000) > 1)
      fail(`${row}행 시간대/예측 대상 시각`);
    r.observed_at = new Date(observed).toISOString(); r.target_at = new Date(target).toISOString();
    for (const field of ['current', 'prediction', 'lower', 'upper', 'actual']) if (!numeric(r[field])) fail(`${row}행 ${field}: 숫자 또는 null 필요`);
    if ((r.lower === null) !== (r.upper === null) || (r.lower !== null && r.lower > r.upper)) fail(`${row}행 예측구간 순서/누락`);
    if (r.lower !== null && (input.nominal_coverage === null || !identifier(input.interval_method))) fail('구간의 목표 포함률과 산출 방법 필요');
    const base = JSON.stringify([r.farm_id, r.observed_at, r.target_at]);
    const key = JSON.stringify([base, r.condition_id]);
    if (seen.has(key)) fail(`${row}행 중복 조건·시각`);
    seen.add(key);
    const previous = reference.get(base) || {};
    for (const field of ['actual', 'current']) {
      if (r[field] !== null && previous[field] != null && Math.abs(r[field] - previous[field]) > 1e-8) fail(`${row}행 조건 사이의 ${field} 불일치`);
      if (r[field] !== null) previous[field] = r[field];
    }
    reference.set(base, previous);
    // A target actual and a later row's current observation describe the same instant.
    for (const [time, value] of [[r.observed_at, r.current], [r.target_at, r.actual]]) {
      if (value === null) continue;
      const observationKey = JSON.stringify([r.farm_id, time]);
      if (observations.has(observationKey) && Math.abs(observations.get(observationKey) - value) > 1e-8)
        fail(`${row}행 같은 관측 시각의 현재값·실제값 불일치`);
      observations.set(observationKey, value);
    }
    return r;
  });
  return { ...input, records: records.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at)) };
}

export function replayMetrics(records, conditionIds = [...new Set(records.map(r => r.condition_id))]) {
  const groups = conditionIds.map(id => ({ id, rows: records.filter(r => r.condition_id === id) }));
  const validSets = groups.map(g => new Set(g.rows.filter(r => r.prediction !== null && r.actual !== null).map(recordKey)));
  const common = new Set([...(validSets[0] || [])].filter(k => validSets.every(s => s.has(k))));
  const intervalSets = groups.map(g => new Set(g.rows.filter(r => common.has(recordKey(r)) && r.lower !== null).map(recordKey)));
  const intervalCommon = new Set([...common].filter(k => intervalSets.every(s => s.has(k))));
  return groups.map(g => {
    const rows = g.rows.filter(r => common.has(recordKey(r)));
    const intervals = rows.filter(r => intervalCommon.has(recordKey(r)));
    return { id: g.id, candidates: g.rows.length, valid: g.rows.filter(r => r.prediction !== null && r.actual !== null).length, count: rows.length, intervalCount: intervals.length,
      mae: rows.length ? rows.reduce((s, r) => s + Math.abs(r.prediction - r.actual), 0) / rows.length : null,
      rmse: rows.length ? Math.sqrt(rows.reduce((s, r) => s + (r.prediction - r.actual) ** 2, 0) / rows.length) : null,
      coverage: intervals.length ? intervals.filter(r => r.actual >= r.lower && r.actual <= r.upper).length / intervals.length : null,
      width: intervals.length ? intervals.reduce((s, r) => s + r.upper - r.lower, 0) / intervals.length : null };
  });
}

// UI 점검 전용 예시. 학습 결과 또는 보정된 예측구간이 아닙니다.
export function makeReplayExample() {
  const records = [];
  for (let i = 0; i < 10; i++) {
    const current = 0.2 + 0.025 * i, actual = current + 0.075;
    for (const [condition, delta] of [['before', 0.06], ['after', 0.02]]) {
      const prediction = actual + delta;
      records.push({ farm_id: 'DEMO-FARM', condition_id: condition, model_id: `UI-FIXTURE-${condition}`,
        model_version: 'fixture-1', transfer_stage: condition === 'before' ? '전이 전 · 합성' : '전이 후 · 합성',
        observed_at: new Date(Date.UTC(2024, 0, 1, 0, i * 10)).toISOString(),
        target_at: new Date(Date.UTC(2024, 0, 1, 0, i * 10 + 30)).toISOString(),
        current, prediction, lower: prediction - 0.05, upper: prediction + 0.05, actual });
    }
  }
  return { schema_version: 'replay-1', dataset_id: 'UI-TEST-ONLY', source: 'synthetic_fixture',
    unit: 'relative_index', horizon_minutes: 30, nominal_coverage: 0.9,
    interval_method: 'UI fixture; not calibrated', records };
}
