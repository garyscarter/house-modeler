import type { SunHoursGrid } from "../lib/site";

/** Share of the garden (cells with a value) getting at least `hours` of direct sun, 0-1. */
export function shareWithSun(grid: SunHoursGrid, hours: number): number {
  let n = 0;
  let lit = 0;
  for (const h of grid.hours) {
    if (Number.isNaN(h)) continue;
    n++;
    if (h >= hours) lit++;
  }
  return n ? lit / n : 0;
}
