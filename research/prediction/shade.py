"""Approximate direct-beam obstruction from a historical DSM, never measured shade."""
import argparse
import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent


def instant(text):
    d = datetime.fromisoformat(text.replace('Z', '+00:00'))
    if d.tzinfo is None:
        raise ValueError('Explicit timezone required')
    return d.astimezone(timezone.utc)


def solar_position(at, latitude, longitude):
    """NOAA fractional-year approximation; azimuth clockwise from true north.
    Reference: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
    Geometric sun center, no refraction; low elevation is rejected by the model.
    """
    t = at.astimezone(timezone.utc)
    hour = t.hour + t.minute/60 + t.second/3600
    leap = t.year % 4 == 0 and (t.year % 100 != 0 or t.year % 400 == 0)
    gamma = 2*math.pi/(366 if leap else 365)*(t.timetuple().tm_yday-1+(hour-12)/24)
    eq = 229.18*(.000075+.001868*math.cos(gamma)-.032077*math.sin(gamma)
                 -.014615*math.cos(2*gamma)-.040849*math.sin(2*gamma))
    dec = (.006918-.399912*math.cos(gamma)+.070257*math.sin(gamma)
           -.006758*math.cos(2*gamma)+.000907*math.sin(2*gamma)
           -.002697*math.cos(3*gamma)+.00148*math.sin(3*gamma))
    h = math.radians(((hour*60+eq+4*longitude) % 1440)/4-180)
    lat = math.radians(latitude)
    up = math.sin(lat)*math.sin(dec)+math.cos(lat)*math.cos(dec)*math.cos(h)
    east = -math.cos(dec)*math.sin(h)
    north = math.cos(lat)*math.sin(dec)-math.sin(lat)*math.cos(dec)*math.cos(h)
    return math.degrees(math.asin(max(-1, min(1, up)))), math.degrees(math.atan2(east, north)) % 360


class Grid:
    def __init__(self, dsm, dtm, meta):
        self.dsm, self.dtm, self.meta = dsm, dtm, meta
        e = meta['extent']
        self.xmin, self.ymin, self.xmax, self.ymax = [e[k] for k in ['xmin','ymin','xmax','ymax']]
        self.height, self.width = dsm.shape
        self.dx, self.dy = (self.xmax-self.xmin)/self.width, (self.ymax-self.ymin)/self.height
        if dsm.shape != dtm.shape or min(self.dx, self.dy) <= 0 or meta['verticalUnit'] != 'm':
            raise ValueError('Aligned meter grids required')

    def sample(self, a, x, y):
        col, row = math.floor((x-self.xmin)/self.dx), math.floor((self.ymax-y)/self.dy)
        if 0 <= row < self.height and 0 <= col < self.width:
            v = float(a[row, col])
            return v if math.isfinite(v) else None
        return None

    def trace(self, x, y, elevation, azimuth, radius=300, eye_height=1.5):
        if not all(math.isfinite(v) for v in [x,y,elevation,azimuth,radius,eye_height]) or radius <= 0 or eye_height <= 0:
            raise ValueError('Finite positive tracing parameters required')
        if elevation <= 0:
            return 'night', 'sun_below_geometric_horizon'
        if elevation < 10:
            return 'unknown', 'low_sun_exceeds_local_model_scope'
        ground = self.sample(self.dtm, x, y)
        if ground is None:
            return 'unknown', 'missing_receiver_ground'
        origin = ground + eye_height
        east, north = math.sin(math.radians(azimuth)), math.cos(math.radians(azimuth))
        rise = math.tan(math.radians(elevation))
        # Half-pixel steps reduce diagonal aliasing. This is a sampled model,
        # not a proof of continuous or out-of-window terrain visibility.
        step = min(self.dx, self.dy)/2
        unknown = False
        for distance in np.arange(0, radius+step/2, step):
            surface = self.sample(self.dsm, x+east*distance, y+north*distance)
            if surface is None:
                unknown = True
            elif surface > origin+rise*distance:
                return 'shaded', 'modeled_surface_obstruction'
        if unknown:
            return 'unknown', 'missing_or_outside_ray_support'
        return 'sunlit', 'no_obstruction_within_model_radius'


def load_grid(directory=None):
    directory = Path(directory or ROOT/'data')
    meta = json.loads((directory/'campus-grid.json').read_text())
    raw = (directory/'campus-grid.npz').read_bytes()
    if hashlib.sha256(raw).hexdigest() != meta['gridSha256']:
        raise ValueError('Raster cache hash mismatch')
    with np.load(directory/'campus-grid.npz', allow_pickle=False) as a:
        return Grid(a['dsm'], a['dtm'], meta)


