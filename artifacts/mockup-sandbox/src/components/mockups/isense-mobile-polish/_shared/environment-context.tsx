import { Moon, Sun, Info } from 'lucide-react';
import { sunClockLabel, type SunContext } from './sun-context';
import './environment-context.css';

export function EnvironmentContext({ context, simulated }: { context: SunContext; simulated: boolean }) {
  const night = context.phase === 'nighttime';
  const Icon = context.phase === 'unavailable' ? Info : night ? Moon : Sun;
  return <div className="environment-context" role="status" data-testid="environment-context" data-phase={context.phase}>
    <Icon size={17} aria-hidden="true"/>
    <div>
      <strong>{context.phase === 'unavailable' ? 'Sun context unavailable · Existing estimates retained'
        : night ? 'Nighttime · Direct sunlight excluded' : 'Daytime · Sun exposure considered'}</strong>
      {context.sunrise && context.sunset && <span>
        UIUC · Sunrise {sunClockLabel(context.sunrise)} · Sunset {sunClockLabel(context.sunset)}
      </span>}
      {night && <span>Estimated direct sun: 0 · Sun settings saved. Lighting and safety are not assessed.</span>}
      {simulated && <span className="environment-simulation">Preview simulation · {sunClockLabel(context.departureTime)} · {context.localDate}</span>}
    </div>
  </div>;
}
