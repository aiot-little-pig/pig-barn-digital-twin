import { BARN, DEMO_SOURCE, HEATMAP } from './config.js';

// values[row][column]: row 증가 = +Z, column 증가 = +X. 각 셀의 중심 좌표.
export function cellCenter(row, column, rows, columns, width = BARN.width, length = BARN.length) {
  return [-width / 2 + (column + 0.5) * width / columns,
    -length / 2 + (row + 0.5) * length / rows];
}

// FastAPI 연결 전에 렌더링만 확인하기 위한 정적인 합성 위험도입니다.
// Gaussian 모양은 물리 확산/CFD 계산 또는 AI 예측을 의미하지 않습니다.
export function createDemoGrid(level) {
  const { rows, columns } = HEATMAP;
  const sx = BARN.width * DEMO_SOURCE.xRatio;
  const sz = BARN.length * DEMO_SOURCE.zRatio;
  const spread = Math.min(BARN.width, BARN.length) * DEMO_SOURCE.spreadRatio;
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      const [x, z] = cellCenter(row, column, rows, columns);
      const hotspot = Math.exp(-((x - sx) ** 2 + (z - sz) ** 2) / (2 * spread ** 2));
      return Math.min(1, Math.max(0, level * (0.55 + 0.45 * hotspot)));
    }),
  );
}

export function validateGrid(values) {
  if (!Array.isArray(values) || !values.length || !Array.isArray(values[0]) || !values[0].length)
    throw new Error('위험도 격자는 비어 있지 않은 2차원 배열이어야 합니다.');
  const columns = values[0].length;
  for (const row of values) {
    if (!Array.isArray(row) || row.length !== columns)
      throw new Error('모든 행의 열 개수가 같아야 합니다.');
    if (row.some(v => v !== null && (!Number.isFinite(v) || v < 0 || v > 1)))
      throw new Error('위험도는 0~1 숫자 또는 null(결측)이어야 합니다.');
  }
  return { rows: values.length, columns };
}

// 실내 지수를 평균 1인 공간 가중치로 배분하는 시각화 가정. CFD/공간 AI가 아닙니다.
export function createScenarioGrid(current) {
  const shape = createDemoGrid(1);
  const average = shape.flat().reduce((sum, v) => sum + v, 0) / (HEATMAP.rows * HEATMAP.columns);
  return shape.map(row => row.map(v => Math.min(1, Math.max(0, current * v / average))));
}
