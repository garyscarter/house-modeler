/**
 * Solar position for the sun study, using NOAA's approximation of the Meeus
 * equations (about 0.5 degree accuracy, plenty for shadows), in UK clock
 * time: GMT in winter and BST (UTC+1) from 01:00 UTC on the last Sunday of
 * March to 01:00 UTC on the last Sunday of October.
 */

const RAD = Math.PI / 180;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
export const daysInYear = (year: number) => (isLeapYear(year) ? 366 : 365);

/** Day of the year (1-366) for a calendar date; month is 1-12. */
export function dayOfYear(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
}

/** Calendar date of a day of the year; month is 1-12. */
export function dateOfDay(year: number, doy: number): { month: number; day: number } {
  const d = new Date(Date.UTC(year, 0, doy));
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** "21 Jun". */
export function formatDay(year: number, doy: number): string {
  const { month, day } = dateOfDay(year, doy);
  return `${day} ${MONTHS[month - 1]}`;
}

/** Day of the month of the last Sunday in a month (1-12). */
function lastSunday(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month, 0));
  return last.getUTCDate() - last.getUTCDay();
}

/** BST start and end as hours since 00:00 UTC on 1 January. */
function bstWindow(year: number): [number, number] {
  const start = (dayOfYear(year, 3, lastSunday(year, 3)) - 1) * 24 + 1;
  const end = (dayOfYear(year, 10, lastSunday(year, 10)) - 1) * 24 + 1;
  return [start, end];
}

/** Hours to add to UTC for UK clock time at a UTC instant (1 during BST). */
export function ukOffset(year: number, doy: number, utcHour: number): 0 | 1 {
  const t = (doy - 1) * 24 + utcHour;
  const [s, e] = bstWindow(year);
  return t >= s && t < e ? 1 : 0;
}

/** UTC hours for a UK clock time. In the repeated hour in October the BST reading wins. */
export function ukClockToUtc(year: number, doy: number, clockHour: number): number {
  return ukOffset(year, doy, clockHour - 1) === 1 ? clockHour - 1 : clockHour;
}

/** "BST" or "GMT" for the middle of a day. */
export const ukZone = (year: number, doy: number) => (ukOffset(year, doy, 12) ? "BST" : "GMT");

interface SolarTerms {
  /** Equation of time, minutes. */
  eqTime: number;
  /** Declination, radians. */
  decl: number;
}

function solarTerms(year: number, doy: number, utcHour: number): SolarTerms {
  const g = ((2 * Math.PI) / daysInYear(year)) * (doy - 1 + (utcHour - 12) / 24);
  const eqTime =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  return { eqTime, decl };
}

/** Atmospheric refraction in degrees for a geometric elevation (NOAA's fit). */
function refraction(e: number): number {
  if (e > 85) return 0;
  const t = Math.tan(e * RAD);
  let arcsec: number;
  if (e > 5) arcsec = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5;
  else if (e > -0.575) arcsec = 1735 + e * (-518.2 + e * (103.4 + e * (-12.79 + e * 0.711)));
  else arcsec = -20.772 / t;
  return arcsec / 3600;
}

export interface SunPosition {
  /** Compass bearing of the sun, degrees clockwise from north. */
  azimuth: number;
  /** Apparent altitude above the horizon, degrees (negative below it). */
  altitude: number;
}

/** Where the sun is at a UK clock time. Longitude is positive east. */
export function solarPosition(lat: number, lon: number, year: number, doy: number, clockHour: number): SunPosition {
  const utc = ukClockToUtc(year, doy, clockHour);
  const { eqTime, decl } = solarTerms(year, doy, utc);
  const trueSolarMinutes = utc * 60 + eqTime + 4 * lon;
  const ha = (trueSolarMinutes / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const elevation = 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / RAD;
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180;
  return { azimuth: ((az % 360) + 360) % 360, altitude: elevation + refraction(elevation) };
}

export interface SunTimes {
  /** UK clock hours; null when the sun does not rise or set that day. */
  sunrise: number | null;
  noon: number;
  sunset: number | null;
}

/** Sunrise, solar noon and sunset in UK clock time (sunrise/sunset include refraction and the sun's radius). */
export function sunTimes(lat: number, lon: number, year: number, doy: number): SunTimes {
  const phi = lat * RAD;
  const toClock = (utc: number) => utc + ukOffset(year, doy, utc);
  // Each event is solved twice so the solar terms are taken at (about) the event itself.
  const solve = (sign: -1 | 0 | 1): number | null => {
    let utc = 12 - lon / 15;
    for (let i = 0; i < 2; i++) {
      const { eqTime, decl } = solarTerms(year, doy, utc);
      let haDeg = 0;
      if (sign !== 0) {
        const c = Math.cos(90.833 * RAD) / (Math.cos(phi) * Math.cos(decl)) - Math.tan(phi) * Math.tan(decl);
        if (c > 1 || c < -1) return null;
        haDeg = Math.acos(c) / RAD;
      }
      utc = (720 - 4 * (lon - sign * haDeg) - eqTime) / 60;
    }
    return utc;
  };
  const rise = solve(-1);
  const set = solve(1);
  return { sunrise: rise === null ? null : toClock(rise), noon: toClock(solve(0)!), sunset: set === null ? null : toClock(set) };
}

/** "13:05". */
export function formatClock(hour: number): string {
  const mins = Math.round(hour * 60);
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** Sixteen-point compass name for a bearing, e.g. 162 -> "SSE". */
export function compassPoint(bearing: number): string {
  const b = ((bearing % 360) + 360) % 360;
  return POINTS[Math.round(b / 22.5) % 16];
}

/**
 * Horizontal world direction of a compass bearing. World +z (the front of
 * the house, the bottom of the plan) points to `frontBearing`; +x points to
 * frontBearing - 90.
 */
export function bearingToWorld(frontBearing: number, bearing: number): { x: number; z: number } {
  return { x: Math.sin((frontBearing - bearing) * RAD), z: Math.cos((bearing - frontBearing) * RAD) };
}

/** Compass bearing of a horizontal world direction (the inverse of bearingToWorld). */
export function worldToBearing(frontBearing: number, x: number, z: number): number {
  const b = frontBearing - Math.atan2(x, z) / RAD;
  return ((b % 360) + 360) % 360;
}

/** Unit vector pointing from the scene towards the sun, world [x, y, z]. */
export function sunVector(frontBearing: number, sun: SunPosition): [number, number, number] {
  const h = bearingToWorld(frontBearing, sun.azimuth);
  const c = Math.cos(sun.altitude * RAD);
  return [h.x * c, Math.sin(sun.altitude * RAD), h.z * c];
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export interface Daylight {
  /** Strength of direct sunlight, 0-1: none below the horizon, full above about 25 degrees. */
  sun: number;
  /** Strength of skylight, 0.25 at night (a dim, readable twilight) up to 1 in daylight. */
  sky: number;
  /** How orange the sunlight is, 1 at the horizon to 0 above about 30 degrees. */
  warmth: number;
}

/** How bright and warm daylight is for a sun altitude in degrees. */
export function daylight(altitude: number): Daylight {
  return {
    sun: smooth(-1, 25, altitude),
    sky: 0.25 + 0.75 * smooth(-10, 20, altitude),
    warmth: 1 - smooth(0, 30, altitude),
  };
}
