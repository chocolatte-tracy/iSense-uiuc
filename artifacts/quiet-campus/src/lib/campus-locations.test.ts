import test from 'node:test';
import assert from 'node:assert/strict';
import { campusLocations, campusSuggestions, deviceLocation, isResearchDemoTrip, isSupportedLocation, locationField, mapLocationCoordinates, showUnresolvedMainLibrary, swapLocationFields, supportedWalkingArea, tripIdentity, tripValidation, type SelectedLocation } from './campus-locations';

const origin = locationField(campusLocations[0]);
const destination = locationField(campusLocations[1]);
test('Main Library fallback never contradicts live Places or a confirmed location', () => {
  assert.equal(showUnresolvedMainLibrary({ text: 'Main Library', place: null }, false), true);
  assert.equal(showUnresolvedMainLibrary({ text: 'Main Library', place: null }, true), false);
  assert.equal(showUnresolvedMainLibrary({ text: 'Another place', place: null }, false), false);
  const verified = locationField({ ...campusLocations[0], id: 'offline-library-fixture', name: 'Main Library', source: 'places', placeId: 'fixture-only' });
  assert.equal(showUnresolvedMainLibrary(verified, false), false);
  assert.equal(showUnresolvedMainLibrary(verified, true), false);
  assert.equal(campusSuggestions('Main Library').length, 0);
});

test('campus quick suggestions retain real supplied coordinates; arbitrary text is never a chosen place', () => {
  assert.equal(campusSuggestions('').length, 2);
  assert.equal(campusSuggestions('gRaInGeR')[0].id, 'grainger-library');
  assert.equal(campusSuggestions('Engineering')[0].id, 'grainger-library');
  assert.equal(campusSuggestions('123 Fictional Rd').length, 0);
  assert.equal(campusSuggestions('Main Library').length, 0);
  assert.match(tripValidation(origin, { text: destination.text, place: null })!, /Select a destination/);
  assert.match(tripValidation({ text: origin.text, place: null }, destination)!, /Select a starting/);
  assert.match(tripValidation(origin, { text: '', place: null })!, /Where to/);
  assert.match(tripValidation({ text: ' ', place: null }, destination)!, /starting/);
  assert.equal(tripValidation(origin, destination), null);
});
test('same coordinates, invalid coordinates, and unsupported locations are rejected', () => {
  assert.match(tripValidation(origin, origin)!, /same/);
  assert.match(tripValidation(origin, locationField({ ...campusLocations[0], id: 'another', name: 'Another name' }))!, /same/);
  const make = (coordinates: [number, number]): SelectedLocation => ({ ...campusLocations[1], coordinates });
  assert.equal(isSupportedLocation(make([supportedWalkingArea.north, supportedWalkingArea.east])), true);
  for (const point of [[NaN, -88.22], [40.11, Infinity], [supportedWalkingArea.north + .001, -88.22], [40.11, supportedWalkingArea.west - .001]] as [number, number][]) {
    assert.equal(isSupportedLocation(make(point)), false);
    assert.match(tripValidation(origin, locationField(make(point)))!, /UIUC walking area/);
  }
});
test('trip identity changes with coordinates or validation state; research demo is one direction only', () => {
  assert.equal(isResearchDemoTrip(origin, destination), true);
  assert.equal(isResearchDemoTrip(destination, origin), false);
  const shifted = locationField({ ...campusLocations[1], coordinates: [40.1126, -88.2269] });
  assert.notEqual(tripIdentity(origin, destination), tripIdentity(origin, shifted));
  assert.equal(isResearchDemoTrip(origin, shifted), false);
  assert.notEqual(tripIdentity(origin, destination), tripIdentity(origin, { text: destination.text, place: null }));
  assert.equal(isResearchDemoTrip(origin, { text: destination.text, place: null }), false);
});
test('browser geolocation retains reported position and accuracy, and rejects bad/outside readings', () => {
  const input = { latitude: 40.11, longitude: -88.23, accuracy: 24.7 };
  const place = deviceLocation(input);
  assert.deepEqual(place.coordinates, [40.11, -88.23]);
  assert.equal(place.accuracyMeters, 24.7);
  assert.equal(place.source, 'device');
  assert.equal(place.placeId, undefined);
  assert.throws(() => deviceLocation({ ...input, latitude: 41.88 }), /outside/);
  assert.throws(() => deviceLocation({ ...input, latitude: NaN }), /outside/);
  assert.throws(() => deviceLocation({ ...input, accuracy: 1001 }), /approximate/);
  assert.throws(() => deviceLocation({ ...input, accuracy: Infinity }), /approximate/);
});

test('swap preserves whole confirmed Places selections, IDs, coordinates and labels', () => {
  const origin = locationField({ ...campusLocations[0], source: 'places', placeId: 'offline-place-a' });
  const destination = locationField({ ...campusLocations[1], source: 'places', placeId: 'offline-place-b' });
  const current = { origin, destination };
  const swapped = swapLocationFields(current);
  assert.equal(swapped.origin, destination);
  assert.equal(swapped.destination, origin);
  assert.equal(swapped.origin.place!.placeId, 'offline-place-b');
  assert.equal(swapped.destination.place!.placeId, 'offline-place-a');
  assert.notEqual(tripIdentity(swapped.origin, swapped.destination), tripIdentity(origin, destination));
  assert.deepEqual(swapLocationFields(swapped), current);
  assert.equal(current.origin, origin);
});

test('device coordinates stay out of Maps before explicit routing, even after swapping', () => {
  const origin = locationField(deviceLocation({ latitude: 40.11, longitude: -88.23, accuracy: 10 }));
  const destination = locationField(campusLocations[1]);
  assert.equal(mapLocationCoordinates(origin, false), null);
  const swapped = swapLocationFields({ origin, destination });
  assert.equal(mapLocationCoordinates(swapped.destination, false), null);
  assert.deepEqual(mapLocationCoordinates(origin, true), [40.11, -88.23]);
  assert.deepEqual(mapLocationCoordinates(destination, false), destination.place!.coordinates);
  assert.equal(mapLocationCoordinates({ ...origin, text: 'Unconfirmed edit' }, true), null);
  assert.equal(mapLocationCoordinates({ text: '', place: null }, true), null);
});
