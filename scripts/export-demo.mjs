import { writeFileSync, mkdirSync } from 'node:fs';
import { BARN, HEATMAP, SIMULATION, SCENARIOS } from '../src/config.js';
import { simulateScenario } from '../src/simulation.js';
import { createDemoGrid } from '../src/heatmapData.js';

// Python으로 제어식을 복제하지 않고 동일한 합성 실험을 내보냅니다.
const directory = new URL('../backend/', import.meta.url);
mkdirSync(directory, { recursive: true });
const shape = createDemoGrid(1);
const average = shape.flat().reduce((a, b) => a + b, 0) / (HEATMAP.rows * HEATMAP.columns);
const data = {
  format: 'synthetic-replay-v1', barn: { width: BARN.width, length: BARN.length },
  parameters: SIMULATION,
  weights: shape.map(row => row.map(v => v / average)),
  runs: Object.fromEntries(SCENARIOS.map(s => [s.id, simulateScenario(s.id).frames])),
};
writeFileSync(new URL('demo_runs.json', directory), JSON.stringify(data));
console.log('backend/demo_runs.json: C1~C4 합성 재생 데이터 내보내기 완료');
