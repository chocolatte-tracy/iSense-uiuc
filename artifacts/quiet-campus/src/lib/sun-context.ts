import SunCalc from 'suncalc';

export const UIUC_TIME_ZONE = 'America/Chicago';
export const UIUC_SUN_LOCATION = { latitude: 40.1075212, longitude: -88.227231 };
export type SunLocation = { latitude: number; longitude: number };
export type SunContext = {
  phase: 'daytime' | 'nighttime' | 'unavailable';
  departureTime: Date;
  localDate: string;
  timeZone: typeof UIUC_TIME_ZONE;
  location: SunLocation;
  sunrise: Date | null;
  sunset: Date | null;
};

const localDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: UIUC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

function localSolarDay(instant: Date) {
  const parts = localDateFormatter.formatToParts(instant);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  const localDate = `${part('year')}-${part('month')}-${part('day')}`;
  // Noon CST / 13:00 CDT identifies the Illinois calendar day in either offset.
  const anchor = new Date(0);
  anchor.setUTCFullYear(Number(part('year')), Number(part('month')) - 1, Number(part('day')));
  anchor.setUTCHours(18, 0, 0, 0);
  return { localDate, anchor };
}

// An explicit instant supports a future departure-time selector without relying
// on the visitor's timezone. SunCalc uses the standard -0.833° apparent horizon.
export function calculateSunContext(
  departureTime: Date = new Date(),
  location: SunLocation = UIUC_SUN_LOCATION,
): SunContext {
  const instant = new Date(departureTime.getTime());
  const base: Pick<SunContext, 'departureTime' | 'timeZone' | 'location'> = {
    departureTime: instant, timeZone: UIUC_TIME_ZONE, location: { ...location },
  };
  if (!Number.isFinite(instant.getTime())) {
    return { ...base, phase: 'unavailable', localDate: '', sunrise: null, sunset: null };
  }
  const { localDate, anchor } = localSolarDay(instant);
  if (!Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
    || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180) {
    return { ...base, phase: 'unavailable', localDate, sunrise: null, sunset: null };
  }
  // Anchor to the Illinois local date, never the visitor's device date.
  // 18:00 UTC is noon CST / 13:00 CDT; this is a calculation anchor, NOT a
  // fixed sunrise/sunset time. Coordinates determine both solar events.
  const { sunrise, sunset } = SunCalc.getTimes(anchor, location.latitude, location.longitude);
  if (!Number.isFinite(sunrise.getTime()) || !Number.isFinite(sunset.getTime()) || sunrise >= sunset) {
    return { ...base, phase: 'unavailable', localDate, sunrise: null, sunset: null };
  }
  return { ...base, localDate, sunrise, sunset,
    phase: instant >= sunrise && instant < sunset ? 'daytime' : 'nighttime' };
}

export type TripSunEvent = { kind: 'sunrise' | 'sunset'; time: Date };
export type TripSunEstimate =
  | { status: 'available'; departureTime: Date; arrivalTime: Date; events: TripSunEvent[] }
  | { status: 'unavailable'; reason: 'departure' | 'duration' | 'solar' };
type WalkingDuration = { durationSeconds?: number; walkingTimeMinutes?: number };

// This is an informational estimate only; it never changes scores or preferences.
export function estimateTripSunEvents(route: WalkingDuration, context?: SunContext): TripSunEstimate {
  if (!context || !Number.isFinite(context.departureTime.getTime())) {
    return { status: 'unavailable', reason: 'departure' };
  }
  const validDuration = (value: number | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  const durationSeconds = validDuration(route.durationSeconds) ? route.durationSeconds
    : validDuration(route.walkingTimeMinutes) ? route.walkingTimeMinutes * 60 : NaN;
  const departure = context.departureTime.getTime();
  // Bound calendar iteration for corrupt input, rather than freezing the UI or
  // silently truncating an estimate. Normal campus walking times are minutes.
  const arrivalTime = new Date(departure + durationSeconds * 1000);
  if (!validDuration(durationSeconds) || durationSeconds > 366 * 24 * 60 * 60
    || !Number.isFinite(arrivalTime.getTime())) {
    return { status: 'unavailable', reason: 'duration' };
  }
  if (context.phase === 'unavailable') return { status: 'unavailable', reason: 'solar' };

  const { anchor } = localSolarDay(context.departureTime);
  const lastDay = localSolarDay(arrivalTime).anchor;
  const events: TripSunEvent[] = [];
  // Advance calendar dates at a UTC calculation anchor, NOT by adding 24 hours
  // to local midnight or departure: DST days can contain 23 or 25 hours.
  for (; anchor <= lastDay; anchor.setUTCDate(anchor.getUTCDate() + 1)) {
    const daily = calculateSunContext(anchor, context.location);
    if (!daily.sunrise || !daily.sunset) return { status: 'unavailable', reason: 'solar' };
    for (const kind of ['sunrise', 'sunset'] as const) {
      const time = daily[kind]!;
      // An event at departure already defines the phase; an event at estimated
      // arrival still matters. Compare instants, never rounded display times.
      if (time.getTime() > departure && time <= arrivalTime) events.push({ kind, time });
    }
  }
  events.sort((a, b) => a.time.getTime() - b.time.getTime());
  return { status: 'available', departureTime: new Date(departure), arrivalTime, events };
}

export const sunTripTimeLabel = (instant: Date) => new Intl.DateTimeFormat('en-US', {
  timeZone: UIUC_TIME_ZONE, year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
}).format(instant);

// The simulation exists only in the Vite development demo, never in a
// production build or saved preferences. Require an explicit UTC/offset instant.
export function solarPreviewTime(search: string, development: boolean): Date | null {
  if (!development) return null;
  const params = new URLSearchParams(search);
  const value = params.get('solarTime');
  if (params.get('preview') !== 'demo' || !value || value.length > 40
    || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

export function nextSunRefreshDelay(context: SunContext, now = Date.now()): number {
  const nextEvent = [context.sunrise, context.sunset]
    .filter((value): value is Date => value !== null && value.getTime() > now)
    .map(value => value.getTime() - now);
  // Refresh at the boundary, and periodically for clock changes. No network.
  return Math.max(1, Math.min(30_000, ...nextEvent));
}

export const sunClockLabel = (instant: Date) => new Intl.DateTimeFormat('en-US', {
  timeZone: UIUC_TIME_ZONE, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
}).format(instant);
