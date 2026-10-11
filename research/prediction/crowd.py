"""Leakage-controlled hourly passage-count benchmark; no campus inference claim."""
import argparse
import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

from acquire import COHORT, START, END

ROOT = Path(__file__).resolve().parent
HELD_OUT = [10,12]
TRAIN_END, VALID_END = '2025-03-01', '2025-03-17'
FEATURE_NAMES = ['hour','weekday','month','latitude','longitude']


def load_rows(path=None):
    path = Path(path or ROOT/'data/melbourne-counts.json')
    source = json.loads(Path(str(path)+'.source.json').read_text())
    if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
        raise ValueError('Crowd source hash mismatch')
    return normalize(json.loads(path.read_text()))


def normalize(raw):
    rows, seen, rejected, duplicate = [], {}, Counter(), 0
    for r in raw:
        try:
            sid, day, hour, y = r['location_id'], r['sensing_date'], r['hourday'], r['pedestriancount']
            if not isinstance(sid,int) or sid not in COHORT or not START <= day < END:
                raise ValueError('outside_fixed_cohort_or_period')
            date = datetime.strptime(day,'%Y-%m-%d')
            if type(hour) is not int or not 0 <= hour < 24 or type(y) is not int or y < 0:
                raise ValueError('invalid_hour_or_target')
            lat, lon = r['location']['lat'], r['location']['lon']
            if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in [lat,lon]):
                raise ValueError('missing_coordinates')
            if not -38 < lat < -37 or not 144 < lon < 146:
                raise ValueError('outside_melbourne')
            directions = [r.get('direction_1'),r.get('direction_2')]
            if all(type(v) is int and v >= 0 for v in directions) and sum(directions) != y:
                raise ValueError('direction_total_mismatch')
            row = {'station':sid,'date':day,'hour':hour,'weekday':date.weekday(),'month':date.month,
                   'lat':lat,'lon':lon,'count':y,'sourceId':r['id']}
            key = (sid,day,hour)
            if key in seen:
                if any(seen[key][k] != row[k] for k in ['count','lat','lon']):
                    raise RuntimeError('Conflicting station/date/hour records')
                duplicate += 1
                continue
            seen[key] = row
            rows.append(row)
        except (KeyError,TypeError,ValueError) as e:
            rejected[str(e)] += 1
    rows.sort(key=lambda r:(r['date'],r['hour'],r['station']))
    # This explicit window precedes Melbourne's April 2025 DST transition.
    # Generic UIUC ingestion below uses offset-aware instants instead.
    expected = (datetime.fromisoformat(END)-datetime.fromisoformat(START)).days*24
    by_station = Counter(r['station'] for r in rows)
    quality = {'sourceRows':len(raw),'acceptedRows':len(rows),'rejected':dict(rejected),
               'duplicateRows':duplicate,'zeroCountsRetained':sum(r['count']==0 for r in rows),
               'timezone':'Australia/Melbourne','target':'pedestrian_passages_per_hour',
               'missingHoursByStation':{str(s):expected-by_station[s] for s in COHORT},
               'missingTargetsImputed':False,'currentSensorMetadataNotHistoricalQC':True}
    if not rows:
        raise ValueError('No usable training rows')
    # Relocation within the sampled period must not silently pool places.
    for sid in COHORT:
        locations = {(round(r['lat'],5),round(r['lon'],5)) for r in rows if r['station']==sid}
        if len(locations)>1:
            raise ValueError('Station moved within benchmark: '+str(sid))
    return rows,quality


def split(rows):
    return {'train':[r for r in rows if r['station'] not in HELD_OUT and r['date']<TRAIN_END],
            'validation':[r for r in rows if r['station'] not in HELD_OUT and TRAIN_END<=r['date']<VALID_END],
            'future_test':[r for r in rows if r['station'] not in HELD_OUT and r['date']>=VALID_END],
            'unseen_station_test':[r for r in rows if r['station'] in HELD_OUT and r['date']>=VALID_END]}


