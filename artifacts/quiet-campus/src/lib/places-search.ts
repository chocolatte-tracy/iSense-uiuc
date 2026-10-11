/// <reference types="google.maps" />
import { isSupportedLocation, supportedWalkingArea, type SelectedLocation } from './campus-locations';
import { loadGoogleMaps } from './google-maps-sdk';
import { GoogleServiceError, googleServiceError } from './google-service-error';

export type PlacesOptions = { enabled: boolean; apiKey?: string; message: string };
export type PlaceSuggestion = {
  id: string; name: string; address: string;
  prediction: google.maps.places.PlacePrediction;
};
type PlacesLibraryProvider = () => Promise<google.maps.PlacesLibrary>;

export function selectedGoogleLocation(place: Pick<google.maps.places.Place, 'id' | 'displayName' | 'location'>,
  suggestion: Pick<PlaceSuggestion, 'id' | 'name'>): SelectedLocation {
  const location = place.location;
  if (!location || !place.id || place.id !== suggestion.id) {
    throw new GoogleServiceError('PLACE_COORDINATES_MISSING', 'Google did not return coordinates for this selected place. Choose another suggestion.');
  }
  const result: SelectedLocation = {
    id: `place:${place.id}`, placeId: place.id, name: place.displayName || suggestion.name,
    coordinates: [location.lat(), location.lng()], source: 'places',
  };
  if (!isSupportedLocation(result)) throw new GoogleServiceError('PLACE_OUTSIDE_SERVICE_AREA',
    'This place is outside the UIUC / nearby Urbana-Champaign walking area supported by this prototype.');
  return result;
}

// Inject the library in offline tests. No legacy Autocomplete/PlacesService.
export function createPlacesSession(apiKey: string, provideLibrary: PlacesLibraryProvider = async () => {
  await loadGoogleMaps(apiKey);
  if (!window.google?.maps?.importLibrary) throw new GoogleServiceError('PLACES_UNAVAILABLE', 'Places API (New) could not be loaded.');
  return await google.maps.importLibrary('places') as google.maps.PlacesLibrary;
}) {
  let token: google.maps.places.AutocompleteSessionToken | undefined;
  const issued = new WeakSet<google.maps.places.PlacePrediction>();
  const reset = () => { token = undefined; };
  return {
    reset,
    async suggest(query: string): Promise<PlaceSuggestion[]> {
      const input = query.trim();
      if (input.length < 3) return [];
      if (input.length > 100) throw new GoogleServiceError('PLACE_QUERY_TOO_LONG', 'Use a shorter place name or address (up to 100 characters).');
      try {
        const library = await provideLibrary();
        if (!library.AutocompleteSuggestion || !library.AutocompleteSessionToken) {
          throw new GoogleServiceError('PLACES_UNAVAILABLE', 'Places API (New) is unavailable; do not substitute legacy autocomplete.');
        }
        token ??= new library.AutocompleteSessionToken();
        const { suggestions } = await library.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input, sessionToken: token, locationRestriction: supportedWalkingArea,
          includedRegionCodes: ['us'], region: 'us', language: 'en',
        });
        return suggestions.flatMap(item => {
          const p = item.placePrediction;
          if (!p?.placeId) return [];
          issued.add(p);
          return [{ id: p.placeId, name: p.mainText?.toString() || p.text.toString(),
            address: p.secondaryText?.toString() || '', prediction: p }];
        }).slice(0, 5);
      } catch (error) { throw googleServiceError(error, 'Places autocomplete'); }
    },
    async select(suggestion: PlaceSuggestion): Promise<SelectedLocation> {
      if (!issued.has(suggestion.prediction)) throw new GoogleServiceError('PLACE_NOT_SELECTED', 'Select a Google suggestion from this search session.');
      try {
        const place = suggestion.prediction.toPlace();
        // Prediction transfers its session token; the first fetchFields ends the session.
        await place.fetchFields({ fields: ['id', 'displayName', 'location'] });
        return selectedGoogleLocation(place, suggestion);
      } catch (error) { throw googleServiceError(error, 'Places details'); }
      finally { issued.delete(suggestion.prediction); reset(); }
    },
  };
}
