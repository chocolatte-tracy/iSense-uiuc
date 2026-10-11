import { useMemo, useState } from 'react';
import { ArrowRight, Check, Clock3, Info, MapPin, Navigation, Sparkles } from 'lucide-react';
import { DetailsSheet } from '@/components/details-sheet';
import { ResearchPredictionTools } from '@/components/research-prediction-tools';
import { AutomaticSunlightDetails } from '@/components/automatic-sunlight-details';
import { ObservationEvidence } from '@/components/observation-evidence';
import { RouteTradeoffs } from '@/components/route-tradeoffs';
import { RouteSunTransitionNotice } from '@/components/route-sun-transition-notice';
import { SensoryLevelGuide } from '@/components/sensory-level-guide';
import { formatRouteDistance, formatRouteTime } from '@/lib/live-routes';
import { buildGoogleMapsURL } from '@/lib/google-maps-url';
import { effectivePreferenceWeights, outsideSensoryRoutes, type DemoRoute, type PreferenceWeights, type ScoredRoute } from '@/lib/route-scoring';
import { rankingMetricEvidence, routeIsProvisional } from '@/lib/ranking-evidence';
import { auditRouteRanking } from '@/lib/route-ranking-audit';
import { modelAwareSunContext } from '@/lib/solar-ranking';
import type { SunContext } from '@/lib/sun-context';
import { WALKING_WARNING } from '@workspace/campus-routing/routing';

const metricLabels = {
  noise: 'Noise',
  crowds: 'Crowds',
  sunlight: 'Sunlight',
  walkingTime: 'Walking time',
} as const;

