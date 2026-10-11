/** Same NOAA fractional-year approximation as research/prediction/shade.py. */
export function solarPosition(at: Date, latitude: number, longitude: number) {
  const rad = Math.PI / 180, year = at.getUTCFullYear();
  const hour = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const day = Math.floor((Date.UTC(year, at.getUTCMonth(), at.getUTCDate()) - Date.UTC(year, 0, 1)) / 86400000) + 1;
  const gamma = 2 * Math.PI / (leap ? 366 : 365) * (day - 1 + (hour - 12) / 24);
  const eq = 229.18 * (.000075 + .001868 * Math.cos(gamma) - .032077 * Math.sin(gamma)
    - .014615 * Math.cos(2 * gamma) - .040849 * Math.sin(2 * gamma));
  const dec = .006918 - .399912 * Math.cos(gamma) + .070257 * Math.sin(gamma)
    - .006758 * Math.cos(2 * gamma) + .000907 * Math.sin(2 * gamma)
    - .002697 * Math.cos(3 * gamma) + .00148 * Math.sin(3 * gamma);
  const angle = ((((hour * 60 + eq + 4 * longitude) % 1440) + 1440) % 1440 / 4 - 180) * rad;
  const lat = latitude * rad;
  const up = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(angle);
  const east = -Math.cos(dec) * Math.sin(angle);
  const north = Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(angle);
  return { elevation: Math.asin(Math.max(-1, Math.min(1, up))) / rad,
    azimuth: (Math.atan2(east, north) / rad + 360) % 360 };
}
