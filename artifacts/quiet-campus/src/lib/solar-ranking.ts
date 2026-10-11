import type { DemoRoute } from './route-scoring';
import type { SunContext } from './sun-context';
import { routeSnapshotKey, type ResearchPrediction } from './research-prediction';
export type AutomaticSunlight = { snapshot: string; result: ResearchPrediction };

/** App-approved experimental policy, separate from the model's unvalidated flag.
 * A fraction×100 is physical direct-sun percentage, not calibrated comfort.
 */
export function boundAutomaticSunlight(route: DemoRoute, departure?: Date) {
  const prediction = route.automaticSunlight;
  if (!prediction || route.source !== 'google' || prediction.snapshot !== routeSnapshotKey(route)) return null;
  const r = prediction.result;
  if (r.binding.durationMilliseconds !== Math.round((route.durationSeconds ?? 0) * 1000)
    || r.binding.departureAt !== r.departureAt) return null;
  if (departure && r.departureAt !== departure.toISOString()) return null;
  return r;
}
export function usableAutomaticSunlight(route: DemoRoute, departure?: Date) {
  const r = boundAutomaticSunlight(route, departure);
  if (!r) return null;
  return r.status === 'modeled' && r.value !== null && Number.isFinite(r.value) && r.value >= 0 && r.value <= 1
    && r.coverageFraction >= 1 - 1e-10 && r.lengthsMeters.unknown < 1e-8 ? r : null;
}

export function modelAwareSunContext(routes: DemoRoute[], context?: SunContext) {
  // A walk starting at night may cross sunrise. Whole-trip predictions take
  // precedence over suppressing sunlight solely from the departure phase.
  return context?.phase === 'nighttime' && routes.some(route => {
    const r = usableAutomaticSunlight(route, context.departureTime);
    return r !== null && r.value! > 0;
  }) ? { ...context, phase: 'daytime' as const } : context;
}