export function RoutesScreen({active,hasSearched,routes,ranked,preferences,sunContext,originName,destinationName,validation,onSelect,selectedId,onGoMap,onChangePreferences,sunlightMessage,sunlightPending}:{
  active:boolean; hasSearched:boolean; routes:DemoRoute[]; ranked:ScoredRoute[]; preferences:PreferenceWeights;
  originName:string; destinationName:string; validation:string|null; onSelect:(id:string)=>void; selectedId:string|null;
  onGoMap:()=>void; onChangePreferences:()=>void; sunContext?:SunContext;
  sunlightMessage?:string; sunlightPending?:boolean;
}) {
  const [detailId,setDetailId]=useState<string|null>(null);
  const recommended=ranked[0];
  const fastest=routes.length?Math.min(...routes.map(route=>route.walkingTimeMinutes)):0;
  const selected=ranked.find(route=>route.id===selectedId)??routes.find(route=>route.id===selectedId
    &&route.walkingTimeMinutes-fastest<=preferences.maxExtraWalkingMinutes)??recommended;
  const detailRoute=routes.find(route=>route.id===detailId)??null;
  const detailScore=ranked.find(route=>route.id===detailId);
  const excluded=outsideSensoryRoutes(routes,ranked,preferences.maxExtraWalkingMinutes);
  const outsideTime=routes.filter(route=>route.walkingTimeMinutes-fastest>preferences.maxExtraWalkingMinutes);
  const auditRows=useMemo(()=>auditRouteRanking(routes,preferences,sunContext),[routes,preferences,sunContext]);
  const detailAudit=auditRows.find(row=>row.id===detailId);
  const strongest=useMemo(()=>{
    const effective=effectivePreferenceWeights(preferences,modelAwareSunContext(routes,sunContext));
    return [{label:'noise',value:effective.avoidNoise},{label:'crowds',value:effective.avoidCrowds},
      {label:'shade',value:effective.preferShade},{label:'a shorter walk',value:effective.prioritizeShortWalkingTime}]
      .reduce((best,current)=>current.value>best.value?current:best);
  },[preferences,sunContext,routes]);
  const provisional=Boolean(recommended&&(routeIsProvisional(recommended)||recommended.acceptanceStatus==='unknown'));
  const summary=recommended?(provisional
    ?'Provisional match · some route conditions are estimated, demo, or unknown; this is not proof of quiet or comfort.'
    :recommended.acceptanceStatus==='met'
      ?strongest.value===0?'Shortest eligible estimate first; comfort is not guaranteed.':`Best weighted match with your ${strongest.label} priority.`
      :'No candidate meets every prototype comfort limit. Closest eligible weighted match shown.'):'';
  const handoff=(route:DemoRoute)=>{onSelect(route.id);window.open(buildGoogleMapsURL(route),'_blank','noopener,noreferrer');};

  return <>
    <section className="app-screen routes-screen native-routes" aria-label="Route suggestions" aria-hidden={!active} hidden={!active} inert={!active}>
      <header className="native-screen-heading">
        <div><div className="eyebrow">COMPARE YOUR OPTIONS</div><h1>Routes</h1></div>
        <button type="button" className="native-text-button" onClick={onChangePreferences}>Preferences</button>
      </header>
      {hasSearched&&routes.length>0&&<p className="native-route-trip">{originName} <span aria-hidden="true">→</span> {destinationName}</p>}
      {hasSearched&&routes.length>0&&<p className="native-route-disclaimer" data-testid="routes-data-status">
        Estimates may be incomplete, historical or DEMO DATA. Open a route for provenance and coverage.
      </p>}
      {hasSearched&&routes.some(route=>route.source==='google')&&<p className="native-route-disclaimer"
        role="status" aria-busy={sunlightPending} data-testid="automatic-sunlight-status">
        {sunlightMessage} Historical terrain · experimental, not live conditions.
        {sunContext?.phase==='nighttime'&&' Overnight direct sun is normally zero; night is not tree shade.'}
      </p>}
      {!hasSearched||!routes.length?<div className="native-route-empty" data-testid="status-no-routes">
        <span className="native-empty-symbol"><MapPin size={20}/></span>
        <h2>{hasSearched&&validation?validation:'Your route options will appear here.'}</h2>
        <p>{hasSearched?'The research demo covers Main Quad to Grainger Engineering Library. Other pairs need an approved routing service.':'Choose two places on Map, then search when you are ready.'}</p>
        <button type="button" className="primary-screen-action" onClick={onGoMap}>Plan a walk</button>
      </div>:!ranked.length?<div className="native-route-empty" data-testid="status-no-eligible-routes">
        <span className="native-empty-symbol"><Clock3 size={20}/></span><h2>No routes fit this time limit.</h2>
        <p>Routes above the maximum extra walking time stay excluded.</p>
        <button type="button" className="primary-screen-action" onClick={onChangePreferences}>Adjust time limit</button>
      </div>:<>
        {recommended?.acceptanceStatus==='exceeded'&&<p className="native-acceptance-warning" role="status" data-testid="status-acceptance-fallback">
          Known estimates exceed one or more comfort limits. Review the evidence before deciding.
        </p>}
        {recommended?.acceptanceStatus==='unknown'&&<p className="native-acceptance-warning" role="status" data-testid="status-acceptance-unknown">
          Comfort fit is unknown for some conditions. Unknown is not quiet or comfortable.
        </p>}
        <div className="native-recommended" data-testid="card-recommended-route">
          <div className="native-recommend-label"><Sparkles size={14}/> {provisional?'PROVISIONAL MATCH':'MATCH FOR YOUR SETTINGS'}</div>
          {recommended&&<div className="native-recommended-row">
            <div className="native-route-main"><h2>{recommended.name}</h2>
              <p>{formatRouteTime(recommended)} <span>·</span> {formatRouteDistance(recommended)}</p>
              <small className="native-route-cost">Personalized rank score · {recommended.score.toFixed(1)} / 100</small></div>
            <span className="native-route-code">{recommended.routeCode}</span>
          </div>}
          <p className="native-route-summary">{summary}</p>
          {recommended&&<p className="native-route-delta" data-testid="text-extra-walking">
            {Math.max(0,recommended.walkingTimeMinutes-fastest)<.01?'+0 min · fastest or tied for fastest':`+${Math.ceil(recommended.walkingTimeMinutes-fastest)} min vs fastest available`}
          </p>}
          {recommended&&<RouteSunTransitionNotice route={recommended} sunContext={sunContext} compact/>}
          {selected&&selected.id!==recommended?.id&&<p className="native-route-summary">
            Map selection: {selected.name}
          </p>}
          {selected&&selected.id!==recommended?.id&&<RouteSunTransitionNotice route={selected} sunContext={sunContext} compact/>}
          <div className="native-recommended-actions">
            {recommended&&<button type="button" className="native-select-button" aria-pressed={selected?.id===recommended.id}
              onClick={()=>{onSelect(recommended.id);setDetailId(recommended.id);}} data-testid="button-select-recommended">
              {selected?.id===recommended.id?<Check size={16}/>:<MapPin size={16}/>}
              {selected?.id===recommended.id?'Selected on map':'Select route'}</button>}
            {recommended&&<button type="button" className="native-details-button" onClick={()=>setDetailId(recommended.id)}>
              <Info size={15}/> Details</button>}
            {selected&&<button type="button" className="navigate-button" onClick={()=>handoff(selected)}
              aria-label={`Navigate ${selected.name} with Google Maps`}
              data-testid={`navigate-${selected.id}`}><Navigation size={15}/> Navigate {selected.routeCode}</button>}
          </div>
        </div>
        <div className="native-alternative-heading"><h2>Other eligible routes</h2><span>{ranked.length} options</span></div>
        <div className="native-route-list" aria-label="Eligible route alternatives">
          {ranked.filter(route=>route.id!==recommended?.id).map(route=><article className={`native-route-card${selected?.id===route.id?' is-selected':''}`}
            key={route.id} data-testid={`card-route-${route.id}`}>
            <button type="button" className="native-route-details-button" data-testid={`button-route-${route.id}`}
              aria-pressed={selected?.id===route.id} onClick={()=>{onSelect(route.id);setDetailId(route.id);}}>
              <span className="native-route-code">{route.routeCode}</span>
              <span className="native-route-main"><strong>{route.name}</strong><small>{formatRouteTime(route)} · {formatRouteDistance(route)}</small></span>
              <span className="native-route-cost">Rank {route.score.toFixed(1)}</span>
              <Info size={17}/>
            </button>
            <button type="button" className="native-route-select-quiet" onClick={()=>{onSelect(route.id);setDetailId(route.id);}} aria-label={`Select ${route.name} on map`}>
              {selected?.id===route.id?'Selected':'Select'}
            </button>
          </article>)}
        </div>
        {(excluded.length>0||outsideTime.length>0)&&<div className="native-excluded"
          data-testid={outsideTime.length>0?'routes-outside-time-limit':'routes-outside-comfort-limit'}>
          <p>{excluded.length>0?`${excluded.length} candidate${excluded.length===1?'':'s'} outside your comfort limits`:''}
            {excluded.length>0&&outsideTime.length>0?' · ':''}{outsideTime.length>0?`${outsideTime.length} over your extra-time limit`:''}</p>
          {[...new Set([...excluded,...outsideTime].map(route=>route.id))].map(id=>{
            const route=routes.find(item=>item.id===id);
            return route?<button key={id} type="button" onClick={()=>setDetailId(id)}>{route.name} · see why <ArrowRight size={13}/></button>:null;
          })}
        </div>}
        <p className="native-route-disclaimer">Ranking is not an accessibility check or a live conditions report. Google may recalculate during navigation.</p>
      </>}
    </section>
    <DetailsSheet title={detailRoute?.name??'Route details'} open={Boolean(detailRoute)} ownerActive={active} onClose={()=>setDetailId(null)}>
      {detailRoute&&<div className="native-route-detail-body">
        <p className="native-detail-route-meta">{formatRouteTime(detailRoute)} · {formatRouteDistance(detailRoute)}
          {detailRoute.walkingTimeMinutes-fastest>preferences.maxExtraWalkingMinutes
            ?` · Outside time limit (+${(detailRoute.walkingTimeMinutes-fastest).toFixed(1)} min)`
            :excluded.some(route=>route.id===detailRoute.id)?' · Outside prototype comfort cutoffs':''}</p>
        <p className="native-detail-summary">
          Comfort fit: {detailScore?.acceptanceStatus==='met'?'meets available cutoffs':detailScore?.acceptanceStatus==='exceeded'
            ?'known estimates exceed a cutoff':'unknown for some conditions'}{routeIsProvisional(detailRoute)?' · provisional evidence':''}.
        </p>
        <section className="native-evidence-summary" aria-label="Route score, evidence and coverage">
          <h3>Why this route ranks here</h3>
          <p>{detailAudit?.reason??'Audit unavailable for this route.'}</p>
          <p>Personalized rank score: {detailScore?.score.toFixed(1)??'Not ranked'} / 100. This is a ranking result, not a sensory measurement.</p>
          <dl className="native-score-breakdown">
            {detailScore?.scoreBreakdown.map(item=>{
              const evidence=item.metric==='walkingTime'?null:rankingMetricEvidence(detailRoute,item.metric);
              const displayed=evidence?.status==='excluded'?'Excluded at nighttime'
                :evidence?.displayValue===null?'Unknown'
                  :evidence?.status==='modeled'?`${evidence.displayValue.toFixed(1)}% potential direct sun · historical model`
                  :evidence?`${evidence.displayValue.toFixed(0)} / 100 · ${evidence.status}`
                    :`${item.rankingValue.toFixed(0)} / 100 estimated time cost`;
              return <div key={item.metric}>
                <dt>{metricLabels[item.metric]}</dt>
                <dd><strong>{displayed}</strong>
                  <small>{item.effectivePercent.toFixed(0)}% effective importance · {item.contribution.toFixed(1)} score contribution</small>
                  {evidence&&<small>Coverage: {evidence.verifiedPercent.toFixed(0)}% verified · {evidence.estimatedPercent.toFixed(0)}% estimated · {evidence.unknownPercent.toFixed(0)}% unknown.</small>}
                  {evidence&&evidence.unknownPercent>0&&<small>Conservative ranking input {evidence.rankingValue.toFixed(0)}/100; not a sensory measurement.</small>}
                  {evidence&&<small>{evidence.explanation}</small>}
                </dd>
              </div>;
            })}
          </dl>
          <p>Walking-time and distance source: {detailRoute.source==='google'?'Google walking-route estimate':'research candidate estimate'} · {formatRouteTime(detailRoute)} · {formatRouteDistance(detailRoute)}.</p>
          <p>Weather is unavailable and does not adjust ranking. Sun context uses estimated time of day only; no cloud, shade, current noise, or current crowd conditions are measured.</p>
          <p>Comfort status: {detailScore?.acceptanceStatus==='met'?'met by available values':detailScore?.acceptanceStatus==='exceeded'?'known values exceed a limit':'unknown because evidence is incomplete'}.</p>
        </section>
        {detailRoute.walkingTimeMinutes-fastest>preferences.maxExtraWalkingMinutes&&<p className="native-acceptance-warning">
          Not eligible: this route exceeds the maximum extra-walking limit. It remains excluded from ranking and selection.
        </p>}
        <SensoryLevelGuide/>
        <RouteTradeoffs route={detailRoute} alternatives={routes} preferences={preferences} sunContext={sunContext}/>
        <AutomaticSunlightDetails route={detailRoute}/>
        <ObservationEvidence route={detailRoute}/>
        <ResearchPredictionTools route={detailRoute} sunContext={sunContext}/>
        <RouteSunTransitionNotice route={detailRoute} sunContext={sunContext}/>
        <details className="route-research-details" open={false}>
          <summary>Candidate waypoints ({detailRoute.candidateWaypoints.length}) · not every turn</summary>
          <ol>{detailRoute.candidateWaypoints.map((point,index)=><li key={`${point.latitude}-${point.longitude}`}>
            {index+1}. {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</li>)}</ol>
          <p>{detailRoute.source==='google'?'Sampled from Google walking geometry; not accessibility-checked.':
            'Research points need validation and do not describe every turn.'}</p>
          {detailRoute.researchSourceUrl&&<a href={detailRoute.researchSourceUrl} target="_blank" rel="noreferrer">Open original route research</a>}
        </details>
        <p className="navigation-disclaimer">Environmental scores are not verified measurements or live conditions. A provisional match is not proven quiet or comfortable.</p>
        <p className="navigation-disclaimer">Google Maps may recalculate the walk or ignore some waypoints.
          Navigation does not guarantee the same path, comfort, or accessibility.</p>
        {detailRoute.source==='google'&&<p className="navigation-disclaimer">{WALKING_WARNING}</p>}
        {detailRoute.walkingTimeMinutes-fastest<=preferences.maxExtraWalkingMinutes&&
          <button type="button" className="navigate-button native-detail-navigate" onClick={()=>handoff(detailRoute)}
            data-testid={`navigate-detail-${detailRoute.id}`}><Navigation size={15}/> Navigate with Google Maps</button>}
      </div>}
    </DetailsSheet>
  </>;
}
