import type { DemoRoute, PreferenceWeights } from './route-scoring';
import type { SensoryEvidence } from './campus-observations';

// SYNTHETIC OFFLINE TEST DATA ONLY. These labels do not identify real streets
// from Google polylines and these values are not observed campus conditions.
export const illustrativePreferences: PreferenceWeights = {
  avoidNoise: 0, avoidCrowds: 100, preferShade: 0, prioritizeShortWalkingTime: 0,
  noiseAcceptance: 'high', crowdAcceptance: 'high', sunAcceptance: 'high',
  maxExtraWalkingMinutes: 3,
};
const known: SensoryEvidence = {
  status: 'verified', verifiedPercent: 100, estimatedPercent: 0, demoPercent: 0,
  observationIds: ['SYNTHETIC-offline-observation'],
};
export function illustrativeRankingRoutes(): DemoRoute[] {
  return [
    ['green-test', 'Green Street candidate — SYNTHETIC TEST', 9, 634, 60, 80, 20],
    ['quiet-test', 'Lower-crowd candidate — SYNTHETIC TEST', 10, 700, 20, 20, 55],
    ['middle-test', 'Third candidate — SYNTHETIC TEST', 11, 780, 35, 45, 80],
  ].map((row, index) => {
    const [id, name, minutes, meters, noise, crowds, sun] = row;
    return {
      id: String(id), name: String(name), routeCode: String(index + 1),
      originId: 'synthetic-start', destinationId: 'synthetic-end',
      originName: 'Synthetic start', destinationName: 'Synthetic end',
      walkingTimeMinutes: Number(minutes), durationSeconds: Number(minutes) * 60,
      distanceMeters: Number(meters), distanceMiles: Number(meters) / 1609.344,
      noiseCost: Number(noise), crowdCost: Number(crowds), sunExposureCost: Number(sun),
      source: 'google' as const,
      coordinates: [[40.107, -88.228], [40.109 + index * .001, -88.225 - index * .001], [40.112, -88.227]] as [number, number][],
      candidateWaypoints: [], researchSourceUrl: '',
      sensoryEvidence: {
        metrics: { noise: { ...known }, crowds: { ...known }, sunlight: { ...known } },
        observations: [],
      },
    };
  });
}
