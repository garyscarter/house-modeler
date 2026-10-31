import { daylight } from "./sun";
import type { NavGlazing, WalkAdapt } from "./walkTypes";

/**
 * Eyes adjust: walking from a dim hall into a sunny kitchen, the view settles part of the way (Natural 60%, Strong
 * 85%, Off none), quickly towards light and slowly towards dark. A CPU meter reads the room (its glazing, the sky,
 * its lit lamps and how much glass is in view) and eases an EV offset that the walk applies as an exposure factor.
 * Pure maths, no three.js; src/three/walk/WalkExposure.tsx runs it.
 */
export const ADAPT_READY = true;
/** How far the view adapts to the metered scene, by setting. */
export const ADAPT_STRENGTH: Record<WalkAdapt, number> = { off: 0, natural: 0.6, strong: 0.85 };
export const EV_RANGE = { lo: -1.5, hi: 1.0 };
/** A phone held upright: a narrow view, so one window would dominate and the range is tighter. */
export const EV_RANGE_PORTRAIT = { lo: -1.0, hi: 0.7 };
export const GLAZE_PORTRAIT = 0.7;
/** = 3 (a window is about 3x the room's ambient) * 0.75 (glass transmittance). */
export const GLAZE_GAIN = 2.25;
export const NIGHT_FLOOR = 0.02;
/** A room lit to this reads like a daylit one. */
export const LAMP_LM_PER_M2 = 300;
/** A 15%-glazed room at noon with 10% of the weighted view on glass meters EV 0. */
export const L_REF = 0.715;
/** EV: smaller target moves are ignored, so a look-round across a window does not pump the view. */
export const DEAD_BAND = 0.15;
/** Going into a brighter place (EV falls): time constant s, rate cap EV/s. */
export const TAU_BRIGHTEN = 0.4, RATE_BRIGHTEN = 2.0;
/** Going into a darker place (EV rises). */
export const TAU_DARKEN = 1.75, RATE_DARKEN = 0.7;
export const METER_EVERY = 0.2;
export const CONVERGED = 0.02;

/** Sky level (environment and hemisphere light) in the dead of night: a trace, so dark rooms read dark, not black. */
const NIGHT_SKY = 0.03;
/** How much the sky dims as the sun sits on the horizon. */
const DUSK_DIM = 0.35;
/** Same edge order as THREE.MathUtils.smoothstep(x, min, max). */
function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * (3 - 2 * t);
}
/** The night band of the ambient light: Lighting's nightDark, which is pinned against this in the tests. */
const nightBand = (altitude: number): number => 1 - smoothstep(altitude, -6, -2);

/** Environment and hemisphere sky level, as the scene is lit: 1 with the sun study off; daylight's sky dimmed at dusk, down to 0.03 at night. */
export function skyLevel(altitude: number | null): number {
  if (altitude === null) return 1;
  const low = 1 - smoothstep(altitude, 0, 6);
  const day = daylight(altitude).sky * (1 - DUSK_DIM * low);
  const dark = nightBand(altitude);
  return day + (NIGHT_SKY - day) * dark;
}
/** The daylight part of a sky level, 0 at night and 1 at noon: windows add nothing in the dark. */
export const skyDay = (sky: number): number => Math.min(1, Math.max(0, (sky - NIGHT_SKY) / 0.97));

export interface MeterIn {
  glazedArea: number;
  floorArea: number;
  sky: number;
  lamps: number;
  /** Weighted fraction of the view that is glass. */
  glazing: number;
  portrait: boolean;
}
export const roomAmbient = (glazedArea: number, floorArea: number, sky: number, lamps: number): number =>
  Math.min(1, Math.max(0.3, (1.6 * glazedArea) / Math.max(1, floorArea) + 0.25)) * sky + lamps;
/** Lamp light in a room: lumens of its lit lamps over the lumens that make it read daylit, capped. */
export const lampTerm = (lumensInRoom: number, floorArea: number): number => Math.min(1.2, lumensInRoom / (Math.max(1, floorArea) * LAMP_LM_PER_M2));
/** Scene luminance as the eye meters it, relative to the reference room. */
export function meter(m: MeterIn): number {
  return Math.max(NIGHT_FLOOR, roomAmbient(m.glazedArea, m.floorArea, m.sky, m.lamps) + GLAZE_GAIN * m.glazing * (m.portrait ? GLAZE_PORTRAIT : 1) * skyDay(m.sky));
}
/** The EV offset the eyes settle on: partial (a) of the way to a mid-grey scene, clamped. 0 when Off. */
export function targetEV(L: number, mode: WalkAdapt, portrait: boolean): number {
  const a = ADAPT_STRENGTH[mode];
  if (a === 0) return 0;
  const r = portrait ? EV_RANGE_PORTRAIT : EV_RANGE;
  return Math.min(r.hi, Math.max(r.lo, -a * Math.log2(L / L_REF)));
}

