// Offline only: no API clients or network calls. Illustrative labels and values
// are synthetic, not a replay of an actual Green Street Google response.
import { illustrativeRankingRoutes, illustrativePreferences } from '../src/lib/ranking-fixtures';
import { auditRouteRanking } from '../src/lib/route-ranking-audit';

const routes = illustrativeRankingRoutes();
const cases = {
  crowd100: illustrativePreferences,
  noise100: { ...illustrativePreferences, avoidCrowds: 0, avoidNoise: 100 },
  walking100: { ...illustrativePreferences, avoidCrowds: 0, prioritizeShortWalkingTime: 100 },
  allZero: { ...illustrativePreferences, avoidCrowds: 0 },
  strictCrowds: { ...illustrativePreferences, crowdAcceptance: 'low' as const },
  zeroExtraWalking: { ...illustrativePreferences, maxExtraWalkingMinutes: 0 },
};
console.log('SYNTHETIC OFFLINE FIXTURES — NOT REAL STREET OBSERVATIONS OR GOOGLE RESPONSES');
for (const [name, settings] of Object.entries(cases)) {
  console.log(`\n${name}`);
  console.table(auditRouteRanking(routes, settings).map(row => ({
    id: row.id, minutes: row.durationMinutes, meters: row.distanceMeters,
    crowd: row.crowd.displayValue, noise: row.noise.displayValue, sun: row.sunlight.displayValue,
    crowdSource: row.crowd.status, crowdCoverage: row.crowd.verifiedPercent,
    eligible: row.eligible, withinExtraWalk: row.withinWalkingLimit,
    cost: row.finalCost, reason: row.reason,
  })));
}
