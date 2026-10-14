import { useEffect, useState } from 'react';
import { API, validateSnapshot, snapshotIsStale } from './apiContract.js';

export default function useApiSnapshot(enabled, scenario, minute) {
  const key = `${scenario}:${minute}`;
  const [state, setState] = useState({ key: '', data: null, error: '', loading: true });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) { setState({ key: '', data: null, error: '', loading: true }); return; }
    let cancelled = false, timer, controller;
    setState({ key, data: null, error: '', loading: true });
    const ageTimer = setInterval(() => setNow(Date.now()), 500);
    async function poll() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API.timeoutMs);
      try {
        const query = new URLSearchParams({ scenario, minute: String(minute) });
        const response = await fetch(`${API.baseUrl.replace(/\/$/, '')}/api/v1/snapshot?${query}`, {
          signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = validateSnapshot(await response.json(), scenario, minute);
        if (!cancelled) {
          setNow(Date.now());
          setState({ key, data, error: '', loading: false });
        }
      } catch (error) {
        if (!cancelled) setState({ key, data: null, loading: false,
          error: error.name === 'AbortError' ? '요청 시간 초과' : error.message });
      } finally {
        clearTimeout(timeout);
        if (!cancelled) timer = setTimeout(poll, API.pollMs);
      }
    }
    poll();
    return () => { cancelled = true; clearTimeout(timer); clearInterval(ageTimer); controller?.abort(); };
  }, [enabled, scenario, minute, key]);
  const current = enabled && state.key === key ? state : { data: null, error: '', loading: true };
  return { ...current, stale: current.data ? snapshotIsStale(current.data, now) : false };
}
