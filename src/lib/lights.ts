import type { Fixture, Floor, HouseModel, LightWarmth } from "../types";
import { byId, gridOf, type CatalogueItem, type GridLayout, type Symbol } from "./catalogue";
import { pointInPolygon, toWorld } from "./geometry";
import { fixtureBox } from "./planMath";
import { lightGlow } from "./dusk";

/**
 * Interior lighting: which fixtures are lights, whether they are lit, where
 * their bulbs are and how bright. Pure; the 3D view (three/Fixtures.tsx)
 * turns the results into point lights and glowing shades, the sun panel
 * (components/SunControls.tsx) owns the master switch.
 *
 * A light is lit when its own switch is on (`Fixture.on`, absent = on) AND
 * every wall switch that controls it (`Fixture.controls` on a switch, see
 * lib/electrics.ts controllersOf) is on AND the master lets lights be on:
 * "auto" means from dusk in a sun study, "on" always, "off" never.
 */

export type LightsMaster = "auto" | "on" | "off";
export const LIGHTS_MASTERS: LightsMaster[] = ["auto", "on", "off"];
export const LIGHTS_MASTER_LABEL: Record<LightsMaster, string> = { auto: "Auto", on: "On", off: "Off" };
export const LIGHTS_MASTER_TITLE: Record<LightsMaster, string> = {
  auto: "Lights come on at dusk in the sun study",
  on: "Every switched-on light is lit, whatever the time",
  off: "No lights",
};
export const isLightsMaster = (v: unknown): v is LightsMaster => typeof v === "string" && (LIGHTS_MASTERS as string[]).includes(v);
/** The master from the sun state; older saves have none and read as auto. */
export const lightsMaster = (sun: { lights?: LightsMaster }): LightsMaster => sun.lights ?? "auto";

/** In Auto, lights come on once the sun has dropped to this altitude (degrees): the dusk preset's altitude, with a little margin. */
export const LIGHTS_AUTO_ALTITUDE = 3;

/** Whether the master lets lights be lit now. `altitude` null = the sun study is off (daytime). */
export function lightsOn(master: LightsMaster, altitude: number | null): boolean {
  if (master === "on") return true;
  if (master === "off") return false;
  return altitude !== null && altitude <= LIGHTS_AUTO_ALTITUDE;
}

/** The light fitting each light symbol is: where its bulbs are in the fixture's own frame, how bright, and how it throws light. */
export interface LampDef {
  /** Light output in lumens of the whole fitting (an 800 lm bulb is a 60 W equivalent); split evenly over its bulbs. */
  lumens: number;
  /**
   * Bulb centres in the fixture's frame (x right, y up from the base, z towards the front), from its box w, d, h and,
   * for grids, the fixture's layout (gridOf). The 3D view places them with the fixture's position and rotation.
   */
  bulbs: (box: { w: number; d: number; h: number }, grid: GridLayout) => [number, number, number][];
  /** How far the light reaches (metres); beyond it the light is cut off. */
  reach: number;
  /**
   * Throws light downwards in a cone (a spot light aimed at the floor) rather than all round: half-angle in radians
   * and penumbra 0-1. Ceiling fittings use this so their light stays on their own storey.
   */
  spot?: { angle: number; penumbra: number };
  /** `lumens` is each bulb's rather than the whole fitting's (a downlight grid: every downlight is a full one). */
  perBulb?: boolean;
  /** Fixed light colour (lit mirrors); absent means the fixture's warmth decides. */
  color?: string;
}

const COOL_WHITE = "#eef3ff";
const one = (p: [number, number, number]): [number, number, number][] => [p];
const DEG = Math.PI / 180;

/** Downlights across and down a w × d grid: a set count where given, else as many as `pitch` fits, at least one each way. */
export function gridCounts(w: number, d: number, grid: GridLayout): { cols: number; rows: number } {
  return { cols: grid.cols ?? Math.max(1, Math.round(w / grid.pitch)), rows: grid.rows ?? Math.max(1, Math.round(d / grid.pitch)) };
}

