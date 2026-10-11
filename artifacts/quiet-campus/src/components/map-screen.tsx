import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Check, LocateFixed, MapPin, Search } from 'lucide-react';
import { GoogleCampusMap } from '@/components/google-campus-map';
import { LocationSearch } from '@/components/location-search';
import type { DemoRoute } from '@/lib/route-scoring';
import { mapLocationCoordinates, type LocationField } from '@/lib/campus-locations';
import type { PlacesOptions } from '@/lib/places-search';
import type { CommunityReport } from '@workspace/api-client-react';

type MapScreenProps = {
  active: boolean;
  browserApiKey?: string;
  mapMessage?: string;
  places?: PlacesOptions;
  routes: DemoRoute[];
  selectedRoute?: DemoRoute;
  origin: LocationField;
  destination: LocationField;
  changeEndpoint: (side: 'origin' | 'destination', field: LocationField) => void;
  swapEndpoints: () => void;
  useMyLocation: () => void;
  locating: boolean;
  locationMessage: string;
  validation: string | null;
  loadingRoutes: boolean;
  routeStatus: string;
  onFindRoutes: () => void;
  onSearchModeChange: (searching: boolean) => void;
  onHelp: () => void;
  reports: CommunityReport[];
  reportPicking: boolean;
  onReportPointSelected: (point: [number, number]) => void;
  onCancelReportPick: () => void;
};

export function MapScreen(props: MapScreenProps) {
  const { active, browserApiKey, mapMessage, places, routes, selectedRoute, origin, destination, changeEndpoint,
    swapEndpoints, useMyLocation, locating, locationMessage, validation, loadingRoutes,
    routeStatus, onFindRoutes, onSearchModeChange, onHelp, reports, reportPicking,
    onReportPointSelected, onCancelReportPick } = props;
  const [searchSide, setSearchSide] = useState<'origin' | 'destination' | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const cancelSearch = useCallback(() => {
    setSearchSide(null);
    onSearchModeChange(false);
    requestAnimationFrame(() => returnFocus.current?.focus());
  }, [onSearchModeChange]);
  useEffect(() => {
    if (!active && searchSide) cancelSearch();
  }, [active, cancelSearch, searchSide]);
  const openSearch = (side: 'origin' | 'destination') => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSearchSide(side);
    onSearchModeChange(true);
  };
  const commitSearch = (field: LocationField) => {
    if (!searchSide) return;
    changeEndpoint(searchSide, field);
    setSearchSide(null);
    onSearchModeChange(false);
    requestAnimationFrame(() => returnFocus.current?.focus());
  };

  return <section className="app-screen map-screen" aria-label="Map and route planner"
    aria-hidden={!active || searchSide !== null} hidden={!active || searchSide !== null} inert={!active || searchSide !== null}>
    <div className="screen-heading" inert={searchSide !== null}>
      <div><div className="eyebrow">UIUC CAMPUS</div><h1>Plan a walk</h1></div>
      <button className="help-trigger" type="button" onClick={onHelp}>Help</button>
    </div>
    <div className="map-workspace" inert={searchSide !== null}>
      <div className="map-section" data-testid="map-section">
      {/* Keep the real Google map mounted while other screens and location search are active. */}
      <GoogleCampusMap browserApiKey={browserApiKey} setupMessage={mapMessage} routes={routes}
        reports={reports} reportPicking={reportPicking} onReportPointSelected={onReportPointSelected}
        originName={origin.place?.name ?? 'Choose starting point'}
        destinationName={destination.place?.name ?? 'Choose destination'}
        originCoordinates={mapLocationCoordinates(origin, routes.some(route => route.source === 'google'))}
        destinationCoordinates={mapLocationCoordinates(destination, routes.some(route => route.source === 'google'))}
        recommendedId={selectedRoute?.id} recommendedName={selectedRoute?.name} />
      {reportPicking && <div className="map-pick-banner" role="status" data-testid="status-report-map-pick">
        <span>Tap the map to choose a report location. This point will not be geocoded.</span>
        <button type="button" onClick={onCancelReportPick} data-testid="button-cancel-map-pick">Return to report</button>
      </div>}
      </div>
      <section className="location-card card route-planner" aria-labelledby="trip-title" data-testid="route-planner">
        <h2 id="trip-title" className="sr-only">Plan a campus walk</h2>
        <div className="location-controls">
          <div className="endpoint-control">
            <span className="field-label">Starting at</span>
            <button type="button" className={`endpoint-choice${origin.place ? ' is-confirmed' : ''}`}
              onClick={() => openSearch('origin')}
              aria-label={`Change starting point, currently ${origin.place?.name ?? (origin.text || 'not selected')}`}
              data-testid="open-search-origin">
              <MapPin size={17} aria-hidden="true"/><span>{origin.place?.name ?? (origin.text || 'Choose a starting point')}</span>
              {origin.place && <Check size={16} aria-label="Coordinates confirmed"/>}
            </button>
            <button type="button" className="location-target-control"
              aria-label="Use my current location" title="Use my current location"
              aria-busy={locating} disabled={locating} onClick={useMyLocation}
              data-testid="button-use-my-location"><LocateFixed size={18} aria-hidden="true" /></button>
          </div>
          <button type="button" className="trip-swap-control" onClick={swapEndpoints}
            aria-label="Swap starting point and destination" title="Swap starting point and destination"
            data-testid="button-swap-locations"><ArrowDownUp size={18} aria-hidden="true" /></button>
          <div className="endpoint-control endpoint-control-destination">
            <span className="field-label">Going to</span>
            <button type="button" className={`endpoint-choice${destination.place ? ' is-confirmed' : ''}`}
              onClick={() => openSearch('destination')}
              aria-label={`Change destination, currently ${destination.place?.name ?? (destination.text || 'not selected')}`}
              data-testid="open-search-destination">
              <Search size={17} aria-hidden="true"/><span>{destination.place?.name ?? (destination.text || 'Choose a destination')}</span>
              {destination.place && <Check size={16} aria-label="Coordinates confirmed"/>}
            </button>
          </div>
        </div>
        {locationMessage && <p className="trip-message" role="status" data-testid="status-location">{locationMessage}</p>}
        {validation && <p className="trip-message" data-invalid="true" role="status" data-testid="status-trip-validation">{validation}</p>}
        <button className="route-fetch-button" type="button" onClick={onFindRoutes}
          disabled={Boolean(validation) || loadingRoutes || locating} data-testid="fetch-walking-routes">
          <Search size={18} aria-hidden="true"/>{loadingRoutes ? 'Finding routes…' : 'Find routes'}
        </button>
        <p className="trip-message" role="status" data-testid="status-route-planner">{routeStatus}</p>
      </section>
    </div>
    {searchSide && <LocationSearch key={searchSide} label={searchSide === 'origin' ? 'Starting at' : 'Going to'}
      kind={searchSide} initialValue={searchSide === 'origin' ? origin : destination}
      places={places} onCancel={cancelSearch} onSelect={commitSearch}/>}
  </section>;
}
