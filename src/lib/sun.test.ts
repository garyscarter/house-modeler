import { describe, expect, it } from "vitest";
import {
  bearingToWorld,
  compassPoint,
  dateOfDay,
  daylight,
  dayOfYear,
  formatClock,
  formatDay,
  solarPosition,
  sunTimes,
  sunVector,
  ukClockToUtc,
  ukOffset,
  ukZone,
  worldToBearing,
} from "./sun";

// Bristol.
const LAT = 51.44;
const LON = -2.62;
const Y = 2026;
const JUN21 = dayOfYear(Y, 6, 21);
const DEC21 = dayOfYear(Y, 12, 21);
const MAR20 = dayOfYear(Y, 3, 20);

describe("calendar", () => {
  it("converts between dates and days of the year", () => {
    expect(dayOfYear(Y, 1, 1)).toBe(1);
    expect(JUN21).toBe(172);
    expect(dayOfYear(2024, 12, 31)).toBe(366);
    expect(dateOfDay(Y, 172)).toEqual({ month: 6, day: 21 });
    expect(formatDay(Y, DEC21)).toBe("21 Dec");
  });

  it("switches to BST at 01:00 UTC on the last Sunday of March and back in October", () => {
    // 2026: 29 March and 25 October.
    const mar29 = dayOfYear(Y, 3, 29);
    const oct25 = dayOfYear(Y, 10, 25);
    expect(ukOffset(Y, mar29, 0.99)).toBe(0);
    expect(ukOffset(Y, mar29, 1)).toBe(1);
    expect(ukOffset(Y, oct25, 0.99)).toBe(1);
    expect(ukOffset(Y, oct25, 1)).toBe(0);
    expect(ukZone(Y, JUN21)).toBe("BST");
    expect(ukZone(Y, DEC21)).toBe("GMT");
    expect(ukClockToUtc(Y, JUN21, 13)).toBe(12);
    expect(ukClockToUtc(Y, DEC21, 13)).toBe(13);
  });
});

describe("solarPosition", () => {
  it("puts the summer solstice noon sun about 62 degrees up in the south", () => {
    const { noon } = sunTimes(LAT, LON, Y, JUN21);
    const p = solarPosition(LAT, LON, Y, JUN21, noon);
    expect(p.altitude).toBeCloseTo(62.1, 0);
    expect(p.azimuth).toBeCloseTo(180, 0);
  });

  it("puts the winter solstice noon sun about 15 degrees up", () => {
    const { noon } = sunTimes(LAT, LON, Y, DEC21);
    const p = solarPosition(LAT, LON, Y, DEC21, noon);
    expect(p.altitude).toBeGreaterThan(14.6);
    expect(p.altitude).toBeLessThan(15.8);
  });

  it("rises close to due east at the equinox", () => {
    const { sunrise } = sunTimes(LAT, LON, Y, MAR20);
    const p = solarPosition(LAT, LON, Y, MAR20, sunrise!);
    expect(Math.abs(p.azimuth - 90)).toBeLessThan(1.5);
    expect(Math.abs(p.altitude)).toBeLessThan(0.6);
  });

  it("has the sun in the west in a summer evening and below the horizon at night", () => {
    const eve = solarPosition(LAT, LON, Y, JUN21, 19);
    expect(eve.azimuth).toBeGreaterThan(270);
    expect(eve.azimuth).toBeLessThan(300);
    expect(solarPosition(LAT, LON, Y, DEC21, 22).altitude).toBeLessThan(-30);
  });
});

describe("sunTimes", () => {
  const near = (h: number | null, hh: number, mm: number) => expect(Math.abs((h ?? NaN) - (hh + mm / 60)) * 60).toBeLessThan(3);

  it("matches published Bristol times on the solstices", () => {
    const jun = sunTimes(LAT, LON, Y, JUN21);
    near(jun.sunrise, 4, 55);
    near(jun.noon, 13, 12);
    near(jun.sunset, 21, 32);
    const dec = sunTimes(LAT, LON, Y, DEC21);
    near(dec.sunrise, 8, 13);
    near(dec.noon, 12, 9);
    near(dec.sunset, 16, 4);
  });

  it("reports no sunrise during the polar night", () => {
    expect(sunTimes(78, 15, Y, DEC21).sunrise).toBeNull();
  });
});

describe("orientation", () => {
  it("maps compass bearings to world directions for a south-facing front", () => {
    const south = bearingToWorld(180, 180);
    expect(south.z).toBeGreaterThan(0.99);
    expect(Math.abs(south.x)).toBeLessThan(1e-9);
    const east = bearingToWorld(180, 90);
    expect(east.x).toBeGreaterThan(0.99);
  });

  it("points +x to the front bearing minus 90", () => {
    const d = bearingToWorld(162, 72);
    expect(d.x).toBeCloseTo(1);
    expect(d.z).toBeCloseTo(0);
  });

  it("inverts with worldToBearing", () => {
    for (const f of [0, 90, 162, 271]) {
      for (const a of [0, 45, 180, 300]) {
        const d = bearingToWorld(f, a);
        expect(worldToBearing(f, d.x, d.z)).toBeCloseTo(a);
      }
    }
  });

  it("gives a unit sun vector, up when the sun is up", () => {
    const v = sunVector(162, { azimuth: 180, altitude: 30 });
    expect(Math.hypot(...v)).toBeCloseTo(1);
    expect(v[1]).toBeCloseTo(0.5);
    // South is in front of a house facing SSE, slightly to its left.
    expect(v[2]).toBeGreaterThan(0.8);
    expect(v[0]).toBeLessThan(0);
  });
});

describe("daylight", () => {
  it("fades the sun out at the horizon and warms it near it", () => {
    expect(daylight(-5).sun).toBe(0);
    expect(daylight(40).sun).toBe(1);
    expect(daylight(5).sun).toBeGreaterThan(0.05);
    expect(daylight(5).sun).toBeLessThan(0.5);
    expect(daylight(2).warmth).toBeGreaterThan(0.9);
    expect(daylight(45).warmth).toBe(0);
    expect(daylight(-20).sky).toBeCloseTo(0.08);
    expect(daylight(30).sky).toBe(1);
  });
});

describe("formatting", () => {
  it("formats clock times and compass points", () => {
    expect(formatClock(13.25)).toBe("13:15");
    expect(formatClock(4.999)).toBe("05:00");
    expect(compassPoint(162)).toBe("SSE");
    expect(compassPoint(359)).toBe("N");
    expect(compassPoint(-90)).toBe("W");
  });
});
