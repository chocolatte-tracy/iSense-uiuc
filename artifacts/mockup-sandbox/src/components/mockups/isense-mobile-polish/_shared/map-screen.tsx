import { ArrowDownUp, LocateFixed, Search } from 'lucide-react';
import { GoogleCampusMap } from './google-campus-map';
import { LocationSearch } from './location-search';
import type { DemoRoute } from './types';
import type { LocationField } from './campus-locations';
import type { PlacesOptions } from './types';

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
  onHelp: () => void;
};

export function MapScreen(props: MapScreenProps) {
  const { active, browserApiKey, mapMessage, places, routes, selectedRoute, origin, destination, changeEndpoint,
    swapEndpoints, useMyLocation, locating, locationMessage, validation, loadingRoutes,
    routeStatus, onFindRoutes, onHelp } = props;
  return <section className="app-screen map-screen" aria-label="Map and route planner"
    aria-hidden={!active} hidden={!active} inert={!active}>
    <div className="screen-heading">
      <div><div className="eyebrow">YOUR CAMPUS WALK</div><h1>Where to?</h1></div>
      <button className="help-trigger" type="button" onClick={onHelp}>Help</button>
    </div>
    <div className="demo-disclosure" role="status" data-testid="route-data-status">
      <span><strong>{routes.some(route => route.source === 'google') ? 'Google routes' : 'Research demo'}</strong>
        {' · '}Sensory values may include DEMO DATA. Review route details.</span>
    </div>
    <div className="map-workspace">
      {/* Kept mounted when inactive so changing tabs never constructs a second paid map. */}
      <GoogleCampusMap browserApiKey={browserApiKey} setupMessage={mapMessage} routes={routes}
        originName={origin.place?.name ?? 'Choose starting point'}
        destinationName={destination.place?.name ?? 'Choose destination'}
        originCoordinates={origin.place?.coordinates ?? null}
        destinationCoordinates={destination.place?.coordinates ?? null}
        recommendedId={selectedRoute?.id} recommendedName={selectedRoute?.name} />
      <section className="location-card card" aria-labelledby="trip-title">
        <h2 id="trip-title" className="sr-only">Plan a campus walk</h2>
        <div className="location-controls">
          <LocationSearch label="Starting at" kind="origin" value={origin} places={places}
            onChange={field => changeEndpoint('origin', field)} />
          <span className="trip-arrow" aria-hidden="true"><ArrowDownUp size={17} /></span>
          <LocationSearch label="Where to?" kind="destination" value={destination} places={places}
            onChange={field => changeEndpoint('destination', field)} />
        </div>
        <div className="trip-actions">
          <button type="button" className="quiet-action" onClick={useMyLocation} disabled={locating}
            data-testid="button-use-my-location"><LocateFixed size={17} />
            {locating ? 'Finding location…' : 'Use my location'}</button>
          <button type="button" className="quiet-action" onClick={swapEndpoints}
            data-testid="button-swap-locations">Swap locations</button>
        </div>
        {locationMessage && <p className="trip-message" role="status" data-testid="status-location">{locationMessage}</p>}
        {validation && <p className="trip-message" data-invalid="true" role="status" data-testid="status-trip-validation">{validation}</p>}
        <button className="route-fetch-button" type="button" onClick={onFindRoutes}
          disabled={Boolean(validation) || loadingRoutes || locating} data-testid="fetch-walking-routes">
          <Search size={18} />{loadingRoutes ? 'Finding routes…' : 'Find routes'}
        </button>
        <p className="trip-message" role="status" data-testid="status-route-planner">{routeStatus}</p>
      </section>
    </div>
  </section>;
}
