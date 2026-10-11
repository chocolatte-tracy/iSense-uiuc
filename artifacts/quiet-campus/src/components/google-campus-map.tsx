/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react';
import { Compass, Info, MapPin } from 'lucide-react';
import type { DemoRoute } from '@/lib/route-scoring';
import { loadGoogleMaps, onGoogleAuthFailure } from '@/lib/google-maps-sdk';
import { googleServiceError } from '@/lib/google-service-error';
import type { CommunityReport } from '@workspace/api-client-react';

export function GoogleCampusMap({ browserApiKey, setupMessage, routes, recommendedId, recommendedName,
  originName = 'Main Quad', destinationName = 'Grainger Engineering Library',
  originCoordinates = [40.1075212, -88.227231], destinationCoordinates = [40.1124997, -88.2269172],
  reports = [], reportPicking = false, onReportPointSelected }: {
  browserApiKey?: string; setupMessage?: string; routes: DemoRoute[]; recommendedId?: string; recommendedName?: string;
  originName?: string; destinationName?: string;
  originCoordinates?: [number, number] | null; destinationCoordinates?: [number, number] | null;
  reports?: CommunityReport[]; reportPicking?: boolean;
  onReportPointSelected?: (point: [number, number]) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const endpointMarkers = useRef<google.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [pickError, setPickError] = useState('');
  useEffect(() => {
    setError(''); setReady(false);
    if (!browserApiKey || !node.current) return;
    let cancelled = false;
    let authFailed = false;
    let markers: google.maps.Marker[] = [];
    const unsubscribe = onGoogleAuthFailure(error => {
      authFailed = true;
      if (!cancelled) { setError(error.message); setReady(false); }
    });
    loadGoogleMaps(browserApiKey).then(() => {
      if (cancelled || authFailed || !node.current) return;
      map.current = new google.maps.Map(node.current, {
        center: { lat: 40.11001, lng: -88.22707 }, zoom: 16,
        streetViewControl: false, mapTypeControl: false, fullscreenControl: true,
        gestureHandling: 'cooperative', zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
      });
      markers = [
        new google.maps.Marker({
          map: map.current, position: { lat: 40.1075212, lng: -88.227231 },
          title: 'UIUC Main Quad — starting point', label: 'A',
        }),
        new google.maps.Marker({
          map: map.current, position: { lat: 40.1124997, lng: -88.2269172 },
          title: 'Grainger Engineering Library — destination', label: 'B',
        }),
      ];
      endpointMarkers.current = markers;
      const campusBounds = new google.maps.LatLngBounds();
      for (const marker of markers) {
        const position = marker.getPosition();
        if (position) campusBounds.extend(position);
      }
      map.current.fitBounds(campusBounds, 50);
      setReady(true);
    }).catch(error => {
      if (!cancelled) setError(googleServiceError(error, 'Google Maps').message);
    });
    return () => { cancelled = true; unsubscribe(); markers.forEach((marker) => marker.setMap(null)); endpointMarkers.current = []; map.current = null; };
  }, [browserApiKey]);
  useEffect(() => {
    if (!ready || !node.current || !map.current) return;
    const canvas = node.current;
    let frame = 0;
    const observer = new ResizeObserver(entries => {
      if (!entries.some(entry => entry.contentRect.width > 0 && entry.contentRect.height > 0)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (map.current) google.maps.event.trigger(map.current, 'resize');
      });
    });
    observer.observe(canvas);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [ready]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const bounds = new google.maps.LatLngBounds();
    const firstLiveRoute = routes.find(route => route.source === 'google');
    if (firstLiveRoute) {
      const endpoints = [firstLiveRoute.coordinates[0], firstLiveRoute.coordinates.at(-1)!];
      endpointMarkers.current.forEach((marker, index) => {
        const [lat, lng] = endpoints[index];
        marker.setMap(map.current);
        marker.setPosition({ lat, lng });
        marker.setTitle(index === 0 ? firstLiveRoute.originName : firstLiveRoute.destinationName);
      });
    } else {
      endpointMarkers.current.forEach((marker, index) => {
        const point = index === 0 ? originCoordinates : destinationCoordinates;
        marker.setMap(point ? map.current : null);
        if (point) marker.setPosition({ lat: point[0], lng: point[1] });
        marker.setTitle(index === 0 ? originName : destinationName);
      });
    }
    const lines = routes.filter((route) => route.source === 'google').map((route) => {
      const path = route.coordinates.map(([lat, lng]) => ({ lat, lng }));
      path.forEach((point) => bounds.extend(point));
      const recommended = route.id === recommendedId;
      return new google.maps.Polyline({
        map: map.current, path, strokeColor: recommended ? '#d88b56' : '#78aeca',
        strokeOpacity: recommended ? 1 : 0.65, strokeWeight: recommended ? 7 : 4,
        zIndex: recommended ? 10 : 1,
      });
    });
    if (!bounds.isEmpty()) map.current.fitBounds(bounds, 30);
    return () => lines.forEach((line) => line.setMap(null));
  }, [ready, routes, recommendedId, originName, destinationName, originCoordinates, destinationCoordinates]);
  useEffect(() => {
    setPickError('');
    if (!ready || !map.current || !reportPicking || !onReportPointSelected) return;
    const listener = map.current.addListener('click', (event: google.maps.MapMouseEvent) => {
      const lat = event.latLng?.lat(), lng = event.latLng?.lng();
      if (lat === undefined || lng === undefined) return;
      if (lat < 40.07 || lat > 40.15 || lng < -88.29 || lng > -88.17) {
        setPickError('Select a point in the UIUC campus area.'); return;
      }
      onReportPointSelected([lat, lng]);
    });
    return () => listener.remove();
  }, [ready, reportPicking, onReportPointSelected]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const markers = reports.slice(0, 100).map(report => new google.maps.Marker({
      map: map.current, position: { lat: report.latitude, lng: report.longitude }, label: 'R',
      title: `Unverified community observation: ${report.locationName}. Noise ${report.noise}; crowds ${report.crowds}; ${new Date(report.observedAt).toLocaleString()}. Informational only.`,
    }));
    return () => markers.forEach(marker => marker.setMap(null));
  }, [ready, reports]);
  const hasGeometry = routes.some((route) => route.source === 'google');
  return (
    <section className="map-card card" data-map-state={!browserApiKey ? 'disabled' : error ? 'error' : ready ? 'ready' : 'loading'} aria-labelledby="map-title">
      <div className="section-heading map-heading">
        <div><div className="eyebrow">ROUTE PREVIEW</div><h2 id="map-title">Campus map</h2></div>
        <span className="map-badge"><MapPin size={14} /> Google Maps</span>
      </div>
      <div className="map-frame" data-map-state={!browserApiKey ? 'disabled' : error ? 'error' : ready ? 'ready' : 'loading'}>
        <div ref={node} className="google-map" aria-label="Google campus map with walking route alternatives" />
        {reportPicking && pickError && <p className="map-pick-warning" role="alert">{pickError}</p>}
        {!ready && (
          <div className="map-placeholder" role="status">
            <span className="map-placeholder-icon"><Compass size={19} /></span>
            <strong>{error ? 'Map unavailable' : browserApiKey ? 'Google route preview' : 'Map display not enabled'}</strong>
            <span>{error || (browserApiKey ? 'Loading the UIUC campus map…' : setupMessage || 'MAPS_DISABLED: Map display is switched off. Route cards remain available.')}</span>
            <span className="map-recommendation" data-testid="map-recommended-route">{recommendedName ? `Selected: ${recommendedName}` : 'Choose your places, then find routes below.'}</span>
          </div>
        )}
      </div>
      <div className="map-note"><Info size={15} /><span>{hasGeometry
        ? `${originName} → ${destinationName}. Orange: selected · blue: alternatives. Google geometry does not verify sensory conditions. Unmapped portions remain DEMO DATA.`
        : `${originName} → ${destinationName}. Campus overview only; no route geometry is invented from candidate waypoints.`}</span></div>
    </section>
  );
}
