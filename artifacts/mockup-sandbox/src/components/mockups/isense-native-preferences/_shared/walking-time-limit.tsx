import { useEffect, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { parseWalkingMinutes } from './walking-time-input';

export function WalkingTimeLimit({ value, onChange }: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const invalid = parseWalkingMinutes(draft) === null;

  return (
    <div className="slider-item walking-time-limit">
      <div className="slider-title-wrap">
        <span className="slider-icon"><ArrowDownUp size={16} /></span>
        <div>
          <label htmlFor="input-maxExtraWalkingMinutes" className="slider-title">Maximum Extra Walking Time</label>
          <p id="walking-time-description">Additional minutes allowed compared with the fastest route. Enter 0 to allow only the fastest options.</p>
        </div>
      </div>
      <div className="walking-minutes-field">
        <input id="input-maxExtraWalkingMinutes" data-testid="input-maxExtraWalkingMinutes"
          type="number" inputMode="numeric" min="0" step="1" required
          value={draft} aria-invalid={invalid}
          aria-describedby={`walking-time-description${invalid ? ' walking-time-error' : ''}`}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const minutes = parseWalkingMinutes(next);
            if (minutes !== null) onChange(minutes);
          }} />
        <span>min</span>
      </div>
      {invalid && <p id="walking-time-error" className="walking-time-error" role="status">
        Enter a whole number of minutes, 0 or greater. The last valid limit ({value} min) still applies.
      </p>}
    </div>
  );
}
