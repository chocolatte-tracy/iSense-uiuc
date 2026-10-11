import type { DemoRoute } from './route-scoring';
import { buildGoogleMapsUrl } from '@workspace/campus-routing/routing';

export function buildGoogleMapsURL(route: DemoRoute): string {
  return buildGoogleMapsUrl({
    origin: route.navigationOrigin ?? route.originName,
    destination: route.navigationDestination ?? route.destinationName,
    waypoints: route.candidateWaypoints
      .map(({ latitude, longitude }) => ({ lat: latitude, lng: longitude })),
  });
}
