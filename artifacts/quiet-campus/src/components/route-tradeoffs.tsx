import type { DemoRoute, PreferenceWeights } from '@/lib/route-scoring';
import { comfortFactors } from '@/lib/sensory-comfort';
import { routeTradeoffs } from '@/lib/route-tradeoffs';
import { sensorySummary } from '@/lib/campus-observations';
import type { SunContext } from '@/lib/sun-context';
import { RouteSunTransitionNotice } from '@/components/route-sun-transition-notice';

export function RouteTradeoffs({ route, alternatives, preferences, sunContext }: {
  route: DemoRoute; alternatives: DemoRoute[]; preferences: PreferenceWeights; sunContext?: SunContext;
}) {
  const { pros, cons } = routeTradeoffs(route, alternatives, preferences);
  return (
    <div className="route-tradeoffs" data-testid={`tradeoffs-${route.id}`}>
      <RouteSunTransitionNotice route={route} sunContext={sunContext}/>
      <p className="tradeoffs-notice">{sensorySummary(route)}. Lower prototype indices mean less modeled exposure, not measured physical conditions.</p>
      <p className="route-physical-status"><strong>Physical conditions: Unknown.</strong> No usable raw dB(A) or simultaneous occupancy/area observation is supplied for this path. Prototype indices are not dB(A) or people/m²; historical source examples do not establish this route’s conditions.</p>
      <dl className="route-indices">
        {comfortFactors.map(factor => (
          <div key={factor.key}>
            <dt>{factor.costKey==='sunExposureCost'&&route.directSunlightExcluded?'Direct sunlight · nighttime estimate':`${factor.title} · prototype index`}</dt>
            <dd>{Number.isFinite(route[factor.costKey]) ? `${Math.round(route[factor.costKey])}/100` : 'Unknown'}</dd>
          </div>
        ))}
      </dl>
      {route.directSunlightExcluded&&<p className="tradeoffs-notice">At nighttime departure, direct sunlight is estimated at 0 and excluded from scoring for every route. Daylight may change during the walk. This is not measured shade, lighting, temperature or safety information. Your saved Sun settings are unchanged.</p>}
      <div className="tradeoffs-columns">
        <section aria-label={`Pros of ${route.name}`}>
          <h4>Pros</h4>
          <ul>{pros.map(text => <li key={text}>{text}</li>)}</ul>
        </section>
        <section aria-label={`Cons of ${route.name}`}>
          <h4>Cons</h4>
          {cons.length ? <ul>{cons.map(text => <li key={text}>{text}</li>)}</ul>
            : <p>No higher index or longer walk in these comparisons.</p>}
        </section>
      </div>
      <p className="tradeoffs-notice">Compared with this trip’s supplied options, not a safety or accessibility assessment.</p>
    </div>
  );
}
