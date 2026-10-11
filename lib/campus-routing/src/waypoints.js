import { RoutingError, validatePoint } from './routing.js';

const R = 6371000, DEG = Math.PI / 180;
const wrap = d => ((d + 540) % 360) - 180;
function xy(point, center) {
  return { x: R * wrap(point.lng - center.lng) * DEG * Math.cos(center.lat * DEG),
    y: R * (point.lat - center.lat) * DEG };
}
function distance(a, b) {
  const p = xy(a, b);
  return Math.hypot(p.x, p.y);
}
function segmentDistance(p, a, b) {
  const u = xy(a, p), v = xy(b, p);
  const dx = v.x - u.x, dy = v.y - u.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, -(u.x * dx + u.y * dy) / denominator)) : 0;
  return Math.hypot(u.x + t * dx, u.y + t * dy);
}
function pathDistance(p, path) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, segmentDistance(p, path[i - 1], path[i]));
  return best;
}
function checkedPath(path) {
  if (!Array.isArray(path) || path.length < 2 || path.length > 50000) {
    throw new RoutingError('INVALID_PATH', 'Each path needs 2–50,000 valid coordinates.');
  }
  return path.map(validatePoint);
}

/** Campus-scale geometric heuristic, not a sensory score or exact-path guarantee.
 * Returns zero points if nothing meaningfully distinguishes the selected route.
 * Measures against segments (not just vertices) to avoid sampling-density artifacts.
 */
export function selectWaypoints(chosenPath, alternativePaths = [], options = {}) {
  const chosen = checkedPath(chosenPath);
  if (!Array.isArray(alternativePaths) || alternativePaths.length > 20) throw new RoutingError('INVALID_PATH', 'Pass at most 20 alternative paths.');
  const alternatives = alternativePaths.map(checkedPath);
  const { maxWaypoints = 3, divergenceMeters = 25, spacingMeters = 75, endpointBufferMeters = 35 } = options;
  if (!Number.isInteger(maxWaypoints) || maxWaypoints < 0 || maxWaypoints > 3 ||
      ![divergenceMeters, spacingMeters, endpointBufferMeters].every(v => Number.isFinite(v) && v > 0)) {
    throw new RoutingError('INVALID_OPTIONS', 'Waypoint count must be 0–3; distances must be positive numbers.');
  }
  if (!alternatives.length || !maxWaypoints) return [];
  const cumulative = [0];
  for (let i = 1; i < chosen.length; i++) cumulative.push(cumulative.at(-1) + distance(chosen[i - 1], chosen[i]));
  const total = cumulative.at(-1);
  if (total <= endpointBufferMeters * 2) return [];
  const step = Math.max(15, total / 400);
  const candidates = [];
  let segment = 1;
  for (let along = endpointBufferMeters; along < total - endpointBufferMeters; along += step) {
    while (segment < chosen.length - 1 && cumulative[segment] < along) segment++;
    const a = chosen[segment - 1], b = chosen[segment];
    const length = cumulative[segment] - cumulative[segment - 1];
    const t = length ? (along - cumulative[segment - 1]) / length : 0;
    const point = { lat: a.lat + t * (b.lat - a.lat), lng: wrap(a.lng + t * wrap(b.lng - a.lng)) };
    if (distance(point, chosen[0]) < endpointBufferMeters || distance(point, chosen.at(-1)) < endpointBufferMeters) continue;
    const distances = alternatives.map(path => pathDistance(point, path));
    candidates.push({ point, along, distances });
  }
  const uncovered = new Set(alternatives.map((_, i) => i)), selected = [];
  while (selected.length < maxWaypoints && uncovered.size) {
    let best, bestCount = 0, bestSeparation = 0;
    for (const candidate of candidates) {
      if (selected.some(s => Math.abs(s.along - candidate.along) < spacingMeters || distance(s.point, candidate.point) < spacingMeters)) continue;
      const distinguishing = [...uncovered].filter(i => candidate.distances[i] >= divergenceMeters);
      const separation = distinguishing.length ? Math.min(...distinguishing.map(i => candidate.distances[i])) : 0;
      if (distinguishing.length > bestCount || (distinguishing.length === bestCount && separation > bestSeparation)) {
        best = candidate; bestCount = distinguishing.length; bestSeparation = separation;
      }
    }
    if (!best || !bestCount) break;
    selected.push(best);
    for (const i of uncovered) if (best.distances[i] >= divergenceMeters) uncovered.delete(i);
  }
  return selected.sort((a, b) => a.along - b.along).map(({ point }) => ({
    lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)),
  }));
}
