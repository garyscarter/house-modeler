import { describe, expect, it } from "vitest";
import { DUSK_ALTITUDE, duskHour, lightGlow } from "./dusk";
import { dayOfYear, solarPosition, sunTimes } from "./sun";
import { listingSite } from "./houses/listing91770873";

const site = listingSite();
const YEAR = 2026;

describe("duskHour", () => {
  it("is after 21:00 BST at midsummer", () => {
    const h = duskHour(site, YEAR, dayOfYear(YEAR, 6, 21));
    expect(h).toBeGreaterThan(21);
    expect(h).toBeLessThan(22);
  });
  it("is before 16:30 GMT at midwinter", () => {
    const h = duskHour(site, YEAR, dayOfYear(YEAR, 12, 21));
    expect(h).toBeLessThan(16.5);
    expect(h).toBeGreaterThan(15.5);
  });
  it("puts the sun at the dusk altitude, before sunset", () => {
    for (const [m, d] of [[3, 21], [9, 21], [11, 2]]) {
      const doy = dayOfYear(YEAR, m, d);
      const h = duskHour(site, YEAR, doy);
      expect(solarPosition(site.latitude, site.longitude, YEAR, doy, h).altitude).toBeCloseTo(DUSK_ALTITUDE, 2);
      expect(h).toBeLessThan(sunTimes(site.latitude, site.longitude, YEAR, doy).sunset!);
    }
  });
});

describe("lightGlow", () => {
  it("is dim by day and full at the horizon", () => {
    expect(lightGlow(40)).toBeCloseTo(0.15);
    expect(lightGlow(15)).toBeCloseTo(0.15);
    expect(lightGlow(0)).toBeCloseTo(1);
    expect(lightGlow(-8)).toBeCloseTo(1);
    expect(lightGlow(null)).toBeCloseTo(0.15);
  });
  it("rises monotonically as the sun goes down", () => {
    let prev = -1;
    for (let a = 30; a >= -5; a -= 0.5) {
      const g = lightGlow(a);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });
});