def features(rows):
    return np.array([[r['hour'],r['weekday'],r['month'],r['lat'],r['lon']] for r in rows],dtype=float)


def baseline_fit(rows):
    station, global_ = defaultdict(list),defaultdict(list)
    for r in rows:
        station[f"{r['station']}:{r['weekday']}:{r['hour']}"].append(r['count'])
        global_[f"{r['weekday']}:{r['hour']}"].append(r['count'])
    return {'stationWeekHour':{k:float(np.mean(v)) for k,v in station.items()},
            'weekHour':{k:float(np.mean(v)) for k,v in global_.items()},
            'mean':float(np.mean([r['count'] for r in rows]))}


def baseline_predict(model,rows):
    return np.array([model['stationWeekHour'].get(f"{r['station']}:{r['weekday']}:{r['hour']}",
                    model['weekHour'].get(f"{r['weekday']}:{r['hour']}",model['mean'])) for r in rows])


def metrics(rows,pred):
    y=np.array([r['count'] for r in rows])
    if len(y)==0 or len(pred)!=len(y) or not np.isfinite(pred).all():
        raise ValueError('Empty/invalid evaluation')
    return {'rows':len(y),'mae':float(np.mean(np.abs(y-pred))),
            'rmse':float(np.sqrt(np.mean((y-pred)**2))),
            'wape':float(np.sum(np.abs(y-pred))/y.sum()) if y.sum()>0 else None,
            'meanObserved':float(y.mean())}


def export_boosting(model):
    """JSON, not pickle. Pinned sklearn Poisson loss uses exp(raw prediction)."""
    trees=[]
    for stage in model._predictors:
        if len(stage)!=1:
            raise ValueError('Only scalar regression export supported')
        nodes=stage[0].nodes
        if any(nodes['is_categorical']):
            raise ValueError('Categorical export unsupported')
        trees.append([{k:(float(n[k]) if k in ['value','num_threshold'] else int(n[k]))
                       for k in ['value','feature_idx','num_threshold','left','right','is_leaf','missing_go_to_left']}
                      for n in nodes])
    return {'baseline':float(model._baseline_prediction[0,0]),'trees':trees,'link':'exp'}


def exported_predict(model,x):
    out=[]
    for row in x:
        value=model['baseline']
        for tree in model['trees']:
            i=0
            while not tree[i]['is_leaf']:
                n=tree[i]; v=row[n['feature_idx']]
                go_left=bool(n['missing_go_to_left']) if not math.isfinite(v) else v<=n['num_threshold']
                i=n['left'] if go_left else n['right']
            value+=tree[i]['value']
        out.append(math.exp(value))
    return np.array(out)


