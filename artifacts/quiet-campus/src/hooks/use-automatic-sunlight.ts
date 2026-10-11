import { useEffect, useMemo, useState } from 'react';
import type { DemoRoute } from '@/lib/route-scoring';
import { importPredictionResult, routeSnapshotKey, type ResearchPrediction } from '@/lib/research-prediction';
import { usableAutomaticSunlight, type AutomaticSunlight } from '@/lib/solar-ranking';
import { SOLAR_GRID_HASH } from '@/lib/solar-grid';

export function useAutomaticSunlight(routes: DemoRoute[], departure: Date) {
  const departureAt = departure.toISOString();
  const google = routes.filter(route => route.source === 'google');
  const batch = JSON.stringify(google.map(route => [route.id, routeSnapshotKey(route)]));
  const key = `${departureAt}:${batch}`;
  const [state, setState] = useState<{ key: string; results: Record<string, AutomaticSunlight>; error?: string }>({ key: '', results: {} });
  useEffect(() => {
    if (!google.length) return;
    let worker: Worker | undefined;
    let timeout: number | undefined;
    let active = true;
    const fail = (error: string) => {
      window.clearTimeout(timeout); worker?.terminate();
      if (active) setState({ key, results: {}, error });
      active = false;
    };
    try {
      worker = new Worker(new URL('../lib/solar-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = async ({ data }: MessageEvent<{ error?: string; results?: { id: string; result?: ResearchPrediction; error?: string }[] }>) => {
        if (!active) return;
        if (data.error) { fail(data.error); return; }
        const results: Record<string, AutomaticSunlight> = {};
        try {
          for (const entry of data.results ?? []) {
            const route = google.find(route => route.id === entry.id);
            if (route && entry.result && entry.result.departureAt === departureAt) {
              const result = await importPredictionResult({ schemaVersion: 'isense-research-results-1', routes: [entry.result] }, route);
              results[entry.id] = { snapshot: routeSnapshotKey(route), result };
            }
          }
        } catch { fail('Sunlight result validation failed. No prediction was applied.'); return; }
        if (!active) return;
        window.clearTimeout(timeout);
        setState({ key, results, error: Object.keys(results).length < google.length ? 'Some routes lack model support.' : undefined });
        worker?.terminate();
      };
      worker.onerror = () => fail('Sunlight worker unavailable. No prediction was applied.');
      worker.postMessage({ routes: google, departureAt,
        gridUrl: new URL(`${import.meta.env.BASE_URL}api/sunlight-model/grid/${SOLAR_GRID_HASH}`, window.location.origin).href });
    } catch { fail('This browser cannot run the sunlight model. No prediction was applied.'); }
    timeout = window.setTimeout(() => fail('Sunlight calculation timed out. No prediction was applied.'), 30000);
    return () => { active = false; window.clearTimeout(timeout); worker?.terminate(); };
    // Preferences/observations do not start a new job: only geometry, duration or departure changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = state.key === key ? state : null;
  const modeledRoutes = useMemo(() => routes.map(route => ({
    ...route, automaticSunlight: current?.results[route.id],
  })), [routes, current]);
  const used = modeledRoutes.filter(route => usableAutomaticSunlight(route, departure)).length;
  const message = !google.length ? 'Automatic sunlight uses full Google route geometry, not demo paths.'
    : !current ? 'Calculating historical-terrain sunlight for these routes…'
      : current.error ?? `${used}/${google.length} routes have complete sunlight model coverage for experimental ranking.`;
  return { routes: modeledRoutes, message, pending: google.length > 0 && !current, used };
}
