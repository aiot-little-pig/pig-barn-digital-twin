// 시연용 배치: 실측 돈사 도면이 아닙니다. 3D 좌표 1 단위를 1 m로 약속합니다.
// X = 폭, Y = 높이, Z = 길이. 바닥 중심은 [0, 0, 0].
export const BARN = {
  width: 12,
  length: 18,
  height: 3.5,
  aisleWidth: 1.2,
  pensPerSide: 3,
  partitionHeight: 1.0,
  wallThickness: 0.12,
  floorColor: '#bdcbc4',
  partitionColor: '#78978c',
};

export const VIEW = {
  cameraPosition: [21, 21, 26],
  target: [0, 0.8, -1],
  fov: 45,
  minDistance: 12,
  maxDistance: 42,
};

// 공개 구조를 참고한 설계 가정. 실제 농장 도면/환기 용량/사육 밀도 검증값 아님.
export const STRUCTURE = {
  slattedRatio: 0.48, // 돈방 외벽측 슬랫 영역 비율
  pitDepth: 1.2,
  slatPitch: 0.18,
  slatGap: 0.025, // 시각적 표현용, 사육 단계별 시공 규격 아님
  gateWidth: 1.1,
  inletHeight: 2.7,
  ductHeight: 3.05,
  roofRise: 1.0,
  pigsPerPen: 3, // 위치·스케일 참고용 개체만 표시. 사육 정원 아님
  sensorHeight: 1.2,
  cameraHeight: 2.8,
};

export const HEATMAP = {
  columns: 24,
  rows: 36,
  elevation: 0.025,
  gap: 0.02, // 셀 너비 대비 틈 비율(0~0.2 권장)
  gamma: 1, // 1 미만: 낮은 값도 강한 색, 1 초과: 높은 값 중심 강조
  colors: ['#2563eb', '#facc15', '#dc2626'],
  missingColor: '#94a3b8',
  opacity: 0.6, // 슬랫/통로가 보이도록 반투명 분석 레이어
};

// 비전 AI 출력 대신 사용하는 합성 오염원 위치. 실제 탐지/농도 데이터가 아닙니다.
export const DEMO_SOURCE = { xRatio: -0.28, zRatio: -0.22, spreadRatio: 0.22 };

// 시나리오 비교용 합성 모델. 실측 환기량/AI/안전 기준이 아닙니다.
export const SIMULATION = {
  durationMinutes: 120,
  stepMinutes: 1,
  initialIndex: 0.15,
  sourceStart: 10,
  sourceEnd: 50,
  backgroundSource: 0.003,
  activeSource: 0.018,
  baseRemovalRate: 0.006, // 가상 환기 제거계수 /분
  highRemovalRate: 0.045,
  basePwm: 30,
  highPwm: 85,
  maxRpm: 1800, // PWM에 비례하는 표시용 회전수. 실측 특성 곡선 아님
  triggerIndex: 0.65,
  releaseIndex: 0.35,
  minimumHoldMinutes: 10,
  forecastHorizon: 30,
  scrubberEfficiency: 0.7, // 배출 제거율 가정. 실내 제거항에 사용하지 않음
  defaultPlaybackSpeed: 2, // 실제 1초당 모의 분
};

export const SCENARIOS = [
  { id: 'C1', title: '환기 OFF / 통제군', description: '오염원 탐지 후에도 환기 OFF → 실내 전역 위험도 급증' },
  { id: 'C2', title: '기존 사후 대응', description: '기본 환기를 유지하다 현재 지수가 시연 기준에 도달한 뒤 팬 HIGH' },
  { id: 'C3', title: 'AI 선제 환기', description: '30분 후 위험 예측 → 팬 RPM 선제 증가 → 피크 억제' },
  { id: 'C4', title: 'AI 선제 환기 + 배기 세정', description: '선제 환기 + 배출 공기 세정. C3 대비 실내 회복 우위는 미검증' },
];

export const DEVICE_POSITIONS = {
  fan: [0, STRUCTURE.ductHeight, -BARN.length / 2 - 0.6],
  scrubber: [0, 1.8, -BARN.length / 2 - 2.7],
};
