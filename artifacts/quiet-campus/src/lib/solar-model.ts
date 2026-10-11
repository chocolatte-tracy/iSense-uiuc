/** Browser execution of the existing historical DSM model, not a new forecast source. */
import proj4 from 'proj4';
import type { SolarGrid } from './solar-grid';
import { SOLAR_GRID_HASH } from './solar-grid';
import { solarPosition } from './solar-position';
import type { exportPredictionRoutes, ResearchPrediction } from './research-prediction';

type ExportedRoute = Awaited<ReturnType<typeof exportPredictionRoutes>>['routes'][number];
export type SolarState = 'sunlit' | 'shaded' | 'night' | 'unknown';
const projection = proj4('EPSG:4326', '+proj=utm +zone=16 +datum=WGS84 +units=m +no_defs');
const radians = Math.PI / 180;

function sample(grid: SolarGrid, array: Float64Array, x: number, y: number) {
  const col = Math.floor((x - grid.xmin) / ((grid.xmax - grid.xmin) / grid.width));
  const row = Math.floor((grid.ymax - y) / ((grid.ymax - grid.ymin) / grid.height));
  if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return null;
  const value = array[row * grid.width + col];
  return Number.isFinite(value) ? value : null;
}

export function traceSun(grid: SolarGrid, x: number, y: number, elevation: number, azimuth: number): SolarState {
  if (elevation <= 0) return 'night';
  if (elevation < 10) return 'unknown';
  const ground = sample(grid, grid.dtm, x, y);
  if (ground === null) return 'unknown';
  const step = Math.min((grid.xmax - grid.xmin) / grid.width, (grid.ymax - grid.ymin) / grid.height) / 2;
  const east = Math.sin(azimuth * radians), north = Math.cos(azimuth * radians);
  const rise = Math.tan(elevation * radians);
  let unknown = false;
  for (let distance = 0; distance < 300 + step / 2; distance += step) {
    const surface = sample(grid, grid.dsm, x + east * distance, y + north * distance);
    if (surface === null) unknown = true;
    else if (surface > ground + 1.5 + rise * distance) return 'shaded';
  }
  return unknown ? 'unknown' : 'sunlit';
}

export function predictBrowserSunlight(route: ExportedRoute, grid: SolarGrid): ResearchPrediction {
  const points = route.geometry.coordinates.map(point => projection.forward(point));
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + Math.hypot(
    points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const total = cumulative.at(-1)!;
  if (!Number.isFinite(total) || total <= 0 || total > 20000) throw new Error('Route length unsupported by the sunlight model.');
  const lengths = { sunlit: 0, shaded: 0, night: 0, unknown: 0 };
  let segment = 0;
  for (let lo = 0; lo < total; lo += 5) {
    const hi = Math.min(lo + 5, total), mid = (lo + hi) / 2;
    while (segment < points.length - 2 && cumulative[segment + 1] <= mid) segment++;
    const distance = cumulative[segment + 1] - cumulative[segment];
    const fraction = (mid - cumulative[segment]) / distance;
    const x = points[segment][0] + (points[segment + 1][0] - points[segment][0]) * fraction;
    const y = points[segment][1] + (points[segment + 1][1] - points[segment][1]) * fraction;
    const [lon, lat] = projection.inverse([x, y]);
    const at = new Date(new Date(route.binding.departureAt).getTime() + route.binding.durationMilliseconds * mid / total);
    const { elevation, azimuth } = solarPosition(at, lat, lon);
    const projectedNorth = projection.forward([lon, lat + .0001]);
    const gridAzimuth = azimuth + Math.atan2(projectedNorth[0] - x, projectedNorth[1] - y) / radians;
    lengths[traceSun(grid, x, y, elevation, gridAzimuth)] += hi - lo;
  }
  const lower = lengths.sunlit / total, upper = (lengths.sunlit + lengths.unknown) / total;
  const coverage = Math.max(0, Math.min(1, 1 - lengths.unknown / total));
  return {
    schemaVersion: '2.3', routeId: route.id, binding: route.binding, departureAt: route.binding.departureAt,
    evidenceType: 'modeled_direct_sunlight', metric: 'direct_sunlit_length_fraction', unit: 'fraction',
    rankingEligible: false, status: total - lengths.unknown > 0 ? 'modeled' : 'unknown',
    value: lengths.unknown < 1e-8 ? lower : null, coverageFraction: coverage,
    sunlitFractionBounds: [lower, upper], modeledSunlitMinutesBounds: [route.durationMinutes * lower, route.durationMinutes * upper],
    totalRouteLengthMeters: total, coveredRouteLengthMeters: total - lengths.unknown, lengthsMeters: lengths,
    source: { gridSha256: SOLAR_GRID_HASH },
    model: { id: 'dsm-solar-raytrace', version: '0.1', radiusMeters: 300, receiverHeightMeters: 1.5,
      routeSpacingMeters: 5, constantWalkingSpeedAssumption: true },
    boundsMeaning: 'Missing-support bounds only, not a confidence interval or model-error bound',
    limitations: ['Historical winter terrain (2019–2020), not current or summer canopy.',
      'Clear-sky potential direct sun; clouds, UV, temperature and thermal comfort are not modeled.',
      '2 m grid, 300 m ray radius, 1.5 m receiver height and constant walking speed.',
      'Solar elevation below 10° is unknown; nighttime is separate from tree shade.',
      'Not field validated. Complete model coverage is not proof of prediction accuracy.',
      'Sources: USGS; Illinois State Geological Survey / Prairie Research Institute, UIUC.'],
  };
}
