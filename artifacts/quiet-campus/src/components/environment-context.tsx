import { useState } from 'react';
import { Cloud, Info, Moon, Sun } from 'lucide-react';
import { sunClockLabel, type SunContext } from '@/lib/sun-context';
import { DetailsSheet } from '@/components/details-sheet';
import './environment-context.css';

export function EnvironmentContext({ context, simulated, active = true }: {
  context: SunContext; simulated: boolean; active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const night = context.phase === 'nighttime';
  const Icon = context.phase === 'unavailable' ? Info : night ? Moon : Sun;
  return <>
    <button className="environment-context" type="button" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)} data-testid="environment-context" data-phase={context.phase}>
      <Icon size={16} aria-hidden="true"/>
      <span>{Number.isFinite(context.departureTime.getTime())?`${sunClockLabel(context.departureTime)} · `:''}Weather unavailable · {context.phase === 'unavailable' ? 'Sun context unavailable'
        : night ? 'Night · sun excluded' : 'Daylight considered'}</span>
      <Info size={15} aria-hidden="true"/>
    </button>
    <DetailsSheet title="Weather & daylight" open={open} ownerActive={active} onClose={() => setOpen(false)}>
      <div className="environment-detail">
        <span className="environment-detail-icon"><Cloud size={20}/></span>
        <div><strong>Weather</strong><p>Live weather is not connected. No temperature or current conditions are available.</p></div>
      </div>
      <div className="environment-detail">
        <span className="environment-detail-icon"><Icon size={20}/></span>
        <div><strong>{night ? 'Nighttime departure' : context.phase === 'unavailable' ? 'Sun data unavailable' : 'Daylight estimate'}</strong>
          <p>{night
            ? 'Direct sunlight is estimated as 0 for route scoring at departure. This does not describe lighting, visibility, temperature, or safety.'
            : context.phase === 'unavailable'
              ? 'Solar context could not be calculated. Existing route estimates are retained.'
              : 'The current daylight window informs estimated direct sun exposure. It is not a measured shade or weather report.'}</p>
        </div>
      </div>
      {context.sunrise && context.sunset && <p className="environment-timing">UIUC · Sunrise {sunClockLabel(context.sunrise)} · Sunset {sunClockLabel(context.sunset)}</p>}
      <p className="environment-limit">Sunrise, sunset, and departure time are estimates. Conditions can change during a walk; no route is guaranteed to be shaded.</p>
      {simulated && <p className="environment-simulation">Preview simulation · {sunClockLabel(context.departureTime)} · {context.localDate}</p>}
    </DetailsSheet>
  </>;
}
