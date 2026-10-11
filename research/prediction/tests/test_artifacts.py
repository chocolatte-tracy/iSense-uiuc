"""Checks on acquired evidence, skipped only when running source-only tests."""
import hashlib
import json
import sys
import unittest
from pathlib import Path

import numpy as np
import tifffile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import shade
import crowd

ROOT=Path(__file__).resolve().parents[1]


@unittest.skipUnless((ROOT/'data/campus-grid.npz').exists(),'No acquired raster cache')
class RealDataTests(unittest.TestCase):
    def test_all_downloaded_source_hashes(self):
        for p in (ROOT/'data').glob('*.source.json'):
            meta=json.loads(p.read_text())
            raw=p.with_name(p.name.removesuffix('.source.json')).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(),meta['sha256'],p.name)

    def test_numeric_feet_to_meters_conversion_and_extent(self):
        g=shade.load_grid()
        for kind,actual in [('dsm',g.dsm),('dtm',g.dtm)]:
            source=tifffile.imread(ROOT/'data'/f'{kind}.tif')
            self.assertEqual(source.dtype,np.dtype('float32'))
            np.testing.assert_allclose(actual,source.astype(float)*(1200/3937))
        self.assertEqual(g.dx,2)
        self.assertEqual(g.dy,2)
        self.assertGreater(float(np.median(g.dtm)),180)
        self.assertLess(float(np.median(g.dtm)),250)

    @unittest.skipUnless((ROOT/'data/melbourne-counts.json').exists(), 'Melbourne raw cache excluded from public handoff')
    def test_real_split_disjoint_keys_and_stations(self):
        rows,q=crowd.load_rows();parts=crowd.split(rows)
        keys=lambda rr:{(r['station'],r['date'],r['hour']) for r in rr}
        self.assertFalse(keys(parts['train']) & keys(parts['future_test']))
        self.assertFalse(keys(parts['validation']) & keys(parts['future_test']))
        self.assertFalse({r['station'] for r in parts['train']} & {r['station'] for r in parts['unseen_station_test']})
        self.assertEqual(q['acceptedRows'],17032)

    @unittest.skipUnless((ROOT/'results/crowd-predictions.json').exists(), 'Crowd outputs excluded from public handoff')
    def test_actual_predictions_are_nonnegative_and_not_rankable(self):
        e=json.loads((ROOT/'results/crowd-evaluation.json').read_text())
        self.assertFalse(e['rankingEligible'])
        self.assertLess(e['exportMaxAbsoluteError'],1e-7)
        for r in json.loads((ROOT/'results/crowd-predictions.json').read_text()):
            self.assertGreaterEqual(r['prediction'],0)


if __name__=='__main__':unittest.main()
