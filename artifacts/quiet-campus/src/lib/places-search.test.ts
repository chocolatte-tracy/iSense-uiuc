import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlacesSession, selectedGoogleLocation } from './places-search';
import { googleServiceError } from './google-service-error';

function fixture(mode: 'success' | 'denied' | 'empty' | 'missing' = 'success') {
  let calls = 0, details = 0, tokens = 0;
  const requests: google.maps.places.AutocompleteRequest[] = [];
  const fields: string[][] = [];
  const place = { id: 'synthetic-library', displayName: 'Main Library',
    location: mode === 'missing' ? null : { lat: () => 40.1048, lng: () => -88.2292 },
    fetchFields: async (request: { fields: string[] }) => { details++; fields.push(request.fields); },
  };
  const prediction = { placeId: place.id, mainText: { toString: () => 'Main Library' },
    secondaryText: { toString: () => 'Urbana, IL' }, toPlace: () => place };
  const library = {
    AutocompleteSessionToken: class { constructor() { tokens++; } },
    AutocompleteSuggestion: { fetchAutocompleteSuggestions: async (request: google.maps.places.AutocompleteRequest) => {
      calls++; requests.push(request);
      if (mode === 'denied') throw new Error('REQUEST_DENIED synthetic-google-key-must-not-be-echoed');
      return { suggestions: mode === 'empty' ? [] : [{ placePrediction: prediction }] };
    } },
  } as unknown as google.maps.PlacesLibrary;
  return { session: createPlacesSession('synthetic-browser', async () => library),
    count: () => ({ calls, details, tokens }), requests, fields };
}

test('Places New uses geographic restriction, independent sessions, explicit details and valid coordinates', async () => {
  const f = fixture();
  assert.deepEqual(await f.session.suggest('Ma'), []);
  assert.equal(f.count().calls, 0);
  const options = await f.session.suggest('Main');
  await f.session.suggest('Main Library');
  assert.equal(f.count().tokens, 1);
  assert.equal(f.requests[0].sessionToken, f.requests[1].sessionToken);
  assert.deepEqual(f.requests[0].locationRestriction, { south: 40.08, north: 40.135, west: -88.255, east: -88.205 });
  assert.equal(f.count().details, 0);
  const selected = await f.session.select(options[0]);
  assert.equal(selected.source, 'places');
  assert.equal(selected.placeId, 'synthetic-library');
  assert.deepEqual(selected.coordinates, [40.1048, -88.2292]);
  assert.deepEqual(f.fields, [['id', 'displayName', 'location']]);
  await assert.rejects(f.session.select(options[0]), /PLACE_NOT_SELECTED/);
  await f.session.suggest('Cafe');
  assert.equal(f.count().tokens, 2);
});

test('Places permission failure is distinct and sanitized; no results is not a confirmed place', async () => {
  await assert.rejects(fixture('denied').session.suggest('Library'), error => {
    assert.match(String(error), /REQUEST_DENIED/);
    assert.ok(!String(error).includes('synthetic-google-key'));
    return true;
  });
  const f = fixture('empty');
  assert.deepEqual(await f.session.suggest('Nowhere'), []);
  assert.equal(f.count().details, 0);
});

test('missing, nonfinite, mismatched and outside-area coordinates are never selectable', async () => {
  const f = fixture('missing');
  await assert.rejects(f.session.select((await f.session.suggest('Library'))[0]), /PLACE_COORDINATES_MISSING/);
  for (const coordinates of [[NaN, -88.22], [40.1, Infinity], [41, -87]]) {
    assert.throws(() => selectedGoogleLocation({ id: 'x', displayName: 'Outside',
      location: { lat: () => coordinates[0], lng: () => coordinates[1] } as google.maps.LatLng },
      { id: 'x', name: 'Selected' }), /PLACE_OUTSIDE_SERVICE_AREA/);
  }
  assert.throws(() => selectedGoogleLocation({ id: 'different' }, { id: 'x', name: 'Selected' }), /PLACE_COORDINATES_MISSING/);
});

test('Maps and Places preserve precise known categories without forwarding keys; ambiguous auth remains unconfirmed', () => {
  for (const code of ['RefererNotAllowedMapError', 'ApiNotActivatedMapError', 'InvalidKeyMapError', 'BillingNotEnabledMapError']) {
    const error = googleServiceError(new Error(`${code} fake-key-value`), 'Maps');
    assert.equal(error.code, code);
    assert.ok(!error.message.includes('fake-key-value'));
  }
  assert.equal(googleServiceError(new Error('Failed to fetch')).code, 'NETWORK_ERROR');
  assert.equal(googleServiceError(new Error('unknown failure with private URL')).code, 'GOOGLE_SERVICE_UNAVAILABLE');
});
