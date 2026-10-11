"""Bounded official downloads. Offline is the default; cache bytes are hashed.
Run from any directory: python prediction/acquire.py --online
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
BASE = 'https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/'
COUNTS = BASE + 'pedestrian-counting-system-monthly-counts-per-hour'
LIDAR = 'https://data.isgs.illinois.edu/arcgis/rest/services/Elevation/IL_Champaign_{}_2020/ImageServer'
COHORT = [1, 2, 3, 4, 8, 9, 10, 12]
START, END = '2025-01-01', '2025-04-01'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def fetch(name, url, online=False, max_bytes=12_000_000):
    DATA.mkdir(exist_ok=True)
    path, meta = DATA / name, DATA / (name + '.source.json')
    if path.exists():
        raw = path.read_bytes()
        provenance = json.loads(meta.read_text())
        if provenance['url'] != url or provenance['sha256'] != digest(raw):
            raise ValueError('Cache URL/hash mismatch: ' + name)
        return raw
    if not online:
        raise FileNotFoundError('Missing cache; use --online: ' + name)
    allowed = {'data.melbourne.vic.gov.au', 'data.isgs.illinois.edu', 'clearinghouse.isgs.illinois.edu'}
    if urlparse(url).scheme != 'https' or urlparse(url).hostname not in allowed:
        raise ValueError('Only allowlisted official HTTPS sources are supported')
    with urlopen(url, timeout=45) as r:
        if urlparse(r.url).hostname not in allowed:
            raise ValueError('Unexpected download host')
        raw = r.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise ValueError('Response exceeded bounded download budget')
    if name.endswith('.json'):
        obj = json.loads(raw)
        if isinstance(obj, dict) and 'error' in obj:
            raise ValueError(str(obj['error']))
    path.write_bytes(raw)
    meta.write_text(json.dumps({'url': url, 'retrievedAt': datetime.now(timezone.utc).isoformat(),
                                'sha256': digest(raw), 'bytes': len(raw)}, indent=2) + '\n')
    print('Cached', name, len(raw), flush=True)
    return raw


def acquire(online=False):
    from pyproj import Transformer
    import numpy as np
    import tifffile
    fetch('crowd-metadata.json', COUNTS, online)
    fetch('sensors.json', BASE + 'pedestrian-counting-system-sensor-locations/records?' +
          urlencode({'limit': 100, 'order_by': 'location_id'}), online)
    where = "sensing_date >= date'2025-01-01' AND sensing_date < date'2025-04-01' AND location_id IN (1,2,3,4,8,9,10,12)"
    url = COUNTS + '/exports/json?' + urlencode({'where': where, 'order_by': 'sensing_date,hourday,location_id', 'limit': 20000})
    rows = json.loads(fetch('melbourne-counts.json', url, online))
    count = json.loads(fetch('crowd-query-count.json', COUNTS + '/records?' + urlencode({'where': where, 'limit': 1}), online))
    if not isinstance(rows, list) or len(rows) != count['total_count'] or len(rows) >= 20000:
        raise ValueError('Incomplete or truncated crowd export')
    fetch('lidar-metadata.xml', 'https://clearinghouse.isgs.illinois.edu/distribute/district5/champaign/2020/Champaign_2020_metadata.xml', online)
    # A bounded 1.2 km square around the Main Quad. 2 m output pixels, nearest
    # resampling; do not interpret this as the source's native 2 ft resolution.
    t = Transformer.from_crs('EPSG:4326', 'EPSG:32616', always_xy=True)
    x, y = t.transform(-88.2272, 40.1089)
    bbox = [round(x-600), round(y-600), round(x+600), round(y+600)]
    arrays, descriptors = {}, {}
    for kind in ['DSM', 'DTM']:
        base = LIDAR.format(kind)
        meta = json.loads(fetch(kind.lower() + '-service.json', base + '?f=pjson', online))
        if 'NAVD88_height' not in meta['spatialReference']['wkt'] or 'ftUS' not in meta['spatialReference']['wkt']:
            raise ValueError('Unrecognized vertical units')
        params = {'f': 'json', 'bbox': ','.join(map(str, bbox)), 'bboxSR': 32616,
                  'imageSR': 32616, 'size': '600,600', 'format': 'tiff', 'pixelType': 'F32',
                  'interpolation': 'RSP_NearestNeighbor', 'noData': '-9999',
                  'renderingRule': json.dumps({'rasterFunction': 'None'})}
        desc = json.loads(fetch(kind.lower() + '-export.json', base + '/exportImage?' + urlencode(params), online))
        # ArcGIS scratch URLs expire. A verified local cache remains usable.
        fetch(kind.lower() + '.tif', desc['href'], online)
        with tifffile.TiffFile(DATA / (kind.lower() + '.tif')) as tif:
            page = tif.pages[0]
            if page.dtype != np.dtype('float32'):
                raise ValueError('Numeric F32 raster required, not rendered map colors')
            scale = page.tags['ModelPixelScaleTag'].value
            tie = page.tags['ModelTiepointTag'].value
            e = desc['extent']
            if (tuple(scale[:2]) != (2.0,2.0) or tuple(tie[:3]) != (0.0,0.0,0.0)
                or abs(tie[3]-e['xmin']) > 1e-6 or abs(tie[4]-e['ymax']) > 1e-6
                or abs(e['xmax']-e['xmin']-1200) > 1e-6
                or abs(e['ymax']-e['ymin']-1200) > 1e-6
                or e['spatialReference'].get('wkid') != 32616):
                raise ValueError('Unexpected raster georeferencing')
            a = page.asarray().astype(float)
        if a.shape != (600, 600):
            raise ValueError('Unexpected raster dimensions')
        a[(a <= 0) | (a > 10000) | ~np.isfinite(a)] = np.nan
        arrays[kind.lower()] = a * (1200/3937)  # US survey feet -> meters
        descriptors[kind.lower()] = desc
    if descriptors['dsm']['extent'] != descriptors['dtm']['extent']:
        raise ValueError('DSM/DTM grids not aligned')
    np.savez_compressed(DATA / 'campus-grid.npz', **arrays)
    extent = descriptors['dsm']['extent']
    grid = {'crs': 'EPSG:32616', 'extent': extent, 'width': 600, 'height': 600,
            'verticalUnit': 'm', 'sourceVerticalUnit': 'US survey foot',
            'collectionStart': '2019-11-23', 'collectionEnd': '2020-03-08',
            'sourceUrl': LIDAR.format('DSM'), 'resampling': 'nearest',
            'gridSha256': digest((DATA / 'campus-grid.npz').read_bytes()),
            'limitations': ['winter_acquisition_canopy_not_summer_leaf_on', 'historical_surface',
                           '2m_resampling_can_miss_small_obstacles', 'not_field_validated']}
    (DATA / 'campus-grid.json').write_text(json.dumps(grid, indent=2)+'\n')
    print('Verified crowd records:', len(rows), 'cohort:', COHORT)
    print('LiDAR finite fractions:', {k: float(np.isfinite(a).mean()) for k, a in arrays.items()})


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--online', action='store_true')
    acquire(p.parse_args().online)