/** Downlight centres over a w × d area, spread evenly (gridCounts), in the fixture's frame at height y. */
export function gridPoints(w: number, d: number, grid: GridLayout | number, y: number): [number, number, number][] {
  const { cols, rows } = gridCounts(w, d, typeof grid === "number" ? { pitch: grid } : grid);
  const out: [number, number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([((c + 0.5) / cols - 0.5) * w, y, ((r + 0.5) / rows - 0.5) * d]);
  return out;
}

/** Light fittings by catalogue symbol. Every symbol here is a light; any other fixture is not. */
export const LAMPS: Partial<Record<Symbol, LampDef>> = {
  // Lamps: a point of light inside the shade.
  // Shade bottom to top is the last 0.33 m of a floor lamp; the bulb sits in the lower half of the shade.
  "floor-lamp": { lumens: 800, reach: 6, bulbs: ({ h }) => one([0, h - 0.2, 0]) },
  // Table lamps: the shade is min(0.28, 0.45 h) tall at the top of the lamp (see three/Fixtures.tsx).
  "table-lamp": { lumens: 470, reach: 4.5, bulbs: ({ h }) => one([0, h - Math.min(0.28, h * 0.45) / 2, 0]) },
  // The head looks down from near the front; the bulb is just under it.
  "desk-lamp": { lumens: 400, reach: 3, spot: { angle: 50 * DEG, penumbra: 0.5 }, bulbs: ({ d, h }) => one([0, h - 0.11, d / 2 - d * 0.2]) },
  // Edge-lit mirror: a soft cool glow from the whole face.
  "mirror-lit": { lumens: 600, reach: 3, color: COOL_WHITE, bulbs: ({ d, h }) => one([0, h / 2, d / 2 + 0.05]) },
  // Ceiling fittings: cones aimed at the floor, wide for shaded pendants and diffusers, tight for spots.
  pendant: { lumens: 800, reach: 6, spot: { angle: 75 * DEG, penumbra: 0.6 }, bulbs: ({ h }) => one([0, h * 0.4, 0]) },
  "pendant-multi": { lumens: 1200, reach: 4, spot: { angle: 60 * DEG, penumbra: 0.6 }, bulbs: ({ w, h }) => [-w / 3, 0, w / 3].map((x) => [x, h * 0.4, 0] as [number, number, number]) },
  "flush-light": { lumens: 1200, reach: 6, spot: { angle: 80 * DEG, penumbra: 0.7 }, bulbs: ({ h }) => one([0, h * 0.5, 0]) },
  downlight: { lumens: 450, reach: 4, spot: { angle: 35 * DEG, penumbra: 0.5 }, bulbs: () => one([0, 0, 0]) },
  "downlight-grid": { lumens: 450, perBulb: true, reach: 4, spot: { angle: 35 * DEG, penumbra: 0.5 }, bulbs: ({ w, d }, grid) => gridPoints(w, d, grid, 0) },
  "spot-bar": { lumens: 1050, reach: 4.5, spot: { angle: 30 * DEG, penumbra: 0.4 }, bulbs: ({ w }) => [-w / 3, 0, w / 3].map((x) => [x, 0.04, 0] as [number, number, number]) },
  // Wall fittings: an up-and-down washer on the wall, and a strip under a wall unit lighting the worktop.
  "wall-light": { lumens: 500, reach: 3.5, bulbs: ({ d, h }) => one([0, h / 2, d / 2]) },
  "strip-light": { lumens: 400, reach: 2, spot: { angle: 70 * DEG, penumbra: 0.8 }, bulbs: ({ w }) => gridPoints(w, 0, 0.3, 0) },
};

/** Colour temperatures offered, and the light colour of each (sRGB, roughly a blackbody at that temperature). */
export const WARMTHS: LightWarmth[] = [2700, 3000, 4000];
export const WARMTH_LABEL: Record<LightWarmth, string> = { 2700: "Warm (2700K)", 3000: "Soft (3000K)", 4000: "Cool (4000K)" };
export const WARMTH_COLOR: Record<LightWarmth, string> = { 2700: "#ffd9a8", 3000: "#ffe3c0", 4000: "#f6f2e6" };
export const DEFAULT_WARMTH: LightWarmth = 2700;
export const warmthOf = (fx: Pick<Fixture, "warmth">): LightWarmth => (fx.warmth && WARMTHS.includes(fx.warmth) ? fx.warmth : DEFAULT_WARMTH);
/** Dimmer setting as a 0-1 factor (absent = full). */
export const dimOf = (fx: Pick<Fixture, "dim">): number => (fx.dim !== undefined && Number.isFinite(fx.dim) ? Math.min(1, Math.max(0.01, fx.dim / 100)) : 1);
/** The colour a fixture's light is: the fitting's fixed colour, else its warmth. */
export const lightColor = (fx: Pick<Fixture, "warmth">, lamp: Pick<LampDef, "color">): string => lamp.color ?? WARMTH_COLOR[warmthOf(fx)];
/** Grids: a fixture's downlight layout (spacing, and a set count across and down). */
export const lampGrid = (fx: Pick<Fixture, "pitch" | "cols" | "rows">, item: Pick<CatalogueItem, "pitch">): GridLayout => gridOf(fx, item);

export const isLightItem = (item: Pick<CatalogueItem, "symbol">): boolean => item.symbol in LAMPS;
export const lampOf = (item: Pick<CatalogueItem, "symbol">): LampDef | undefined => LAMPS[item.symbol];

/** The fixture's own switch (absent = on). */
export const switchedOn = (fx: Pick<Fixture, "on">): boolean => fx.on !== false;

/**
 * A light fixture that is lit now: its own switch on, every switch that controls it on (`controllers`, from
 * lib/electrics.ts controllersOf; none = no wall switch) and the master allowing it. False for anything that is not a light.
 */
export function fixtureLit(
  fx: Pick<Fixture, "on">,
  item: Pick<CatalogueItem, "symbol">,
  master: LightsMaster,
  altitude: number | null,
  controllers: readonly Pick<Fixture, "on">[] = [],
): boolean {
  return isLightItem(item) && switchedOn(fx) && controllers.every(switchedOn) && lightsOn(master, altitude);
}

/** Glow of a lit lamp's shade in daylight: lit lamps always read as lit, even with the sun up. */
const LIT_DAY_GLOW = 0.5;

/**
 * Emissive strength of a lamp's bulb and shade, 0 to 1: nothing when unlit, and when lit the garden lights' glow
 * curve (full from the horizon down), never below LIT_DAY_GLOW so a forced-on lamp shows by day.
 */
export function lampGlow(lit: boolean, altitude: number | null): number {
  return lit ? Math.max(LIT_DAY_GLOW, lightGlow(altitude)) : 0;
}

/** Point light intensity in candela for a bulb's lumens (an even sphere of light: lm / 4π). */
export const candela = (lumens: number): number => lumens / (4 * Math.PI);

/**
 * How much brighter a cone of half-angle `angle` (radians) is than the same bulb shining all round: 4π over the
 * cone's solid angle, so the light's whole output lands in the cone. 1 with no cone (or a half-angle of π).
 */
export function coneGain(angle?: number): number {
  if (angle === undefined || !Number.isFinite(angle)) return 1;
  const a = Math.min(Math.PI, Math.max(0.05, angle));
  return 2 / (1 - Math.cos(a));
}

/** Rendering quality, as the store's settings name it. */
type Quality = "high" | "balanced" | "low";

/** A light pool: point lights, spot lights, and how many of the spots (the first ones) cast shadows. */
type PoolModel = Pick<HouseModel, "floors" | "ceilingHeight">;

export interface PoolSizes {
  point: number;
  spot: number;
  casters: number;
}

/** The most lights a quality shades: point and spot together, and how many spots cast shadows. */
export interface PoolCap {
  total: number;
  casters: number;
}

/**
 * Most real lights per rendering quality; the rest of the lit lamps only glow. The pool is a fixed number of lights,
 * mounted while any lamp is lit, because three bakes the light counts into every lit material's shader: a pool that
 * never changes size means switching lights on compiles nothing (see three/frameLoop.tsx Precompile). Every slot is
 * shaded on every pixel whether a lamp fills it or not, so the pool is sized to the house (poolFor) and this is only
 * its cap: spots and point lights share it (most ceiling fittings are spots, lamps are points). The nearest `casters`
 * spot lights cast shadows; point lights never do. Measured (software GL, high): a lit frame costs about 3x an
 * unlit one, almost all of it the shadowed spots; 24 lights against 16 is within the noise.
 */
export const POOL: Record<Quality, PoolCap> = {
  high: { total: 24, casters: 4 },
  balanced: { total: 12, casters: 0 },
  low: { total: 8, casters: 0 },
};

/**
 * The pool a house needs: a slot per lamp bulb it has (spot or point), counted over every floor and every light
 * fitting whether switched on or not, so the size changes only when a light fitting is added or removed, never at
 * the switch or when a floor is hidden. Over `cap.total`, each kind gets up to half and the rest goes to whichever
 * still wants it. Returns `prev` itself when the numbers are the same.
 */
export function poolFor(model: PoolModel | PoolModel[], cap: PoolCap, prev: PoolSizes | null = null): PoolSizes {
  // Several models (both layouts): the pool fits whichever needs more of each kind, so switching layouts never
  // changes the light counts baked into the shaders (a layout with no lights against one with 24 would otherwise
  // recompile every lit material on every switch).
  let points = 0;
  let spots = 0;
  for (const m of Array.isArray(model) ? model : [model]) {
    let p = 0, sp = 0;
    for (const f of m.floors) for (const l of floorLamps(f, m.ceilingHeight, 0, () => true)) if (l.spot) sp++; else p++;
    points = Math.max(points, p);
    spots = Math.max(spots, sp);
  }
  const half = Math.ceil(cap.total / 2);
  const spot = Math.min(spots, Math.max(half, cap.total - points));
  const point = Math.min(points, cap.total - spot);
  const next = { point, spot, casters: Math.min(cap.casters, spot) };
  return prev && prev.point === next.point && prev.spot === next.spot && prev.casters === next.casters ? prev : next;
}

/** The `cap` lights nearest to `eye` (world metres, usually the view's focusPoint), nearest first. Ties keep input order. */
export function pickLights<T extends { pos: readonly [number, number, number] }>(lights: T[], eye: readonly [number, number, number], cap: number): T[] {
  if (lights.length <= cap) return lights.slice();
  const d2 = (l: T) => (l.pos[0] - eye[0]) ** 2 + (l.pos[1] - eye[1]) ** 2 + (l.pos[2] - eye[2]) ** 2;
  return lights
    .map((l, i) => ({ l, i, d: d2(l) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, Math.max(0, cap))
    .map((x) => x.l);
}

/** Which lamp each pool slot holds (lamp id, or null for an empty slot). Spot slots [0, casters) are the shadow casters. */
export interface Slots {
  point: (string | null)[];
  spot: (string | null)[];
}

/**
 * Fills the pool's slots with the lamps nearest to `eye` (the nearest `sizes.point` point lights, the nearest
 * `sizes.spot` spot lights, the nearest `sizes.casters` of those casting). A lamp that stays picked keeps its slot, so
 * orbiting moves no light that does not have to move; only a spot that gains or loses shadow casting changes slot.
 * Returns `prev` itself when nothing changed.
 */
export function assignSlots(prev: Slots | null, lamps: LampLight[], eye: readonly [number, number, number], sizes: PoolSizes): Slots {
  const sp = pickLights(lamps.filter((l) => l.spot), eye, sizes.spot).map((l) => l.id);
  const pts = pickLights(lamps.filter((l) => !l.spot), eye, sizes.point).map((l) => l.id);
  const casters = Math.min(sizes.casters, sizes.spot);
  const base = prev && prev.point.length === sizes.point && prev.spot.length === sizes.spot ? prev : null;
  const point = pack(base?.point ?? Array(sizes.point).fill(null), 0, sizes.point, pts);
  const spot = pack(pack(base?.spot ?? Array(sizes.spot).fill(null), 0, casters, sp.slice(0, casters)), casters, sizes.spot, sp.slice(casters));
  if (base && point === base.point && spot === base.spot) return base;
  return { point, spot };
}

/** Slots [lo, hi) of `slots` made to hold exactly `wanted` (nearest first): ids already there stay, the rest go to the lowest free slots. Returns `slots` itself if unchanged. */
function pack(slots: (string | null)[], lo: number, hi: number, wanted: string[]): (string | null)[] {
  const keep = new Set(wanted);
  const out = slots.slice();
  const held = new Set<string>();
  for (let i = lo; i < hi; i++) {
    const id = out[i];
    if (id !== null && keep.has(id) && !held.has(id)) held.add(id);
    else out[i] = null;
  }
  let at = lo;
  for (const id of wanted) {
    if (held.has(id)) continue;
    while (at < hi && out[at] !== null) at++;
    if (at >= hi) break;
    out[at] = id;
  }
  return out.every((v, i) => v === slots[i]) ? slots : out;
}

/** Ids of the floor's rooms with a lit light in them (by the fixture's centre), so their windows glow at night. */
export function litRooms(floor: Pick<Floor, "rooms" | "fixtures">, lit: (fx: Fixture) => boolean): Set<string> {
  const out = new Set<string>();
  for (const fx of floor.fixtures ?? []) {
    if (!lit(fx)) continue;
    const room = floor.rooms.find((r) => !out.has(r.id) && pointInPolygon({ x: fx.x, y: fx.y }, r.polygon));
    if (room) out.add(room.id);
  }
  return out;
}

/** A lit light's bulb in the scene: world position (x, y up, z = plan y), colour, candela, reach and, for cones, where it aims. */
export interface LampLight {
  /** Floor, fixture id and bulb index, unique across the house. */
  id: string;
  pos: [number, number, number];
  color: string;
  candela: number;
  reach: number;
  /** Aimed down at the floor as a cone (a spot light), with its half-angle and penumbra; absent = all round. */
  spot?: { angle: number; penumbra: number };
}

/**
 * The bulbs of a light fixture in world space: LAMPS[symbol].bulbs in the fixture's frame, turned by its rotation
 * (plan degrees clockwise, the 3D view's yaw of -rot about +y) and moved to its plan position and height, on a
 * storey whose base is at `baseY`. Empty for anything that is not a light.
 */
export function bulbsWorld(floor: Floor, fx: Fixture, item: CatalogueItem, ceiling: number, baseY: number): [number, number, number][] {
  const lamp = lampOf(item);
  if (!lamp) return [];
  const b = fixtureBox(fx, item, ceiling);
  const t = (-fx.rot * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const p = toWorld(floor, { x: fx.x, y: fx.y });
  return lamp.bulbs(b, lampGrid(fx, item)).map(([lx, ly, lz]) => [p.x + lx * c + lz * s, baseY + b.z0 + ly, p.y - lx * s + lz * c]);
}

/** The first bulb of a light fixture in world space (see bulbsWorld), or null for anything that is not a light. */
export function bulbWorld(floor: Floor, fx: Fixture, item: CatalogueItem, ceiling: number, baseY: number): [number, number, number] | null {
  return bulbsWorld(floor, fx, item, ceiling, baseY)[0] ?? null;
}

/** Bulbs of one fitting closer together than this (metres) share one scene light: a pendant bar's drops, a spot bar's heads, a strip's LEDs; a downlight grid's spots stay their own. */
export const CLUSTER_M = 0.6;
/** A merged cone is widened by the cluster's radius seen from this far below it (metres). */
const CLUSTER_THROW = 1.5;
const MAX_SPOT = 85 * DEG;

/** Groups bulbs greedily: each joins the first cluster whose centre is within `within` of it, else starts one. Returns member indexes. */
export function clusterBulbs(bulbs: readonly (readonly [number, number, number])[], within = CLUSTER_M): number[][] {
  const out: { at: [number, number, number]; members: number[] }[] = [];
  bulbs.forEach((b, i) => {
    const c = out.find((k) => Math.hypot(k.at[0] - b[0], k.at[1] - b[1], k.at[2] - b[2]) <= within + 1e-9);
    if (!c) return out.push({ at: [b[0], b[1], b[2]], members: [i] });
    const n = c.members.push(i);
    for (let a = 0; a < 3; a++) c.at[a] += (b[a] - c.at[a]) / n;
  });
  return out.map((k) => k.members);
}

/**
 * Every lit light on a floor as scene lights, dimmed by the fixture's dimmer (`lit` says which fixtures are lit, see
 * fixtureLit). A fitting's bulbs are one light each, except that bulbs within CLUSTER_M of each other (the drops of a
 * pendant bar, a spot bar's heads, a strip's LEDs) share one light at their centre, with their lumens added and a
 * cone widened to cover them: real lights are few (see POOL), and one per fitting lights a kitchen where one per
 * bulb would run out of slots.
 */
export function floorLamps(floor: Floor, ceiling: number, baseY: number, lit: (fx: Fixture, item: CatalogueItem) => boolean): LampLight[] {
  const out: LampLight[] = [];
  for (const fx of floor.fixtures ?? []) {
    const item = byId(fx.type);
    const lamp = item && lampOf(item);
    if (!item || !lamp || !lit(fx, item)) continue;
    const bulbs = bulbsWorld(floor, fx, item, ceiling, baseY);
    // Each bulb's share of the fitting's light.
    const cd = (candela(lamp.lumens) * dimOf(fx)) / (lamp.perBulb ? 1 : Math.max(1, bulbs.length));
    const color = lightColor(fx, lamp);
    clusterBulbs(bulbs).forEach((members, k) => {
      const pos: [number, number, number] = [0, 0, 0];
      for (const i of members) for (let a = 0; a < 3; a++) pos[a] += bulbs[i][a] / members.length;
      const radius = Math.max(0, ...members.map((i) => Math.hypot(bulbs[i][0] - pos[0], bulbs[i][1] - pos[1], bulbs[i][2] - pos[2])));
      const spot = lamp.spot && (radius > 0 ? { angle: Math.min(MAX_SPOT, lamp.spot.angle + Math.atan(radius / CLUSTER_THROW)), penumbra: lamp.spot.penumbra } : lamp.spot);
      out.push({ id: `${floor.id}:${fx.id}:${k}`, pos, color, candela: cd * members.length, reach: lamp.reach, spot });
    });
  }
  return out;
}

/** Height (metres above a floor's base) the view is taken to be looking at, for picking the lights that matter: about lamp height. */
export const FOCUS_Y = 1.2;

/**
 * Where the view is looking: the point on the plane y = `y` along the view from `eye` in direction `dir` (a unit
 * vector), between 1 and 60 m out, or 10 m along the view when it does not look down at that plane. Lights are
 * picked by their distance from this point, not from the eye: seen from above, the eye is nearest to upstairs and
 * ceiling lights everywhere, while the room in the middle of the screen is what should be lit.
 */
export function focusPoint(eye: readonly [number, number, number], dir: readonly [number, number, number], y = FOCUS_Y): [number, number, number] {
  const t = dir[1] < -0.05 ? (y - eye[1]) / dir[1] : NaN;
  const d = Number.isFinite(t) ? Math.min(60, Math.max(1, t)) : 10;
  return [eye[0] + dir[0] * d, eye[1] + dir[1] * d, eye[2] + dir[2] * d];
}
