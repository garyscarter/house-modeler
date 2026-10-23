import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { HouseModel, Site } from "../types";
import { useStore } from "../store";
import { bearingToWorld, solarPosition, sunTimes } from "../lib/sun";
import { housePrisms, neighbourPrism, sunHoursGrid, type SunHoursGrid } from "../lib/site";
import { SUN_YEAR } from "./useSun";

/** Top of the colour scale: this many hours or more of direct sun. */
export const SUN_HOURS_MAX = 8;

/** Colour ramp for hours of sun: deep blue (none) through purple and orange to yellow. */
const STOPS: [number, [number, number, number]][] = [
  [0, [40, 60, 150]],
  [0.25, [130, 70, 170]],
  [0.5, [235, 110, 80]],
  [0.75, [250, 180, 60]],
  [1, [255, 240, 120]],
];
export function sunHoursColour(hours: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, hours / SUN_HOURS_MAX));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * f)) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** CSS gradient matching the ramp, for legends. */
export const SUN_HOURS_GRADIENT = `linear-gradient(to right, ${STOPS.map(([t, c]) => `rgb(${c.join(",")}) ${t * 100}%`).join(", ")})`;

// The grid is shared by the 3D overlay and the legend, so keep the last result.
let last: { site: Site; model: HouseModel; day: number; grid: SunHoursGrid | null } | null = null;

/** Hours of direct sun per 0.5 m of the plot for the sun study's day (cached for the same inputs). */
export function useSunHours(site: Site | undefined, model: HouseModel | undefined): SunHoursGrid | null {
  const day = useStore((s) => s.sun.dayOfYear);
  return useMemo(() => {
    if (!site || !model || site.boundary.length < 3) return null;
    if (last && last.site === site && last.model === model && last.day === day) return last.grid;
    const { sunrise, sunset } = sunTimes(site.latitude, site.longitude, SUN_YEAR, day);
    let grid: SunHoursGrid | null = null;
    if (sunrise !== null && sunset !== null) {
      const prisms = [...housePrisms(model), ...site.neighbours.map(neighbourPrism)];
      const sun = (t: number) => {
        const p = solarPosition(site.latitude, site.longitude, SUN_YEAR, day, t);
        const d = bearingToWorld(site.frontBearing, p.azimuth);
        return { x: d.x, y: d.z, altitude: p.altitude };
      };
      grid = sunHoursGrid(site.boundary, prisms, sun, sunrise, sunset, 0.5, 0.25);
    }
    last = { site, model, day, grid };
    return grid;
  }, [site, model, day]);
}

/** Heat map of sun hours laid just above the garden surfaces at height `y`. */
export function SunHoursOverlay({ site, model, y }: { site: Site; model: HouseModel; y: number }) {
  const grid = useSunHours(site, model);
  const tex = useMemo(() => {
    if (!grid) return null;
    const { nx, ny } = grid;
    const data = new Uint8Array(nx * ny * 4);
    // Texture rows run from the front (v = 0 lies at +z once the plane is laid flat), grid rows from the rear.
    grid.hours.forEach((h, i) => {
      if (Number.isNaN(h)) return;
      const row = ny - 1 - Math.floor(i / nx);
      data.set([...sunHoursColour(h), 255], (row * nx + (i % nx)) * 4);
    });
    const t = new THREE.DataTexture(data, grid.nx, grid.ny, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }, [grid]);
  useEffect(() => () => tex?.dispose(), [tex]);
  if (!grid || !tex) return null;
  const w = grid.nx * grid.cell;
  const h = grid.ny * grid.cell;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[grid.x0 + w / 2, y, grid.y0 + h / 2]} renderOrder={2}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent opacity={0.72} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
