import copy
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import acquire
import crowd
import shade


def fixture(station=1,day='2025-01-01',hour=12,count=4):
    return {'location_id':station,'sensing_date':day,'hourday':hour,'pedestriancount':count,
            'direction_1':count,'direction_2':0,'id':f'{station}-{day}-{hour}',
            'location':{'lat':-37.81,'lon':144.96}}


class CrowdTests(unittest.TestCase):
    def test_missing_target_not_zero(self):
        rows,q=crowd.normalize([fixture(count=0),fixture(hour=13,count=None)])
        self.assertEqual(len(rows),1)
        self.assertEqual(q['zeroCountsRetained'],1)
        self.assertFalse(q['missingTargetsImputed'])

    def test_duplicate_not_double_counted(self):
        r=fixture(); rows,q=crowd.normalize([r,copy.deepcopy(r)])
        self.assertEqual(len(rows),1)
        self.assertEqual(q['duplicateRows'],1)
        with self.assertRaises(RuntimeError):crowd.normalize([r,fixture(count=5)])

    def test_sum_mismatch_rejected(self):
        r=fixture();r['direction_1']=2
        rows,q=crowd.normalize([fixture(hour=11),r])
        self.assertEqual(len(rows),1)
        self.assertIn('direction_total_mismatch',q['rejected'])

    def test_station_movement_not_pooled(self):
        r=fixture(hour=13);r['location']['lat']=-37.82
        with self.assertRaises(ValueError):crowd.normalize([fixture(),r])

    def test_station_and_time_holdouts(self):
        rows,_=crowd.normalize([fixture(s,d) for s in [1,10] for d in ['2025-02-28','2025-03-01','2025-03-17']])
        parts=crowd.split(rows)
        self.assertEqual([r['date'] for r in parts['train']],['2025-02-28'])
        self.assertEqual([r['date'] for r in parts['validation']],['2025-03-01'])
        self.assertEqual([r['station'] for r in parts['unseen_station_test']],[10])

    def test_target_not_in_input_features(self):
        rows,_=crowd.normalize([fixture()]); altered=copy.deepcopy(rows)
        altered[0]['count']=10**9
        np.testing.assert_array_equal(crowd.features(rows),crowd.features(altered))

    def test_baseline_only_fits_training_targets(self):
        rows,_=crowd.normalize([fixture(),fixture(day='2025-03-17',count=999999)])
        model=crowd.baseline_fit(crowd.split(rows)['train'])
        self.assertEqual(model['mean'],4)

    def test_poisson_json_export_parity(self):
        from sklearn.ensemble import HistGradientBoostingRegressor
        rng=np.random.default_rng(0);x=rng.normal(size=(120,5));y=np.exp(x[:,0])
        model=HistGradientBoostingRegressor(loss='poisson',max_iter=3,min_samples_leaf=5,early_stopping=False).fit(x,y)
        exported=crowd.export_boosting(model)
        np.testing.assert_allclose(crowd.exported_predict(exported,x),model.predict(x),atol=1e-9)

    def test_uiuc_rejects_monthly_and_missing_quality(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'input.csv';out=Path(d)/'out.json'
            header='station_id,start_at,end_at,count,latitude,longitude,quality,source_url\n'
            path.write_text(header+'A,2025-01-01T00:00:00-06:00,2025-02-01T00:00:00-06:00,100,40.11,-88.22,valid,https://example.org/source\n')
            with self.assertRaises(ValueError):crowd.import_uiuc(path,out)
            self.assertFalse(out.exists())

    def test_uiuc_preserves_zero_suspect_and_dst_instants(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'input.csv';out=Path(d)/'out.json'
            header='station_id,start_at,end_at,count,latitude,longitude,quality,source_url\n'
            path.write_text(header+'A,2025-11-02T01:00:00-05:00,2025-11-02T01:15:00-05:00,0,40.11,-88.22,suspect,https://example.org/source\n'+
                            'A,2025-11-02T01:00:00-06:00,2025-11-02T01:15:00-06:00,,40.11,-88.22,missing,https://example.org/source\n')
            rows=crowd.import_uiuc(path,out)
            self.assertEqual(len(rows),2);self.assertEqual(rows[0]['value'],0)
            self.assertIsNone(rows[1]['value'])
            self.assertFalse(rows[0]['rankingEligible'])

    def test_uiuc_overlaps_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'input.csv'
            path.write_text('station_id,start_at,end_at,count,latitude,longitude,quality,source_url\n'+
            'A,2025-01-01T01:00:00-06:00,2025-01-01T01:15:00-06:00,1,40.11,-88.22,valid,https://example.org\n'+
            'A,2025-01-01T01:05:00-06:00,2025-01-01T01:20:00-06:00,1,40.11,-88.22,valid,https://example.org\n')
            with self.assertRaises(ValueError):crowd.import_uiuc(path,Path(d)/'o.json')

    def test_uiuc_station_not_predicted_by_melbourne_model(self):
        r=crowd.predict({'knownStations':{}},999,'2026-01-01T12:00:00-06:00')
        self.assertIsNone(r['value']);self.assertFalse(r['rankingEligible'])


class ShadeTests(unittest.TestCase):
    def grid(self):
        a=np.zeros((100,100))
        return shade.Grid(a.copy(),a.copy(),{'extent':{'xmin':0,'ymin':0,'xmax':100,'ymax':100},'verticalUnit':'m'})

    def test_wall_casts_shadow_in_correct_direction(self):
        g=self.grid();g.dsm[:,60:62]=20
        self.assertEqual(g.trace(50,50,45,90,radius=30)[0],'shaded')
        self.assertEqual(g.trace(50,50,45,270,radius=30)[0],'sunlit')
        self.assertEqual(g.trace(50,50,80,90,radius=30)[0],'sunlit')

    def test_missing_ray_and_boundary_are_unknown(self):
        g=self.grid();g.dsm[49:52,60:62]=np.nan
        self.assertEqual(g.trace(50,50,45,90,radius=30)[0],'unknown')
        self.assertEqual(g.trace(90,50,45,90,radius=30)[0],'unknown')

    def test_known_obstruction_survives_unknown_farther_ray(self):
        g=self.grid();g.dsm[:,60:62]=20;g.dsm[:,70:]=np.nan
        self.assertEqual(g.trace(50,50,45,90,radius=30)[0],'shaded')

    def test_no_data_ground_not_zero_height(self):
        g=self.grid();g.dtm[:]=np.nan
        self.assertEqual(g.trace(50,50,45,90,radius=30)[0],'unknown')

    def test_night_is_not_shade_and_low_sun_is_unknown(self):
        g=self.grid()
        self.assertEqual(g.trace(50,50,-10,90)[0],'night')
        self.assertEqual(g.trace(50,50,5,90)[0],'unknown')

    def test_solar_timezone_and_equinox_sanity(self):
        a=shade.solar_position(shade.instant('2025-03-20T12:00:00Z'),0,0)[0]
        self.assertGreater(a,87)
        self.assertLess(shade.solar_position(shade.instant('2025-03-20T00:00:00Z'),0,0)[0],-87)
        self.assertEqual(shade.instant('2025-06-21T10:00:00-05:00'),shade.instant('2025-06-21T15:00:00Z'))
        with self.assertRaises(ValueError):shade.instant('2025-06-21T10:00:00')

    def test_bad_geometry_rejected(self):
        with self.assertRaises(ValueError):shade.route_prediction({},'2025-06-21T12:00:00Z',self.grid())

    def test_route_densification_preserves_length_and_prediction(self):
        from pyproj import Transformer
        t=Transformer.from_crs(4326,32616,always_xy=True);x,y=t.transform(-88.2272,40.1089)
        a=np.zeros((800,800))
        meta={'extent':{'xmin':x-800,'ymin':y-800,'xmax':x+800,'ymax':y+800},'verticalUnit':'m','crs':'EPSG:32616'}
        g=shade.Grid(a,a,meta)
        p1=[-88.2272,40.108];p2=[-88.2272,40.110]
        r={'id':'synthetic','geometryStatus':'diagnostic_only','source':'test','crs':'EPSG:4326','coordinateOrder':'longitude,latitude',
           'durationMinutes':3,'geometry':{'type':'LineString','coordinates':[p1,p2]}}
        first=shade.route_prediction(r,'2025-06-21T13:00:00-05:00',g)
        r['geometry']['coordinates']=[p1,[-88.2272,40.109],p2]
        second=shade.route_prediction(r,'2025-06-21T13:00:00-05:00',g)
        self.assertAlmostEqual(first['totalRouteLengthMeters'],second['totalRouteLengthMeters'],places=5)
        self.assertEqual(first['sunlitFractionBounds'],second['sunlitFractionBounds'])
        self.assertFalse(first['rankingEligible'])


class CacheTests(unittest.TestCase):
    def test_offline_cache_tampering_rejected(self):
        with tempfile.TemporaryDirectory() as d,patch.object(acquire,'DATA',Path(d)):
            p=Path(d)/'x.json';p.write_text('{}')
            (Path(d)/'x.json.source.json').write_text(json.dumps({'url':'https://example.org','sha256':'bad'}))
            with self.assertRaises(ValueError):acquire.fetch('x.json','https://example.org')

    def test_network_requires_explicit_online(self):
        with tempfile.TemporaryDirectory() as d,patch.object(acquire,'DATA',Path(d)):
            with self.assertRaises(FileNotFoundError):acquire.fetch('missing.json','https://example.org')


if __name__=='__main__':unittest.main()
