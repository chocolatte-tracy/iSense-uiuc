"""Offline v2.3 bridge for the current iSense app. Never contacts a routing API."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from shade import instant, load_grid, route_prediction


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def canonical_time(text):
    return instant(text).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def validate_request(payload):
    if not isinstance(payload, dict) or payload.get('schemaVersion') != 'isense-research-1':
        raise ValueError('Export a v2.3 route request from the app')
    departure = canonical_time(payload['departureAt'])
    routes = payload.get('routes')
    if not isinstance(routes, list) or not 1 <= len(routes) <= 8:
        raise ValueError('One to eight routes required')
    requests = set()
    for r in routes:
        if (r.get('source') != 'google' or r.get('geometryStatus') != 'complete_verified'
            or r.get('crs') != 'EPSG:4326' or r.get('coordinateOrder') != 'longitude,latitude'
            or r.get('geometry', {}).get('type') != 'LineString'):
            raise ValueError('Complete Google WGS84 geometry required')
        if not isinstance(r.get('id'), str) or not r['id']:
            raise ValueError('Route ID required')
        coords = r['geometry'].get('coordinates')
        if not isinstance(coords, list) or not 2 <= len(coords) <= 10000:
            raise ValueError('Two to 10,000 vertices required')
        for p in coords:
            if (not isinstance(p, list) or len(p) != 2
                or any(type(v) not in (int, float) or not math.isfinite(v) for v in p)
                or not -88.3 <= p[0] <= -88.15 or not 40.05 <= p[1] <= 40.17):
                raise ValueError('UIUC longitude, latitude pairs required')
        # Match JavaScript Math.round, including negative longitude ties.
        geometry_hash = digest(';'.join(','.join(str(math.floor(v * 1e7 + .5)) for v in p) for p in coords))
        seconds = r.get('durationSeconds')
        if type(seconds) not in (int, float) or not math.isfinite(seconds) or not 0 < seconds <= 86400:
            raise ValueError('Positive finite duration required')
        millis = math.floor(seconds * 1000 + .5)
        minutes = r.get('durationMinutes')
        if type(minutes) not in (int, float) or not math.isfinite(minutes) or abs(minutes - millis / 60000) > 1e-9:
            raise ValueError('Duration units do not agree')
        if millis <= 0:
            raise ValueError('Duration too short')
        expected = {'geometrySha256': geometry_hash, 'durationMilliseconds': millis,
                    'departureAt': departure,
                    'requestSha256': digest(f'isense-research-1\n{geometry_hash}\n{millis}\n{departure}')}
        if r.get('binding') != expected:
            raise ValueError('Route shape, duration or departure binding mismatch')
        if expected['requestSha256'] in requests:
            raise ValueError('Duplicate route snapshots are ambiguous')
        requests.add(expected['requestSha256'])
    return routes, departure


def predict(payload):
    routes, departure = validate_request(payload)
    grid = load_grid()
    predictions = []
    for route in routes:
        result = route_prediction(route, departure, grid)
        result.update(schemaVersion='2.3', departureAt=departure, binding=route['binding'])
        predictions.append(result)
    return {'schemaVersion': 'isense-research-results-1', 'routes': predictions,
            'note': 'Offline historical terrain model. Bindings detect mismatches, not authenticity. Never eligible for ranking.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.request.stat().st_size > 8 * 1024 * 1024:
        parser.error('Request exceeds 8 MB')
    if args.request.resolve() == args.output.resolve():
        parser.error('Output must not overwrite the request')
    payload = json.loads(args.request.read_text())
    result = predict(payload)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print(f"Wrote {len(result['routes'])} offline route prediction(s) to {args.output}")


if __name__ == '__main__':
    main()