def train():
    rows,quality=load_rows(); parts=split(rows)
    fit, val=parts['train'],parts['validation']
    if any(not r for r in parts.values()):
        raise ValueError('All four evaluation partitions required')
    base=baseline_fit(fit)
    y=np.array([r['count'] for r in fit])
    candidates={}
    validations={'weekday_hour_baseline':metrics(val,baseline_predict(base,val))}
    # Fixed, small search. Test sets never participate in selection or fitting.
    for leaves in [8,15]:
        name=f'poisson_boosting_{leaves}_leaves'
        m=HistGradientBoostingRegressor(loss='poisson',max_iter=120,max_leaf_nodes=leaves,
              learning_rate=.07,min_samples_leaf=30,l2_regularization=1,early_stopping=False,random_state=42)
        m.fit(features(fit),y)
        candidates[name]=m
        validations[name]=metrics(val,m.predict(features(val)))
    selected=min(validations,key=lambda k:validations[k]['mae'])
    best_tree=min(candidates,key=lambda k:validations[k]['mae'])
    exported=export_boosting(candidates[best_tree])
    # Verify exported inference on all four partitions before saving any model.
    all_x=features(rows)
    parity=float(np.max(np.abs(exported_predict(exported,all_x)-candidates[best_tree].predict(all_x))))
    if parity>1e-7:
        raise AssertionError('Exported prediction mismatch')
    chosen=lambda r: baseline_predict(base,r) if selected=='weekday_hour_baseline' else candidates[selected].predict(features(r))
    validation_errors=np.abs(np.array([r['count'] for r in val])-chosen(val))
    # Descriptive residual band only: time series violates iid calibration.
    residual_q=float(np.quantile(validation_errors,.9,method='higher'))
    tests={}
    predictions=[]
    for name in ['future_test','unseen_station_test']:
        rr=parts[name]; pred=chosen(rr)
        tests[name]={'selected':metrics(rr,pred),'baseline':metrics(rr,baseline_predict(base,rr)),
                    'bestBoosting':metrics(rr,candidates[best_tree].predict(features(rr))),
                    'validationResidualBandEmpiricalCoverage':float(np.mean(np.abs(np.array([r['count'] for r in rr])-pred)<=residual_q)),
                    'perStation':{str(s):metrics([r for r in rr if r['station']==s],chosen([r for r in rr if r['station']==s])) for s in sorted(set(r['station'] for r in rr))}}
        for r,yp in zip(rr,pred):
            predictions.append({**r,'split':name,'prediction':float(yp),
                                'descriptiveLower':max(0,float(yp)-residual_q),'descriptiveUpper':float(yp)+residual_q})
    result={'schemaVersion':'2.2','dataset':'Melbourne hourly pedestrian counts','quality':quality,
            'split':{k:{'rows':len(rr),'stations':sorted(set(r['station'] for r in rr)),
                        'firstDate':min(r['date'] for r in rr),'lastDate':max(r['date'] for r in rr)} for k,rr in parts.items()},
            'validation':validations,'selectedModel':selected,'bestBoostingModel':best_tree,
            'test':tests,'exportMaxAbsoluteError':parity,'validationResidual90Percentile':residual_q,
            'rankingEligible':False,'deploymentRegion':'Melbourne benchmark only',
            'limitations':['not_UIUC_calibrated','no_weather_or_holiday_covariates','no_live_count_feed',
                           'no_density_or_occupancy_target','winter_to_autumn_single_quarter',
                           'current_sensor_metadata_not_historical_maintenance_log',
                           'residual_band_is_not_guaranteed_prediction_interval','license_metadata_unresolved'],
            'featureNames':FEATURE_NAMES,'unit':'pedestrian_passages_per_hour'}
    artifact={'schemaVersion':'2.2','selectedModel':selected,'baseline':base,'boosting':exported,
              'featureNames':FEATURE_NAMES,'timezone':'Australia/Melbourne','rankingEligible':False,
              'knownStations':{str(s):{'lat':next(r['lat'] for r in fit if r['station']==s),
                                       'lon':next(r['lon'] for r in fit if r['station']==s)} for s in sorted(set(r['station'] for r in fit))},
              'trainedBefore':TRAIN_END,'evaluatedThrough':'2025-03-31',
              'validationResidual90Percentile':residual_q,'dataSha256':json.loads((ROOT/'data/melbourne-counts.json.source.json').read_text())['sha256']}
    out=ROOT/'results';out.mkdir(exist_ok=True)
    for filename,obj in [('crowd-evaluation.json',result),('crowd-model.json',artifact),('crowd-predictions.json',predictions)]:
        (out/filename).write_text(json.dumps(obj,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'selectedModel':selected,'quality':quality,'test':tests},indent=2))


