import { useCallback, useEffect, useState } from 'react';
import { advanceReplay } from './replayClock.js';

export default function useReplayClock(bounds) {
  const [time, setTime] = useState(() => bounds?.start ?? 0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(5);
  const start = bounds?.start ?? 0, end = bounds?.end ?? 0;
  const resetTime = useCallback(value => { setPlaying(false); setTime(value); }, []);
  const seek = useCallback(value => resetTime(Math.min(end, Math.max(start, value))), [start, end, resetTime]);
  useEffect(() => {
    if (!playing || end <= start) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), elapsed = now - previous;
      previous = now;
      setTime(current => advanceReplay(current, elapsed, speed, end));
    }, 100);
    return () => clearInterval(timer);
  }, [playing, speed, start, end]);
  useEffect(() => { if (time >= end) setPlaying(false); }, [time, end]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  const toggle = () => { if (time >= end) setTime(start); setPlaying(value => !value); };
  return { time, playing, speed, setSpeed, seek, resetTime, toggle, pause: () => setPlaying(false) };
}
