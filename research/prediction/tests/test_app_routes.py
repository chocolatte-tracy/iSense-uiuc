"""Synthetic contract checks; acquired grid exercised by the cross-language test."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app_routes import canonical_time, digest, validate_request


def request():
    at = '2026-06-21T15:00:00.000Z'
    coords = [[-88.2272, 40.108], [-88.2274, 40.1088]]
    geometry_hash = digest('-882272000,401080000;-882274000,401088000')
    binding = {'geometrySha256': geometry_hash, 'durationMilliseconds': 185250,
               'departureAt': at, 'requestSha256': digest(f'isense-research-1\n{geometry_hash}\n185250\n{at}')}
    return {'schemaVersion': 'isense-research-1', 'departureAt': at, 'routes': [{
        'id': 'synthetic-fixture', 'source': 'google', 'geometryStatus': 'complete_verified',
        'crs': 'EPSG:4326', 'coordinateOrder': 'longitude,latitude',
        'durationSeconds': 185.25, 'durationMinutes': 3.0875,
        'geometry': {'type': 'LineString', 'coordinates': coords}, 'binding': binding}]}


class AppContractTests(unittest.TestCase):
    def test_valid_request_exact_duration_and_utc(self):
        routes, at = validate_request(request())
        self.assertEqual(routes[0]['durationSeconds'], 185.25)
        self.assertEqual(at, '2026-06-21T15:00:00.000Z')
        self.assertEqual(canonical_time('2026-06-21T10:00:00-05:00'), at)

    def test_mismatched_geometry_duration_and_departure_rejected(self):
        for mutate in [
            lambda p: p['routes'][0]['geometry']['coordinates'][0].__setitem__(0, -88.22),
            lambda p: p['routes'][0].__setitem__('durationSeconds', 200),
            lambda p: p.__setitem__('departureAt', '2026-06-22T15:00:00.000Z'),
            lambda p: p['routes'][0]['binding'].__setitem__('requestSha256', '0'*64),
            lambda p: p['routes'][0].__setitem__('source', 'demo'),
            lambda p: p['routes'][0].__setitem__('durationSeconds', float('nan')),
            lambda p: p['routes'][0].__setitem__('durationMinutes', True),
        ]:
            p = request(); mutate(p)
            with self.assertRaises(ValueError): validate_request(p)

    def test_duplicate_snapshots_and_bad_coordinates_rejected(self):
        p = request(); p['routes'].append(copy.deepcopy(p['routes'][0]))
        with self.assertRaises(ValueError): validate_request(p)
        for coords in [[], [[40.108, -88.2272]]*2, [[True, 40.108]]*2, [[float('inf'), 40.108]]*2]:
            p = request(); p['routes'][0]['geometry']['coordinates'] = coords
            with self.assertRaises(ValueError): validate_request(p)

    def test_dst_instants_remain_distinct(self):
        self.assertNotEqual(canonical_time('2026-11-01T01:55:00-05:00'), canonical_time('2026-11-01T01:55:00-06:00'))
        with self.assertRaises(ValueError): canonical_time('2026-11-01T01:55:00')


if __name__ == '__main__': unittest.main()