def route_prediction(route, departure, grid, spacing=5, radius=300):
    if not 0 < spacing <= 20 or not 0 < radius <= 1000:
        raise ValueError('Invalid numerical resolution or search radius')
    if route.get('crs') != 'EPSG:4326' or route.get('coordinateOrder') != 'longitude,latitude' or route.get('geometry',{}).get('type') != 'LineString':
        raise ValueError('Explicit WGS84 lon,lat LineString required')
    coords = np.asarray(route['geometry']['coordinates'], dtype=float)
    if coords.ndim != 2 or coords.shape[1] != 2 or len(coords) < 2 or not np.isfinite(coords).all():
        raise ValueError('Finite coordinate pairs required')
    if not ((coords[:,0] >= -88.3) & (coords[:,0] <= -88.15) & (coords[:,1] >= 40.05) & (coords[:,1] <= 40.17)).all():
        raise ValueError('Route outside UIUC domain')
    duration = route.get('durationMinutes')
    if not isinstance(duration,(int,float)) or not math.isfinite(duration) or duration <= 0:
        raise ValueError('Positive walking duration required')
    start = instant(departure)
    t = Transformer.from_crs('EPSG:4326', grid.meta['crs'], always_xy=True)
    inv = Transformer.from_crs(grid.meta['crs'], 'EPSG:4326', always_xy=True)
    points = np.array([t.transform(*c) for c in coords])
    lengths = np.linalg.norm(np.diff(points,axis=0),axis=1)
    cumulative = np.r_[0, np.cumsum(lengths)]
    total = float(cumulative[-1])
    if total <= 0 or total > 20000:
        raise ValueError('Route length unsupported')
    # Arc-length bins are invariant to redundant polyline vertices.
    edges = np.r_[np.arange(0,total,spacing),total]
    totals = {k:0.0 for k in ['sunlit','shaded','night','unknown']}
    samples = []
    for lo,hi in zip(edges[:-1],edges[1:]):
        mid = (lo+hi)/2
        i = min(int(np.searchsorted(cumulative,mid,side='right')-1),len(lengths)-1)
        p = points[i]+(points[i+1]-points[i])*((mid-cumulative[i])/lengths[i])
        lon,lat = inv.transform(*p)
        at = start + timedelta(minutes=duration*mid/total)
        elev, az = solar_position(at,lat,lon)
        # Correct true solar north for grid north using the local projected
        # north direction; UTM convergence is not silently ignored.
        pn = np.array(t.transform(lon,lat+.0001))-p
        az_grid = az+math.degrees(math.atan2(pn[0],pn[1]))
        state,reason = grid.trace(*p,elev,az_grid,radius)
        totals[state] += hi-lo
        samples.append({'fromMeters':float(lo),'toMeters':float(hi),'lon':lon,'lat':lat,
                        'at':at.isoformat(),'solarElevationDegrees':elev,'state':state,'reason':reason})
    known = total-totals['unknown']
    lower,upper = totals['sunlit']/total,(totals['sunlit']+totals['unknown'])/total
    valid_geometry = route.get('geometryStatus') == 'complete_verified' and route.get('source') == 'google'
    return {'schemaVersion':'2.2','routeId':route['id'],'evidenceType':'modeled_direct_sunlight',
            'metric':'direct_sunlit_length_fraction','unit':'fraction','departureAt':start.isoformat(),
            'status':'modeled' if known > 0 else 'unknown','value':lower if totals['unknown'] < 1e-8 else None,
            'coverageFraction':known/total,'sunlitFractionBounds':[lower,upper],
            'boundsMeaning':'Missing-support bounds only, not an uncertainty interval for model error',
            'modeledSunlitMinutesBounds':[duration*lower,duration*upper],
            'coveredRouteLengthMeters':known,'totalRouteLengthMeters':total,'lengthsMeters':totals,
            'geometryVerified':valid_geometry,'rankingEligible':False,
            'rankingReasons':['historical_local_obstruction_model_not_field_validated'] + ([] if valid_geometry else ['diagnostic_geometry_not_verified_route']),
            'model':{'id':'dsm-solar-raytrace','version':'0.1','radiusMeters':radius,'routeSpacingMeters':spacing,
                     'receiverHeightMeters':1.5,'constantWalkingSpeedAssumption':True,
                     'interpretation':'Obstruction within local search radius; no claim about obstacles beyond radius'},
            'source':grid.meta,'limitations':grid.meta.get('limitations',[])+['not_temperature_or_UV_prediction','opaque_DSM_not_leaf_transmittance'],
            'samples':samples}


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--routes',type=Path,default=ROOT/'diagnostic-transects.json')
    p.add_argument('--departure',default='2026-06-21T10:00:00-05:00')
    p.add_argument('--output',type=Path,default=ROOT/'results/shade.json')
    args=p.parse_args()
    routes=json.loads(args.routes.read_text())
    grid=load_grid()
    out={'routes':[route_prediction(r,args.departure,grid) for r in routes],
         'note':'Default paths are diagnostic transects, not navigation routes or route recommendations.'}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(out,indent=2,allow_nan=False)+'\n')
    print(json.dumps([{k:r[k] for k in ['routeId','coverageFraction','sunlitFractionBounds','rankingEligible']} for r in out['routes']],indent=2))


if __name__=='__main__': main()
