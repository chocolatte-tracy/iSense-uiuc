export type SelectedLocation = {
  id: string;
  name: string;
  coordinates: [number, number];
  source: 'research' | 'device' | 'places';
  placeId?: string;
  accuracyMeters?: number;
};
export type LocationField = { text: string; place: SelectedLocation | null };

// Retain the two supplied research coordinates. Do not invent Main Library's
// missing position or treat a building entrance as having been field-verified.
export const campusLocations: readonly SelectedLocation[] = [
  { id: 'main-quad', name: 'Main Quad', coordinates: [40.1075212, -88.227231], source: 'research' },
  { id: 'grainger-library', name: 'Grainger Engineering Library', coordinates: [40.1124997, -88.2269172], source: 'research' },
];
// This is a configurable UI service-area guard, NOT sensory-data coverage,
// a pedestrian-accessibility boundary, or a guarantee of Google's coverage.
export const supportedWalkingArea = { south: 40.08, north: 40.135, west: -88.255, east: -88.205 } as const;
export const locationField = (place: SelectedLocation): LocationField => ({ text: place.name, place });

export function showUnresolvedMainLibrary(field: LocationField, placesEnabled: boolean) {
  // This is only an offline fallback hint, never a confirmed location.
  // When Places works, its actual suggestions/details resolve the building.
  return !placesEnabled && !field.place
    && 'main library'.includes(field.text.trim().toLowerCase());
}

export function swapLocationFields(fields: { origin: LocationField; destination: LocationField }) {
  return { origin: fields.destination, destination: fields.origin };
}

// A device position stays local until explicit routing has returned results.
// Merely selecting it must not re-center Google's map on private coordinates.
export function mapLocationCoordinates(field: LocationField, routingConfirmed: boolean) {
  if (!field.place || field.text !== field.place.name) return null;
  return field.place.source === 'device' && !routingConfirmed ? null : field.place.coordinates;
}
export function campusSuggestions(text: string) {
  const query = text.trim().toLowerCase();
  return campusLocations.filter(place => place.name.toLowerCase().includes(query)
    || (place.id === 'grainger-library' && ['engineering', 'grainger'].some(term => term.includes(query))));
}
export function isSupportedLocation(place: SelectedLocation) {
  const [lat, lng] = place.coordinates;
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= supportedWalkingArea.south && lat <= supportedWalkingArea.north
    && lng >= supportedWalkingArea.west && lng <= supportedWalkingArea.east;
}
export function tripValidation(origin: LocationField, destination: LocationField): string | null {
  if (!origin.text.trim()) return 'Choose a starting point or use your location.';
  if (!destination.text.trim()) return 'Where to? Choose a destination.';
  if (!origin.place || origin.text !== origin.place.name) return 'Select a starting point from the suggestions.';
  if (!destination.place || destination.text !== destination.place.name) return 'Select a destination from the suggestions to confirm its coordinates.';
  if (!isSupportedLocation(origin.place) || !isSupportedLocation(destination.place)) return 'Choose locations within the prototype’s UIUC walking area.';
  const [a, b] = origin.place.coordinates;
  const [c, d] = destination.place.coordinates;
  if (origin.place.id === destination.place.id || (Math.abs(a - c) < 0.00001 && Math.abs(b - d) < 0.00001)) {
    return 'Starting point and destination are the same. Choose a different destination.';
  }
  return null;
}
export function tripIdentity(origin: LocationField, destination: LocationField) {
  return JSON.stringify([origin.place && [origin.place.id, ...origin.place.coordinates],
    destination.place && [destination.place.id, ...destination.place.coordinates]]);
}
export function isResearchDemoTrip(origin: LocationField, destination: LocationField) {
  return !tripValidation(origin, destination)
    && origin.place?.id === campusLocations[0].id && destination.place?.id === campusLocations[1].id
    && origin.place.coordinates.every((number, i) => number === campusLocations[0].coordinates[i])
    && destination.place.coordinates.every((number, i) => number === campusLocations[1].coordinates[i]);
}
export function deviceLocation(coords: { latitude: number; longitude: number; accuracy: number }): SelectedLocation {
  if (!Number.isFinite(coords.accuracy) || coords.accuracy < 0 || coords.accuracy > 1000) {
    throw new Error('Your position is too approximate. Choose a campus starting point instead.');
  }
  const place: SelectedLocation = {
    id: `device:${coords.latitude},${coords.longitude}`, name: 'Current location',
    coordinates: [coords.latitude, coords.longitude], source: 'device', accuracyMeters: coords.accuracy,
  };
  if (!isSupportedLocation(place)) throw new Error('Your location is outside the prototype’s UIUC walking area. Choose a campus starting point instead.');
  return place;
}
