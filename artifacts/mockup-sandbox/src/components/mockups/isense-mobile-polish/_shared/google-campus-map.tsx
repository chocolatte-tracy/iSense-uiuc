// Original rendered JSX; external Maps effects intentionally stubbed for the baseline.
import {useRef} from 'react';
import {Compass,Info,MapPin} from 'lucide-react';
import type {DemoRoute} from './types';
export function GoogleCampusMap({ browserApiKey, setupMessage, routes, recommendedId, recommendedName,
  originName = 'Main Quad', destinationName = 'Grainger Engineering Library',
  originCoordinates = [40.1075212, -88.227231], destinationCoordinates = [40.1124997, -88.2269172] }: {
  browserApiKey?: string; setupMessage?: string; routes: DemoRoute[]; recommendedId?: string; recommendedName?: string;
  originName?: string; destinationName?: string;
  originCoordinates?: [number, number] | null; destinationCoordinates?: [number, number] | null;
}) {
  const node=useRef<HTMLDivElement>(null); const ready=false; const error=''; const hasGeometry=routes.some(route=>route.coordinates.length>1);
  return (
    <section className="map-card card" aria-labelledby="map-title">
      <div className="section-heading map-heading">
        <div><div className="eyebrow">ROUTE PREVIEW</div><h2 id="map-title">Campus map</h2></div>
        <span className="map-badge"><MapPin size={14} /> Google Maps</span>
      </div>
      <div className="map-frame">
        <div ref={node} className="google-map" aria-label="Google campus map with walking route alternatives" />
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
