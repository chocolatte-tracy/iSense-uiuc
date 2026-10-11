import { useEffect, useState } from 'react';
import { parseWalkingMinutes } from '@/lib/walking-time-input';

export function WalkingTimeLimit({ value, onChange }: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const invalid = parseWalkingMinutes(draft) === null;
  const commit = () => {
    const minutes = parseWalkingMinutes(draft);
    if (minutes !== null && minutes !== value) onChange(minutes);
  };

  return (
    <div className="walking-time-limit">
      <div className="walking-minutes-field">
        <input id="input-maxExtraWalkingMinutes" data-testid="input-maxExtraWalkingMinutes"
          type="number" inputMode="numeric" min="0" step="1" required aria-label="Maximum extra walking time in minutes"
          value={draft} aria-invalid={invalid}
          aria-describedby={invalid ? 'walking-time-error walking-time-hint' : 'walking-time-hint'}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
          }} />
        <span aria-hidden="true">min</span>
      </div>
      <span id="walking-time-hint" className="sr-only">Press Enter or leave the field to apply a valid whole-number limit.</span>
      {invalid && <p id="walking-time-error" className="walking-time-error" role="status">
        Enter a whole number of minutes, 0 or greater. The last valid limit ({value} min) still applies.
      </p>}
    </div>
  );
}
