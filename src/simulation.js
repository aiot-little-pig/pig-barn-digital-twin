import { SIMULATION } from './config.js';

// dC/dt = source - k*C의 구간별 해석해. C는 ppm이 아닌 상대 농도 지수.
export function integrateIndex(current, source, k, minutes) {
  return k === 0 ? current + source * minutes
    : current * Math.exp(-k * minutes) + source / k * (1 - Math.exp(-k * minutes));
}

export function sourceAt(time, p = SIMULATION) {
  return time >= p.sourceStart && time < p.sourceEnd ? p.activeSource : p.backgroundSource;
}

// 현재 오염원 강도가 앞으로도 유지된다는 단순 가정. 미래 정답/학습 AI를 사용하지 않음.
export function mockForecast(current, source, baselineK, p = SIMULATION) {
  return integrateIndex(current, source, baselineK, p.forecastHorizon);
}

export function simulateScenario(id, p = SIMULATION) {
  if (!['C1', 'C2', 'C3', 'C4'].includes(id)) throw new Error('알 수 없는 시나리오');
  if (!(p.stepMinutes > 0 && p.durationMinutes > 0 && p.highRemovalRate > 0 &&
    p.baseRemovalRate >= 0 && p.initialIndex >= 0 && p.backgroundSource >= 0 &&
    p.activeSource >= 0 && p.scrubberEfficiency >= 0 && p.scrubberEfficiency <= 1 &&
    p.releaseIndex < p.triggerIndex && p.sourceStart >= 0 && p.sourceEnd > p.sourceStart))
    throw new Error('시뮬레이션 설정 범위를 확인하세요.');
  // 오염원 전환 시점과 계산 격자를 맞춰야 구간별 적분이 정확합니다.
  for (const t of [p.durationMinutes, p.sourceStart, p.sourceEnd]) {
    if (Math.abs(t / p.stepMinutes - Math.round(t / p.stepMinutes)) > 1e-8)
      throw new Error('시간 설정은 stepMinutes의 정수 배수여야 합니다.');
  }
  let current = p.initialIndex, high = false, lastSwitch = -Infinity;
  let exposure = 0, emitted = 0, overMinutes = 0, firstHigh = null;
  const frames = [], events = [];
  const count = Math.round(p.durationMinutes / p.stepMinutes);
  for (let i = 0; i <= count; i++) {
    const time = i * p.stepMinutes, source = sourceAt(time, p);
    const predicted = mockForecast(current, source, id === 'C1' ? 0 : p.baseRemovalRate, p);
    const previous = high;
    const score = id === 'C2' ? current : Math.max(current, predicted);
    let reason;
    if (id === 'C1') {
      high = false;
      reason = '환기 OFF 통제군';
    } else if (score >= p.triggerIndex) {
      high = true;
      reason = id === 'C2' ? '현재 지수가 시연 진입 기준 이상' : `현재 또는 +${p.forecastHorizon}분 모의 예측이 시연 진입 기준 이상`;
    } else if (high && (time - lastSwitch < p.minimumHoldMinutes || score > p.releaseIndex)) {
      reason = '최소 유지시간 또는 해제 기준 미충족';
    } else {
      high = false;
      reason = '기본 환기 유지 / 해제 조건 충족';
    }
    if (previous !== high) {
      lastSwitch = time;
      if (high && firstHigh === null) firstHigh = time;
      events.push({ time, action: high ? '팬 HIGH' : '팬 BASE', reason });
    }
    if (time === p.sourceStart || time === p.sourceEnd)
      events.push({ time, action: time === p.sourceStart ? '합성 오염원 탐지' : '오염원 강도 감소', reason: '모든 시나리오에 동일한 입력' });
    const pwm = id === 'C1' ? 0 : high ? p.highPwm : p.basePwm;
    const k = id === 'C1' ? 0 : high ? p.highRemovalRate : p.baseRemovalRate;
    const scrubberOn = id === 'C4' && high;
    frames.push({ time, current, predicted, source, detected: source === p.activeSource,
      pwm, rpm: Math.round(pwm / 100 * p.maxRpm), high, scrubberOn, reason,
      cumulativeExposure: exposure, cumulativeEmission: emitted, overMinutes });
    if (i < count) {
      const next = integrateIndex(current, source, k, p.stepMinutes);
      // 수지식에서 환기 제거량 계산. 스크러버는 배출측에만 적용.
      const removed = Math.max(0, current + source * p.stepMinutes - next);
      const area = k === 0 ? (current + next) / 2 * p.stepMinutes : removed / k;
      exposure += area;
      emitted += removed * (scrubberOn ? 1 - p.scrubberEfficiency : 1);
      overMinutes += (current >= p.triggerIndex ? p.stepMinutes : 0);
      current = next;
    }
  }
  return { id, frames, events, metrics: {
    peak: Math.max(...frames.map(f => f.current)), exposure, emitted, overMinutes, firstHigh,
  } };
}

export function frameAt(run, time, p = SIMULATION) {
  const index = Math.max(0, Math.min(run.frames.length - 1, Math.floor(time / p.stepMinutes)));
  return run.frames[index];
}