// ---- glazing in view ----
type V3 = [number, number, number];
/** A rectangle in world space: a corner, the width edge and the height edge. */
export interface Pane { a: V3; u: V3; v: V3 }
export interface ViewIn { eye: V3; yaw: number; pitch: number; vfovDeg: number; aspect: number }

const dot = (p: V3, q: V3): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];

const GRID_C = 8, GRID_R = 6;
/** Weighted fraction of an 8 x 6 grid of view rays that hit a pane (rays inside the centre ellipse count 3x). */
export function glazingFraction(view: ViewIn, panes: Pane[]): number {
  if (!panes.length) return 0;
  const tanV = Math.tan((view.vfovDeg * Math.PI) / 360);
  const tanH = tanV * view.aspect;
  const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch), cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
  const norms = panes.map((p) => cross(p.u, p.v));
  const uu = panes.map((p) => dot(p.u, p.u));
  const vv = panes.map((p) => dot(p.v, p.v));
  let hit = 0, total = 0;
  for (let c = 0; c < GRID_C; c++) {
    for (let r = 0; r < GRID_R; r++) {
      const x = ((c + 0.5) / GRID_C) * 2 - 1;
      const y = ((r + 0.5) / GRID_R) * 2 - 1;
      // Camera space (y up on screen, so the grid's y runs down), then pitch about X, then yaw about Y.
      let dx = x * tanH, dy = -y * tanV, dz = -1;
      const len = Math.hypot(dx, dy, dz);
      dx /= len; dy /= len; dz /= len;
      const py = dy * cp - dz * sp, pz = dy * sp + dz * cp;
      const d: V3 = [dx * cy + pz * sy, py, -dx * sy + pz * cy];
      const w = (x / 0.6) ** 2 + (y / 0.6) ** 2 <= 1 ? 3 : 1;
      total += w;
      for (let i = 0; i < panes.length; i++) {
        const n = norms[i], pane = panes[i];
        const dn = dot(d, n);
        if (Math.abs(dn) < 1e-9) continue;
        const t = (dot([pane.a[0] - view.eye[0], pane.a[1] - view.eye[1], pane.a[2] - view.eye[2]], n)) / dn;
        if (t <= 0.05) continue;
        const rel: V3 = [view.eye[0] + d[0] * t - pane.a[0], view.eye[1] + d[1] * t - pane.a[1], view.eye[2] + d[2] * t - pane.a[2]];
        const s = dot(rel, pane.u) / uu[i], q = dot(rel, pane.v) / vv[i];
        if (s >= 0 && s <= 1 && q >= 0 && q <= 1) {
          hit += w;
          break;
        }
      }
    }
  }
  return hit / total;
}
/** World panes for a room's glazing: a = centre - dir*width/2 at y = baseY + sill; u = dir*width (plan x -> world x, plan y -> world z); v = (0, head - sill, 0). */
export function panesOf(glazing: NavGlazing[], baseY: number): Pane[] {
  return glazing.map((g) => ({
    a: [g.centre.x - (g.dir.x * g.width) / 2, baseY + g.sill, g.centre.y - (g.dir.y * g.width) / 2],
    u: [g.dir.x * g.width, 0, g.dir.y * g.width],
    v: [0, g.head - g.sill, 0],
  }));
}

// ---- easing ----
export interface Exposure { ev: number; target: number; /** s since the last meter */ since: number }
export const EXPOSURE_START: Exposure = { ev: 0, target: 0, since: Infinity };
/** One frame: ease ev toward target. `next` is a fresh target (null when not metered this frame); `snap` jumps straight there. */
export function easeExposure(e: Exposure, next: number | null, dt: number, snap: boolean): Exposure {
  let { ev, target } = e;
  if (next !== null && (snap || Math.abs(next - target) > DEAD_BAND)) target = next;
  if (snap) ev = target;
  else {
    const d = target - ev;
    const tau = d < 0 ? TAU_BRIGHTEN : TAU_DARKEN;
    const cap = (d < 0 ? RATE_BRIGHTEN : RATE_DARKEN) * dt;
    const step = Math.max(-cap, Math.min(cap, d * (1 - Math.exp(-dt / tau))));
    ev += step;
    if (Math.abs(target - ev) < 1e-4) ev = target;
  }
  return { ev, target, since: next !== null ? 0 : e.since + dt };
}
export const exposureBusy = (e: Exposure): boolean => Math.abs(e.ev - e.target) > CONVERGED;
export const exposureFactor = (ev: number): number => Math.pow(2, ev);
