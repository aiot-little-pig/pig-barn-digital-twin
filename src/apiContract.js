import { BARN } from './config.js';
import { validateGrid } from './heatmapData.js';

export const API = {
  baseUrl: import.meta.env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
  pollMs: 1000, timeoutMs: 4000, staleMs: 10000, futureToleranceMs: 5000,
};
function requireCondition(test, message) { if (!test) throw new Error(`API 데이터 오류: ${message}`); }
const nonnegative = v => v === null || (Number.isFinite(v) && v >= 0);
const timestamp = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;

export function validateSnapshot(data, scenario, minute, now = Date.now()) {
  requireCondition(data?.schema_version === '1.0' && data.source === 'synthetic-replay', '지원하지 않는 버전/출처');
  requireCondition(data.scenario === scenario && data.simulation_minute === minute, '요청과 다른 시나리오/시각');
  requireCondition(data.unit === 'relative_index' && data.normalization === 'demo-index-v1;heatmap-clipped-0-1', '단위/정규화 불일치');
  requireCondition(nonnegative(data.current_index) && nonnegative(data.predicted_index), '지수 범위');
  requireCondition(Number.isFinite(data.horizon_minutes) && data.horizon_minutes > 0, '예측 간격');
  const generated = timestamp(data.generated_at), observed = timestamp(data.data_at), forecast = timestamp(data.forecast_for);
  requireCondition([generated, observed, forecast].every(Number.isFinite), '시간대가 포함된 타임스탬프 필요');
  requireCondition(generated >= observed && generated <= now + API.futureToleranceMs, '생성/데이터 시각 불일치');
  requireCondition(Math.abs(forecast - observed - data.horizon_minutes * 60000) <= 1000, '예측 시각 불일치');
  const grid = data.grid;
  requireCondition(grid && grid.coordinates === 'center-origin:column=+X,row=+Z' && grid.meaning === 'current_relative_index', '격자 좌표/의미 불일치');
  requireCondition(grid.width_m === BARN.width && grid.length_m === BARN.length, '돈사 크기 불일치');
  requireCondition(Number.isInteger(grid.rows) && Number.isInteger(grid.columns) && grid.rows > 0 && grid.columns > 0 && grid.rows <= 256 && grid.columns <= 256, '격자 해상도 범위');
  const dimensions = validateGrid(grid.values);
  requireCondition(dimensions.rows === grid.rows && dimensions.columns === grid.columns, '격자 크기 불일치');
  const a = data.actuators;
  requireCondition(a && nonnegative(a.pwm_percent) && (a.pwm_percent === null || a.pwm_percent <= 100) && nonnegative(a.rpm) && (a.scrubber_on === null || typeof a.scrubber_on === 'boolean'), '장치 상태 범위');
  requireCondition(typeof data.reason === 'string' && data.reason.length <= 1000, '제어 설명');
  return data;
}

export function snapshotIsStale(data, now = Date.now()) {
  return !data || now - Date.parse(data.data_at) > API.staleMs;
}

export function frameFromSnapshot(data) {
  return { time: data.simulation_minute, current: data.current_index, predicted: data.predicted_index,
    pwm: data.actuators.pwm_percent, rpm: data.actuators.rpm, scrubberOn: data.actuators.scrubber_on,
    detected: false, reason: data.reason };
}
