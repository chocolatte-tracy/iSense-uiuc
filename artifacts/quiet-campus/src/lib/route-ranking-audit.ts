import { applySunContext, rankRoutes, type DemoRoute, type PreferenceWeights } from './route-scoring';
import { rankingMetricEvidence } from './ranking-evidence';
import type { SunContext } from './sun-context';

export function auditRouteRanking(routes: DemoRoute[], preferences: PreferenceWeights, context?: SunContext) {
  const ranked = rankRoutes(routes, preferences, context);
  const fastest = routes.length ? Math.min(...routes.map(route => route.walkingTimeMinutes)) : 0;
  return routes.map(input => {
    const route = applySunContext(input, context);
    const score = ranked.find(candidate => candidate.id === route.id);
    const withinWalkingLimit = route.walkingTimeMinutes - fastest <= preferences.maxExtraWalkingMinutes;
    return {
      id: route.id, name: route.name, durationMinutes: route.walkingTimeMinutes,
      distanceMeters: route.distanceMeters ?? route.distanceMiles * 1609.344,
      geometrySource: route.source === 'google' ? 'Google response geometry (fixtures must be labeled synthetic)' : 'Candidate research; not verified turn geometry',
      crowd: rankingMetricEvidence(route, 'crowds'), noise: rankingMetricEvidence(route, 'noise'),
      sunlight: rankingMetricEvidence(route, 'sunlight'), weights: {
        noise: preferences.avoidNoise, crowds: preferences.avoidCrowds,
        sunlight: preferences.preferShade, walkingTime: preferences.prioritizeShortWalkingTime,
      },
      acceptance: { noise: preferences.noiseAcceptance, crowds: preferences.crowdAcceptance, sunlight: preferences.sunAcceptance },
      maxExtraWalkingMinutes: preferences.maxExtraWalkingMinutes,
      eligible: Boolean(score), withinWalkingLimit,
      finalCost: score?.score ?? null,
      acceptanceStatus: score?.acceptanceStatus ?? null,
      breakdown: score?.scoreBreakdown ?? [],
      reason: !withinWalkingLimit ? 'Excluded by the hard maximum extra-walking limit.'
        : !score ? 'Other candidates satisfy comfort bounds; this candidate is excluded.'
          : ranked[0]?.id !== route.id ? 'Eligible alternative with higher cost or a later deterministic tie-break.'
            : score.provisional ? 'Lowest rule-based cost among eligible candidates, but sensory evidence is incomplete: provisional, not proven least crowded.'
              : 'Lowest rule-based cost among eligible candidates; equal costs use walking time then geometry, never Google response order.',
    };
  });
}