def predict(model,station,at):
    d=datetime.fromisoformat(at.replace('Z','+00:00'))
    if d.tzinfo is None:
        raise ValueError('Timezone required')
    if str(station) not in model['knownStations']:
        return {'value':None,'status':'unsupported','reason':'station_not_in_training_domain','rankingEligible':False}
    local=d.astimezone(ZoneInfo(model['timezone']))
    loc=model['knownStations'][str(station)]
    row={'station':station,'hour':local.hour,'weekday':local.weekday(),'month':local.month,**loc}
    value=float(baseline_predict(model['baseline'],[row])[0]) if model['selectedModel']=='weekday_hour_baseline' else float(exported_predict(model['boosting'],features([row]))[0])
    return {'value':value,'unit':'pedestrian_passages_per_hour','status':'research_prediction',
            'at':local.isoformat(),'station':station,'rankingEligible':False,
            'outsideEvaluatedPeriod':local.date().isoformat()>'2025-03-31' or local.date().isoformat()<'2025-03-01',
            'warning':'Historical benchmark model; not operational or calibrated for UIUC'}


def import_uiuc(path,output):
    """Strict intake for an authorized 15-minute CSV; never expand monthly data."""
    required={'station_id','start_at','end_at','count','latitude','longitude','quality','source_url'}
    rows=[];seen={}
    with Path(path).open(newline='') as f:
        reader=csv.DictReader(f)
        if not required.issubset(reader.fieldnames or []):
            raise ValueError('Required columns: '+','.join(sorted(required)))
        for r in reader:
            start=datetime.fromisoformat(r['start_at'].replace('Z','+00:00'))
            end=datetime.fromisoformat(r['end_at'].replace('Z','+00:00'))
            if start.tzinfo is None or end.tzinfo is None or (end-start).total_seconds()!=900:
                raise ValueError('Offset-aware 15-minute intervals required')
            if not r['station_id'].strip() or not r['source_url'].startswith('https://'):
                raise ValueError('Station and source required')
            lat,lon=float(r['latitude']),float(r['longitude'])
            if not 40.05<=lat<=40.17 or not -88.3<=lon<=-88.15:
                raise ValueError('Coordinate outside UIUC')
            if r['quality'] not in ['valid','suspect','missing']:
                raise ValueError('Unknown quality')
            count=None if r['count']=='' else int(r['count'])
            if count is not None and count<0 or (r['quality']=='valid' and count is None) or (r['quality']=='missing' and count is not None):
                raise ValueError('Inconsistent count/quality')
            from datetime import timezone
            key=(r['station_id'],start.astimezone(timezone.utc).isoformat())
            record={'stationId':r['station_id'],'startAt':key[1],'endAt':end.astimezone(timezone.utc).isoformat(),
                    'value':count,'unit':'pedestrian_passages_per_15_minutes','lat':lat,'lon':lon,
                    'quality':r['quality'],'sourceUrl':r['source_url'],'rankingEligible':False}
            if key in seen and seen[key]!=record:
                raise ValueError('Conflicting duplicate interval')
            if key not in seen: rows.append(record)
            seen[key]=record
    # Overlapping intervals can double-count even when timestamps differ.
    ordered=sorted(rows,key=lambda r:(r['stationId'],r['startAt']))
    for a,b in zip(ordered,ordered[1:]):
        if a['stationId']==b['stationId'] and a['endAt']>b['startAt']:
            raise ValueError('Overlapping station intervals')
    Path(output).write_text(json.dumps({'records':ordered,'sourceSha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),
                         'status':'intake_only_not_trained','rankingEligible':False},indent=2)+'\n')
    return ordered


if __name__=='__main__':
    p=argparse.ArgumentParser(); sub=p.add_subparsers(dest='command',required=True)
    sub.add_parser('train')
    q=sub.add_parser('predict');q.add_argument('--station',type=int,required=True);q.add_argument('--at',required=True)
    q=sub.add_parser('import-uiuc');q.add_argument('csv');q.add_argument('output')
    args=p.parse_args()
    if args.command=='train': train()
    elif args.command=='predict': print(json.dumps(predict(json.loads((ROOT/'results/crowd-model.json').read_text()),args.station,args.at),indent=2))
    else: import_uiuc(args.csv,args.output)
