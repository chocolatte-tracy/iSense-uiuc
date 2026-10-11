import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, MapPin, Search } from 'lucide-react';
import { campusSuggestions, locationField, type LocationField } from '@/lib/campus-locations';
import type { PlaceSuggestion, PlacesOptions } from '@/lib/places-search';
import { usePlacesAutocomplete } from '@/hooks/use-places-autocomplete';
import './places-search.css';

type LocationSearchProps = {
  label: string;
  kind: 'origin' | 'destination';
  initialValue: LocationField;
  onCancel: () => void;
  onSelect: (value: LocationField) => void;
  places?: PlacesOptions;
};

export function LocationSearch({ label, kind, initialValue, onCancel, onSelect, places }: LocationSearchProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const version = useRef(0);
  const selectionLock = useRef(false);
  const mounted = useRef(true);
  const [draft, setDraft] = useState(initialValue.text);
  const [edited, setEdited] = useState(!initialValue.place);
  const [active, setActive] = useState(-1);
  const [resolving, setResolving] = useState(false);
  const [detailError, setDetailError] = useState('');
  const campus = campusSuggestions(draft);
  // Opening an already confirmed campus endpoint is not a new Google search.
  const google = usePlacesAutocomplete(places, draft, edited && !resolving);
  const selectableCount = campus.length + google.suggestions.length;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
    mounted.current = true;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog.current) return;
      const nodes = [...dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )].filter(node => node.getClientRects().length > 0);
      if (!nodes.length) return;
      if (!dialog.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? nodes.at(-1) : nodes[0])?.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
        event.preventDefault();
        nodes[0].focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      cancelAnimationFrame(frame);
      mounted.current = false;
      version.current += 1;
      document.removeEventListener('keydown', keydown);
    };
  // Parent configuration/daylight refreshes must not invalidate an in-flight
  // Place Details selection by re-running the mount/unmount lifecycle.
  }, []);

  const selectCampus = (index: number) => {
    if (selectionLock.current) return;
    const place = campus[index];
    if (!place) return;
    version.current += 1;
    input.current?.blur();
    onSelect(locationField(place));
  };

  const selectGoogle = async (suggestion: PlaceSuggestion) => {
    if (selectionLock.current) return;
    selectionLock.current = true;
    const request = ++version.current;
    setResolving(true);
    setDetailError('');
    try {
      const place = await google.select(suggestion);
      if (!mounted.current || version.current !== request) return;
      if (!place.coordinates.every(Number.isFinite) || !place.placeId) {
        throw new Error('Google did not return a confirmed place ID and coordinates. Choose another suggestion.');
      }
      input.current?.blur();
      onSelect(locationField(place));
    } catch (error) {
      if (!mounted.current || version.current !== request) return;
      selectionLock.current = false;
      setResolving(false);
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

  const statusMessage = detailError || (resolving ? 'Finding exact coordinates…' : google.message);

  return createPortal(<div className="location-search-backdrop">
    <section className="location-search-screen" ref={dialog} role="dialog" aria-modal="true"
      aria-labelledby={`${id}-title`} data-testid={`location-search-screen-${kind}`}>
      <header className="location-search-header">
        <button type="button" className="location-search-back" onClick={onCancel} aria-label="Cancel location search">
          <ArrowLeft size={20} aria-hidden="true"/><span>Back</span>
        </button>
        <div><span className="location-search-kicker">{kind === 'origin' ? 'STARTING POINT' : 'DESTINATION'}</span>
          <h1 id={`${id}-title`}>{label}</h1></div>
        <span className="location-search-header-mark" aria-hidden="true">
          {kind === 'origin' ? <MapPin size={18}/> : <Search size={18}/>}
        </span>
      </header>
      <label className="location-search-field-label" htmlFor={id}>Search a campus place or nearby address</label>
      <div className="location-search-input-wrap">
        <Search size={19} aria-hidden="true"/>
        <input ref={input} id={id} role="combobox" aria-label={`Search ${label.toLowerCase()}`}
          aria-busy={resolving || google.status === 'loading'}
          disabled={resolving}
          aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-options`}
          aria-activedescendant={active >= 0 && active < selectableCount ? `${id}-option-${active}` : undefined}
          aria-describedby={`${id}-help`} autoComplete="off" spellCheck={false}
          data-testid={`search-${kind}`} value={draft} maxLength={300}
          placeholder="Try Main Library or Grainger"
          onChange={event => {
            setEdited(true);
            version.current += 1;
            setResolving(false);
            setDetailError('');
            setDraft(event.target.value);
            setActive(-1);
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              moveActive(event.key === 'ArrowDown' ? 1 : -1);
            } else if (event.key === 'Enter' && active >= 0) {
              event.preventDefault();
              chooseActive();
            }
          }}/>
      </div>
      <div className="location-search-results">
        <div className="location-search-results-title">Campus quick choices</div>
        <div className="location-suggestions-list" role="listbox" id={`${id}-options`} aria-label={`${label} suggestions`}>
          {campus.map((place, index) => <button type="button" role="option" id={`${id}-option-${index}`}
            disabled={resolving}
            aria-selected={active === index} className={`location-suggestion${active === index ? ' is-active' : ''}`}
            key={place.id} data-testid={`campus-suggestion-${place.id}`}
            onPointerDown={event => event.preventDefault()} onClick={() => selectCampus(index)}>
            <MapPin size={18} aria-hidden="true"/><span><strong>{place.name}</strong><small>UIUC · research coordinates</small></span>
            <Check size={17} aria-hidden="true"/>
          </button>)}
          {!places?.enabled && draft.trim().toLowerCase().includes('main library') &&
            <p className="location-search-service-note" role="status">Main Library needs an online Places result to confirm its coordinates.</p>}
        </div>
        {places && <div className="places-results-group">
          <div className="location-search-results-title">Nearby address results</div>
          {google.suggestions.length > 0 && <div className="location-suggestions-list" role="group" aria-label="Google Maps results">
            {google.suggestions.map((suggestion, index) => {
              const optionIndex = campus.length + index;
              return <button type="button" role="option" id={`${id}-option-${optionIndex}`}
                disabled={resolving}
                aria-selected={active === optionIndex} className={`location-suggestion${active === optionIndex ? ' is-active' : ''}`}
                key={suggestion.id} data-testid={`places-suggestion-${suggestion.id}`}
                onPointerDown={event => event.preventDefault()} onClick={() => void selectGoogle(suggestion)}>
                <MapPin size={18} aria-hidden="true"/><span><strong>{suggestion.name}</strong><small>{suggestion.address}</small></span>
              </button>;
            })}
          </div>}
          {google.status === 'loading' && <p className="location-search-feedback" role="status" data-testid={`places-loading-${kind}`}>Searching nearby addresses…</p>}
          {google.status === 'no-results' && <p className="location-search-feedback" role="status" data-testid={`places-no-results-${kind}`}>No nearby addresses found. Try another search.</p>}
          {google.status === 'unavailable' && <p className="location-search-feedback" role="status" data-testid={`places-unavailable-${kind}`}>{google.message}</p>}
          {(google.status === 'error' || detailError) && <p className="location-search-feedback is-error" role="alert" data-testid={`places-error-${kind}`}>{statusMessage}</p>}
          {resolving && <p className="location-search-feedback" role="status" data-testid={`places-resolving-${kind}`}>Finding exact coordinates…</p>}
          <div className="places-attribution" aria-label="Google Maps">
            <span className="places-attribution-google">Google</span><span className="places-attribution-maps">Maps</span>
          </div>
        </div>}
        {draft.trim().length > 0 && draft.trim().length < 3 &&
          <p className="location-search-feedback" role="status">Type at least 3 characters to search nearby addresses.</p>}
      </div>
      <p id={`${id}-help`} className="location-search-help">
        Choose one result to confirm a complete location. Your current route and other endpoint stay unchanged until you choose.
      </p>
      <div className="location-search-safe-note">No route is requested until you choose Find routes.</div>
    </section>
  </div>, document.body);
}
