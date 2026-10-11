import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@workspace/api-client-react';
import { demoRoutes } from '@/lib/demo-routes';
import { loadCampusRoutes, requestWalkingRoutes } from '@/lib/live-routes';
import { applyCampusObservations, type ObservationDataset } from '@/lib/campus-observations';
import { campusLocations, deviceLocation, isResearchDemoTrip, locationField, swapLocationFields, tripIdentity, tripValidation, type LocationField } from '@/lib/campus-locations';
import type { DemoRoute } from '@/lib/route-scoring';
import { useNetworkStatus } from './use-network-status';
import { routingFailureMessage } from '@/lib/routing-error';
import type { PlacesOptions } from '@/lib/places-search';
import { watchConfiguration } from '@/lib/configuration-refresh';

export function useTripPlanner(observations: ObservationDataset) {
  const online = useNetworkStatus();
  const [endpoints, setEndpoints] = useState({ origin: locationField(campusLocations[0]), destination: locationField(campusLocations[1]) });
  const [routesEnabled, setRoutesEnabled] = useState(false);
  const [browserApiKey, setBrowserApiKey] = useState<string>();
  const [mapMessage, setMapMessage] = useState('MAPS_DISABLED: Map display is not enabled. Route cards remain available.');
  const [places, setPlaces] = useState<PlacesOptions>({ enabled: false, message: 'Checking address search availability… Campus choices remain available.' });
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [routeStatus, setRouteStatus] = useState('Research demo · environmental values are DEMO DATA.');
  const [loaded, setLoaded] = useState<{ key: string; routes: DemoRoute[] } | null>(null);
  const requestVersion = useRef(0);
  const geoVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const endpointsRef = useRef(endpoints);
  const invalidate = useCallback(() => {
    requestVersion.current++;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setLoadingRoutes(false);
    setLoaded(null);
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('preview') === 'demo') return;
    let firstResult = true;
    return watchConfiguration({ window, document }, loadCampusRoutes, result => {
      setBrowserApiKey(result.browserApiKey);
      setMapMessage(result.mapMessage);
      setPlaces(result.places);
      setRoutesEnabled(result.routesEnabled);
      // A focus/reconnect check must not overwrite a fetched route's explanation.
      if (firstResult) setRouteStatus(result.message);
      firstResult = false;
    }, () => {
      setRoutesEnabled(false);
      setPlaces({ enabled: false, message: 'CONFIG_UNAVAILABLE: Address search configuration could not be loaded. Campus choices remain available.' });
      if (firstResult) {
        setRouteStatus('CONFIG_UNAVAILABLE: Could not reach the app backend. Research demo remains available.');
        setMapMessage('CONFIG_UNAVAILABLE: Map configuration could not be loaded from the app backend.');
      }
    });
  }, []);
  useEffect(() => () => { activeRequest.current?.abort(); geoVersion.current++; requestVersion.current++; }, []);
  // A connection loss stops in-flight requests, but must not silently replace
  // an already loaded route with a different demo path. Trip data is not persisted.
  useEffect(() => {
    if (!online) {
      requestVersion.current++;
      activeRequest.current?.abort();
      setLoadingRoutes(false);
    }
  }, [online]);
  const changeEndpoint = useCallback((side: 'origin' | 'destination', field: LocationField) => {
    invalidate();
    if (side === 'origin') { geoVersion.current++; setLocating(false); setLocationMessage(''); }
    const next = { ...endpointsRef.current, [side]: field };
    endpointsRef.current = next;
    setEndpoints(next);
    setRouteStatus('Locations changed · previous live results cleared.');
  }, [invalidate]);
  const swapEndpoints = useCallback(() => {
    invalidate(); geoVersion.current++; setLocating(false); setLocationMessage('');
    const current = endpointsRef.current;
    const next = swapLocationFields(current);
    endpointsRef.current = next;
    setEndpoints(next);
    setRouteStatus('Locations swapped · find routes for this direction.');
  }, [invalidate]);
  const useMyLocation = useCallback(() => {
    if (locating) return;
    if (!navigator.geolocation) { setLocationMessage('Location is unavailable in this browser. Choose a campus starting point.'); return; }
    if (!window.isSecureContext) { setLocationMessage('Your location needs HTTPS. Choose a campus starting point.'); return; }
    invalidate();
    const version = ++geoVersion.current;
    setLocating(true); setLocationMessage('Finding your location…');
    navigator.geolocation.getCurrentPosition(position => {
      if (version !== geoVersion.current) return;
      setLocating(false);
      try {
        const place = deviceLocation(position.coords);
        changeEndpoint('origin', locationField(place));
        setLocationMessage(`Device-reported position · approximately ±${Math.round(position.coords.accuracy)} m. Confirm the starting point before walking.`);
      } catch (error) {
        setLocationMessage(error instanceof Error ? error.message : 'Location unavailable. Choose a campus starting point.');
      }
    }, error => {
      if (version !== geoVersion.current) return;
      setLocating(false);
      setLocationMessage(error.code === 1 ? 'Location permission denied. You can still choose a campus starting point.'
        : error.code === 3 ? 'Location timed out. Try again or choose a campus starting point.'
        : 'Your location could not be found. Choose a campus starting point.');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
  }, [changeEndpoint, invalidate, locating]);
  const validation = tripValidation(endpoints.origin, endpoints.destination);
  const key = tripIdentity(endpoints.origin, endpoints.destination);
  const supportedPair = isResearchDemoTrip(endpoints.origin, endpoints.destination);
  const availableRoutes = useMemo(() => {
    if (validation || locating || loaded?.key !== key) return [];
    return loaded.routes.map(route => applyCampusObservations(route, observations));
  }, [validation, locating, loaded, key, observations]);
  const fetchRoutes = async () => {
    if (loadingRoutes || locating) return false;
    const current = endpointsRef.current;
    const error = tripValidation(current.origin, current.destination);
    if (error) { setRouteStatus(error); return false; }
    if (!online || !routesEnabled) {
      if (isResearchDemoTrip(current.origin, current.destination)) {
        setLoaded({ key: tripIdentity(current.origin, current.destination), routes: demoRoutes });
        setRouteStatus(`${!online ? 'Offline' : 'Research demo'} · 3 researched candidates. Environmental values are DEMO DATA.`);
        return true;
      } else setRouteStatus(`${!online ? 'Offline.' : routeStatus} Live routing is not available for this trip. The demo only covers Main Quad → Grainger.`);
      return false;
    }
    activeRequest.current?.abort();
    const version = ++requestVersion.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoadingRoutes(true);
    setRouteStatus('Finding walking routes…');
    try {
      const origin = current.origin.place!;
      const destination = current.destination.place!;
      const result = await requestWalkingRoutes({
        origin: { lat: origin.coordinates[0], lng: origin.coordinates[1] },
        destination: { lat: destination.coordinates[0], lng: destination.coordinates[1] },
      }, { originId: origin.id, destinationId: destination.id, originName: origin.name, destinationName: destination.name }, controller.signal);
      if (controller.signal.aborted || version !== requestVersion.current) return false;
      setLoaded({ key: tripIdentity(current.origin, current.destination), routes: result.routes });
      setRouteStatus(result.message);
      return result.routes.length > 0;
    } catch (error) {
      if (controller.signal.aborted || version !== requestVersion.current) return false;
      setLoaded(null);
      setRouteStatus(routingFailureMessage(error instanceof ApiError ? error.status : null,
        error instanceof ApiError ? error.data : null));
      return false;
    } finally {
      if (version === requestVersion.current && !controller.signal.aborted) setLoadingRoutes(false);
    }
  };
  return {
    ...endpoints, changeEndpoint, swapEndpoints, useMyLocation, locating, locationMessage,
    validation, tripKey: key, availableRoutes, routesEnabled, browserApiKey, mapMessage, places, routeStatus,
    loadingRoutes, fetchRoutes, hasSearched: loaded?.key === key, online,
  };
}
