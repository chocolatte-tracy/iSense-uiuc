import type { DemoRoute } from '@/lib/route-scoring';
import { estimateTripSunEvents, sunTripTimeLabel, type SunContext } from '@/lib/sun-context';
import './route-sun-transition-notice.css';

export function RouteSunTransitionNotice({ route, sunContext, compact = false }: {
  route: DemoRoute; sunContext?: SunContext; compact?: boolean;
}) {
  const estimate = estimateTripSunEvents(route, sunContext);
  const unavailable = {
    departure: 'A valid departure time is needed.',
    duration: 'The walking-time estimate is missing or unsupported.',
    solar: 'Local solar-event estimates are unavailable.',
  };
  if (compact && estimate.status !== 'unavailable' && !estimate.events.length) return null;
  return <aside className={`trip-sun-notice${compact ? ' is-compact' : ''}`} aria-label="Estimated daylight changes during this walk"
    data-testid={`trip-sun-${route.id}`} data-status={estimate.status}>
    <strong>Daylight during this walk · estimate</strong>
    {estimate.status === 'unavailable'
      ? <p>Sunrise/sunset crossing estimate unavailable. {unavailable[estimate.reason]} This does not mean no change will occur.</p>
      : <>
        {!compact && <p>Estimated walk: <time dateTime={estimate.departureTime.toISOString()}>{sunTripTimeLabel(estimate.departureTime)}</time>
          {' → '}<time dateTime={estimate.arrivalTime.toISOString()}>{sunTripTimeLabel(estimate.arrivalTime)}</time> (UIUC local time).</p>}
        {estimate.events.length ? <ul>{estimate.events.map(event => <li key={`${event.kind}-${event.time.toISOString()}`}>
          <strong>{event.kind === 'sunrise' ? 'Sunrise' : 'Sunset'} may occur during your walk</strong>
          {' · '}estimated <time dateTime={event.time.toISOString()}>{sunTripTimeLabel(event.time)}</time>.
        </li>)}</ul> : <p>No sunrise or sunset is estimated within this walk.</p>}
      </>}
    <p className="trip-sun-limits">{!compact && 'SunCalc astronomical and walking-time estimates only. '}Scoring still uses departure-time conditions.
      No segment-by-segment shade, weather, lighting or safety observations are inferred.</p>
  </aside>;
}
