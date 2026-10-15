import type { Floor, HouseModel, StairsDir } from "../types";
import { toWorld, type V2 } from "./geometry";

/**
 * The treads of a flight: a straight run, optionally with three kite winders
 * at the foot so the bottom steps are entered from the side (a quarter turn).
 * Plain plan geometry shared by the 3D stairs, the stairwell and the plan drawings.
 */

/** A flight on the plan, world metres. `turn` is the side the winders are entered from: +1 right, -1 left (facing up the flight), 0 straight. */
export interface FlightShape {
  centre: V2;
  /** Unit plan direction the flight rises in. */
  dir: V2;
  run: number;
  width: number;
  rise: number;
  turn: -1 | 0 | 1;
}

export interface Tread {
  /** Outline on the plan, world metres. */
  pts: V2[];
  /** Height of the tread's top above the foot of the flight, metres. */
  top: number;
}

/** Going of the straight treads, metres. Straight flights keep their older, coarser steps. */
const GOING = 0.22;
/** Kite winders in a quarter turn. */
export const WINDERS = 3;

/** Number of treads (and risers) in the flight; the last tread is the floor above. */
export function treadCount(f: Pick<FlightShape, "run" | "width" | "turn">): number {
  if (!f.turn) return Math.max(6, Math.round(f.run / 0.25));
  return WINDERS + Math.max(3, Math.round((f.run - f.width) / GOING));
}

/** Plan point at s up the run from the foot and l across it (+l is to the right going up). */
export function flightAt(f: Pick<FlightShape, "centre" | "dir" | "run">, s: number, l: number): V2 {
  const u = s - f.run / 2;
  return { x: f.centre.x + f.dir.x * u - f.dir.y * l, y: f.centre.y + f.dir.y * u + f.dir.x * l };
}

/** Kite winder outlines in (s, l), entered across the l = turn·w/2 side and fanning round the corner where that side meets the straight run. */
function winders(w: number, turn: 1 | -1): [number, number][][] {
  const t = Math.tan(Math.PI / 6); // 30 degrees
  const P: [number, number] = [w, (turn * w) / 2];
  const a: [number, number] = [0, (turn * w) / 2];
  const b: [number, number] = [0, turn * (w / 2 - w * t)];
  const c: [number, number] = [0, (-turn * w) / 2];
  const d: [number, number] = [w - w * t, (-turn * w) / 2];
  const e: [number, number] = [w, (-turn * w) / 2];
  return [
    [P, a, b],
    [P, b, c, d],
    [P, d, e],
  ];
}

export function stairTreads(f: FlightShape): Tread[] {
  const n = treadCount(f);
  const riser = f.rise / n;
  const at = (s: number, l: number) => flightAt(f, s, l);
  const out: Tread[] = [];
  const start = f.turn ? f.width : 0;
  if (f.turn) winders(f.width, f.turn).forEach((poly, k) => out.push({ pts: poly.map(([s, l]) => at(s, l)), top: (k + 1) * riser }));
  const straight = n - (f.turn ? WINDERS : 0);
  const going = (f.run - start) / straight;
  const hw = f.width / 2;
  for (let j = 0; j < straight; j++) {
    const s0 = start + j * going;
    const s1 = s0 + going;
    out.push({ pts: [at(s0, -hw), at(s1, -hw), at(s1, hw), at(s0, hw)], top: (out.length + 1) * riser });
  }
  return out;
}

/**
 * Height of the stairs' pitch line under a point s up the run and l across
 * it: a smooth ramp through the treads, turning with the winders at a turned
 * foot.
 */
export function stairHeight(f: Pick<FlightShape, "run" | "width" | "rise" | "turn">, s: number, l: number): number {
  const sc = Math.max(0, Math.min(f.run, s));
  if (!f.turn) return (sc / f.run) * f.rise;
  const riser = f.rise / treadCount(f);
  const w = f.width;
  const low = WINDERS * riser;
  if (sc >= w) return low + ((sc - w) / Math.max(1e-6, f.run - w)) * (f.rise - low);
  // Round the corner: 0 along the side you step on from, the winders' full height where the straight run starts.
  const phi = Math.atan2(-(l * f.turn - w / 2), w - sc);
  return (Math.max(0, Math.min(Math.PI / 2, phi)) / (Math.PI / 2)) * low;
}

/** Plan direction each StairsDir rises in (+y is world +z, the bottom of the plan). */
export const STAIRS_VECTOR: Record<StairsDir, V2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** The flight of a floor that has stairs, in world metres (rise from the model's storey height). */
export function floorFlight(model: HouseModel, floor: Floor): FlightShape | null {
  if (!floor.stairs) return null;
  return {
    centre: toWorld(floor, floor.stairs),
    dir: STAIRS_VECTOR[floor.stairsDir ?? "up"],
    run: floor.stairsLen ?? 2.6,
    width: floor.stairsWidth ?? 0.9,
    rise: model.ceilingHeight + model.slabThickness,
    turn: floor.stairsTurn === "left" ? -1 : floor.stairsTurn === "right" ? 1 : 0,
  };
}

/** A flight between two floors. */
export interface Flight extends FlightShape {
  lowerId: string;
  upperId: string;
  /** Distance up the run where the treads come within `headroom` of the ceiling: the stairwell starts here. */
  wellStart: number;
}

/** Every flight in the model: a floor with stairs and a floor one level above it. */
export function stairFlights(model: HouseModel, headroom: number): Flight[] {
  const out: Flight[] = [];
  for (const f of model.floors) {
    const upper = model.floors.find((u) => u.level === f.level + 1);
    const shape = upper && floorFlight(model, f);
    if (!upper || !shape) continue;
    // First point up the centre line where the treads are too close to the ceiling.
    let s = 0;
    while (s < shape.run * 0.9 && stairHeight(shape, s, 0) < model.ceilingHeight - headroom) s += 0.01;
    out.push({ ...shape, lowerId: f.id, upperId: upper.id, wellStart: s });
  }
  return out;
}

/** Metres up a flight's run from its foot. */
export function flightS(f: Pick<FlightShape, "centre" | "dir" | "run">, x: number, y: number): number {
  return (x - f.centre.x) * f.dir.x + (y - f.centre.y) * f.dir.y + f.run / 2;
}

/** Metres across a flight from its centre line (+ to the right going up). */
export function flightL(f: Pick<FlightShape, "centre" | "dir">, x: number, y: number): number {
  return (y - f.centre.y) * f.dir.x - (x - f.centre.x) * f.dir.y;
}
