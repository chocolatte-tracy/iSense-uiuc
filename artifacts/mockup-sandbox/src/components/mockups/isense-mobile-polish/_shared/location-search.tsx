import { useEffect, useId, useRef, useState } from 'react';
import { Check, MapPin, Search } from 'lucide-react';
import { campusSuggestions, locationField, type LocationField } from './campus-locations';
import type { PlaceSuggestion, PlacesOptions } from './types';
import { usePlacesAutocomplete } from './use-places-autocomplete';
import './places-search.css';

type LocationSearchProps = {
  label: string;
  kind: 'origin' | 'destination';
  value: LocationField;
  onChange: (value: LocationField) => void;
  places?: PlacesOptions;
};

function valueIdentity(value: LocationField, kind: LocationSearchProps['kind']) {
  const place = value.place;
  return JSON.stringify([kind, value.text, place?.id, place?.coordinates, place?.source]);
}

export function LocationSearch({ label, kind, value, onChange, places }: LocationSearchProps) {
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selectionVersion = useRef(0);
  const mounted = useRef(true);
  const currentValueRef = useRef(value);
  currentValueRef.current = value;
  const identity = valueIdentity(value, kind);
  const previousIdentity = useRef(identity);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState('');

  // A selected name shows the complete quick list on focus, so another location
  // can be chosen without deleting the current name first.
  const campus = campusSuggestions(value.place ? '' : value.text);
  const searchActive = open && !value.place && !resolvingId;
  const google = usePlacesAutocomplete(places, value.text, searchActive);
  const selectableCount = campus.length + google.suggestions.length;

  useEffect(() => {
    if (previousIdentity.current !== identity) {
      previousIdentity.current = identity;
      selectionVersion.current += 1;
    }
    setActive(-1);
  }, [identity]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      selectionVersion.current += 1;
    };
  }, []);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const selectCampus = (index: number) => {
    const place = campus[index];
    if (!place) return;
    selectionVersion.current += 1;
    setResolvingId(null);
    setDetailError('');
    onChange(locationField(place));
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  };

  const selectGoogle = async (suggestion: PlaceSuggestion) => {
    const version = ++selectionVersion.current;
    const identityAtSelection = valueIdentity(currentValueRef.current, kind);
    setResolvingId(suggestion.id);
    setDetailError('');
    try {
      const place = await google.select(suggestion);
      if (!mounted.current || selectionVersion.current !== version
        || valueIdentity(currentValueRef.current, kind) !== identityAtSelection) return;
      onChange(locationField(place));
      setResolvingId(null);
      setOpen(false);
      setActive(-1);
      input.current?.focus();
    } catch (error) {
      if (!mounted.current || selectionVersion.current !== version
        || valueIdentity(currentValueRef.current, kind) !== identityAtSelection) return;
      setResolvingId(null);
      setDetailError(error instanceof Error ? error.message : 'This address could not be selected.');
    }
  };

  const chooseActive = () => {
    if (active < 0 || active >= selectableCount) return;
    if (active < campus.length) selectCampus(active);
    else {
      const suggestion = google.suggestions[active - campus.length];
      if (suggestion) void selectGoogle(suggestion);
    }
  };

  const moveActive = (direction: 1 | -1) => {
    if (!selectableCount) return;
    setActive(previous => direction === 1
      ? (previous + 1) % selectableCount
      : (previous <= 0 ? selectableCount - 1 : previous - 1));
  };

  const showMainLibrary = 'main library'.includes((value.place ? '' : value.text).trim().toLowerCase());
  const statusMessage = detailError || (resolvingId ? 'Finding exact coordinates…' : google.message);

  return <div className={`location-search location-search-${kind}`} ref={wrapper}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setOpen(false);
        setActive(-1);
      }
    }}>
    <label className="field-label" htmlFor={id}>{label}</label>
    <div className="location-input-wrap">
      {kind === 'destination' ? <Search size={18} aria-hidden="true" /> : <MapPin size={18} aria-hidden="true" />}
      <input ref={input} id={id} role="combobox" aria-label={kind === 'origin' ? 'Starting location' : 'Destination'}
        aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`}
        aria-invalid={Boolean(value.text && !value.place)}
        aria-activedescendant={open && active >= 0 && active < selectableCount ? `${id}-option-${active}` : undefined}
        aria-describedby={`${id}-help`} autoComplete="off" spellCheck={false}
        data-testid={`search-${kind}`} value={value.text} maxLength={300}
        placeholder={kind === 'destination' ? 'Search campus locations' : 'Choose a starting point'}
        onFocus={() => setOpen(true)}
        onChange={event => {
          selectionVersion.current += 1;
          setResolvingId(null);
          setDetailError('');
          onChange({ text: event.target.value, place: null });
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') { setOpen(false); setActive(-1); }
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            moveActive(event.key === 'ArrowDown' ? 1 : -1);
          } else if (event.key === 'Enter' && open && active >= 0) {
            event.preventDefault();
            chooseActive();
          }
        }} />
      {resolvingId && <span className="places-resolving" role="status">Resolving</span>}
      {value.place && <Check size={16} className="location-confirmed" aria-label="Coordinates selected" />}
      {value.text && <button type="button" className="location-clear" aria-label={`Clear ${kind === 'origin' ? 'starting location' : 'destination'}`}
        data-testid={`clear-search-${kind}`}
        onClick={() => {
          selectionVersion.current += 1;
          setResolvingId(null);
          setDetailError('');
          onChange({ text: '', place: null });
          input.current?.focus();
          setOpen(true);
        }}>×</button>}
    </div>
    {open && <div className="location-suggestions">
      <div className="location-suggestions-title">Campus quick suggestions</div>
      <div role="listbox" id={`${id}-options`} aria-label={`${label} suggestions`}>
        <ul role="group" aria-label="Campus quick suggestions">
          {campus.map((place, index) => <li key={place.id} role="option" id={`${id}-option-${index}`}
            aria-selected={active === index} className={active === index ? 'is-active' : ''}
            data-testid={`campus-suggestion-${place.id}`}
            onPointerDown={event => event.preventDefault()} onClick={() => selectCampus(index)}>
            <MapPin size={15} aria-hidden="true" /><span>{place.name}<small>UIUC · research coordinates</small></span>
          </li>)}
          {showMainLibrary && <li role="option" aria-disabled="true" className="location-unavailable">
            <MapPin size={15} aria-hidden="true" /><span>Main Library<small>Coordinates pending · not selectable</small></span>
          </li>}
        </ul>
        {places && <div className="places-results-group">
          <div className="location-suggestions-title">Google Maps results</div>
          {google.suggestions.length > 0 && <ul role="group" aria-label="Google Maps results">
            {google.suggestions.map((suggestion, index) => {
              const optionIndex = campus.length + index;
              return <li key={suggestion.id} role="option" id={`${id}-option-${optionIndex}`}
                aria-selected={active === optionIndex} className={active === optionIndex ? 'is-active' : ''}
                data-testid={`places-suggestion-${suggestion.id}`}
                onPointerDown={event => event.preventDefault()} onClick={() => void selectGoogle(suggestion)}>
                <MapPin size={15} aria-hidden="true" /><span>{suggestion.name}<small>{suggestion.address}</small></span>
              </li>;
            })}
          </ul>}
          {google.status === 'loading' && <p role="status" data-testid={`places-loading-${kind}`}>Searching nearby addresses…</p>}
          {google.status === 'no-results' && <p role="status" data-testid={`places-no-results-${kind}`}>No nearby addresses found. Try another search.</p>}
          {google.status === 'unavailable' && <p role="status" data-testid={`places-unavailable-${kind}`}>{google.message}</p>}
          {(google.status === 'error' || detailError) && <p role="alert" data-testid={`places-error-${kind}`}>{statusMessage}</p>}
          {resolvingId && <p role="status" data-testid={`places-resolving-${kind}`}>Finding exact coordinates…</p>}
          <div className="places-attribution" aria-label="Google Maps">
            <span className="places-attribution-google">Google</span>
            <span className="places-attribution-maps">Maps</span>
          </div>
        </div>}
      </div>
      {campus.length === 0 && !places && <p role="status">No campus match. Google address search is not enabled yet.</p>}
      {campus.length === 0 && places && google.status === 'idle' && !google.message && value.text.trim().length < 3
        && <p role="status">Type at least 3 characters to search nearby addresses.</p>}
    </div>}
    <p id={`${id}-help`} className="location-search-help">
      {!value.place && value.text ? 'Choose a suggestion to confirm coordinates.' : ''}
    </p>
  </div>;
}
