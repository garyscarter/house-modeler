import type { Opening, OpeningKind } from "../types";
import type { V2 } from "./geometry";
import { effectiveOpenDeg } from "./openings";

/** Walk-through: shared types and the few rules every walk chunk relies on (docs/walkthrough-plan.md). */

// ---- eye height (persisted as settings.eyeHeight) ----
export const EYE_HEIGHT = { min: 1.0, max: 2.0, step: 0.05, default: 1.6 } as const;
export function eyeHeightOf(settings: { eyeHeight?: number }): number {
  const v = settings.eyeHeight;
  return typeof v === "number" && Number.isFinite(v) ? Math.min(EYE_HEIGHT.max, Math.max(EYE_HEIGHT.min, v)) : EYE_HEIGHT.default;
}

// ---- facing ----
/** Largest look up or down, radians. */
export const PITCH_MAX = 1.35;
/**
 * Plan direction (world x, world z) of a yaw. Yaw 0 looks along -z (towards the back of the house) and grows
 * turning left, seen from above: the same as a three.js camera with rotation.order "YXZ", rotation.y = yaw.
 */
export const forwardOf = (yaw: number): V2 => ({ x: -Math.sin(yaw), y: -Math.cos(yaw) });
/** The yaw that looks along a plan direction. */
export const yawOf = (d: V2): number => Math.atan2(-d.x, -d.y);

// ---- where the walker is ----
export interface WalkPose {
  /** Plan position, metres: world x and world z. */
  x: number;
  y: number;
  /** The storey stood on; on a flight, the lower one until past half way up. */
  level: number;
  /** Index into NavWorld.flights while on the stairs, else null. */
  stair: number | null;
  /** World height of the feet: a floor, the stairs' pitch line, or the garden. */
  feetY: number;
  yaw: number;
  /** + looks up; within ±PITCH_MAX. */
  pitch: number;
}
export interface WalkPoint {
  x: number;
  y: number;
  level: number;
  stair: number | null;
}
/** A route from where you stand: waypoints (the goal last), the doors it passes (index = first point beyond the door), and the way to face on arrival. */
export interface WalkRoute {
  points: WalkPoint[];
  doors: { key: string; index: number }[];
  yaw?: number;
}
export type RouteResult =
  | { ok: true; route: WalkRoute }
  /** Only a shut door is in the way: `door` is the first one, `route` the way through it with every door open. */
  | { ok: false; reason: "shut-door"; door: string; route: WalkRoute }
  | { ok: false; reason: "unreachable" };

export type WalkStart = { kind: "front" } | { kind: "room"; level: number; roomId: string; at?: V2 };
export type WalkGoal = { kind: "room"; level: number; roomId: string } | { kind: "point"; level: number; at: V2 };
/** A raycast hit in world coordinates (y up). */
export interface WalkHit {
  x: number;
  y: number;
  z: number;
}
/** One stop of the guided tour: a room (roomId null = the garden), where to stand and which way to look. */
export interface TourStop {
  roomId: string | null;
  name: string;
  level: number;
  at: V2;
  yaw: number;
}
export interface TourState {
  status: "off" | "playing" | "paused";
  stops: TourStop[];
  index: number;
  phase: "walking" | "looking";
}

// ---- doors ----
/** Door open (true) or shut, by doorKey. */
export type DoorStates = Record<string, boolean>;
/** "open": always passable (gap, archway); "door": opens and shuts with a tap; "shut": never passable (window, bay, garage). */
export type Passage = "open" | "door" | "shut";
export function passageOf(kind: OpeningKind): Passage {
  switch (kind) {
    case "gap":
    case "archway":
      return "open";
    case "door":
    case "front":
    case "french":
    case "patio":
    case "bifold":
      return "door";
    default:
      return "shut";
  }
}
export const doorKey = (floorId: string, openingId: string): string => `${floorId}:${openingId}`;
export type DoorMotion = "swing" | "slide" | "fold";
export const motionOf = (kind: OpeningKind): DoorMotion => (kind === "patio" ? "slide" : kind === "bifold" ? "fold" : "swing");

/** Whether the scene draws this door open (the View "Doors open" switch and the opening's openDeg), so a walk starts with what you saw. */
export function initiallyOpen(op: Pick<Opening, "kind" | "openDeg">, doorsOpen: boolean): boolean {
  switch (op.kind) {
    case "door":
      return effectiveOpenDeg(op, 75, doorsOpen) > 0;
    case "french":
      return effectiveOpenDeg(op, 80, doorsOpen) > 0;
    case "front":
      return effectiveOpenDeg(op, 0, doorsOpen) > 0;
    case "bifold":
      return doorsOpen;
    case "patio":
      return false;
    default:
      return passageOf(op.kind) === "open";
  }
}
export function doorOpen(doors: DoorStates, key: string, op: Pick<Opening, "kind" | "openDeg">, doorsOpen: boolean): boolean {
  return doors[key] ?? initiallyOpen(op, doorsOpen);
}
/** How far a swing leaf opens on a walk, degrees: its own openDeg when set above 0, else the kind's usual angle. */
export const OPEN_DEG: Partial<Record<OpeningKind, number>> = { door: 75, french: 80, front: 80 };
export function openTargetDeg(op: Pick<Opening, "kind" | "openDeg">): number {
  return op.openDeg && op.openDeg > 0 ? Math.min(180, op.openDeg) : OPEN_DEG[op.kind] ?? 75;
}
/**
 * Patio doors: panel count (as lib/openings draws them), which panel slides (the right-hand one seen from +z,
 * the left with flipHinge), and the stretch it uncovers, metres along the wall from the opening's centre.
 */
export function patioSlider(width: number, flipHinge?: boolean): { n: number; index: number; span: [number, number] } {
  const n = width > 3.2 ? 3 : 2;
  const index = flipHinge ? 0 : n - 1;
  const lw = width - 0.12;
  return { n, index, span: [-lw / 2 + (index * lw) / n, -lw / 2 + ((index + 1) * lw) / n] };
}

// ---- the walkable world (built by lib/walk.ts buildNav; only `internal` is private to it) ----
export interface NavRoom {
  id: string;
  name: string;
  /** World plan polygon. */
  poly: V2[];
  area: number;
}
export interface NavLevel {
  level: number;
  floorId: string;
  /** World Y of the finished floor. */
  baseY: number;
  rooms: NavRoom[];
}
export interface NavFlight {
  lowerLevel: number;
  upperLevel: number;
  /** Free spots just off the foot and the head of the flight. */
  footStand: V2;
  headStand: V2;
}
export interface NavDoor {
  key: string;
  floorId: string;
  openingId: string;
  level: number;
  kind: OpeningKind;
  passage: Passage;
  initial: boolean;
  /** Opening centre and wall direction, plan metres. */
  centre: V2;
  dir: V2;
  width: number;
  /** Part of the opening passable when open, metres along dir from centre (a patio's slider, a front door without its side lights). */
  span: [number, number];
}
export interface NavWorld {
  levels: NavLevel[];
  flights: NavFlight[];
  doors: NavDoor[];
  /** Plot boundary (or a box round the house when there is no plot). */
  plot: V2[] | null;
  /** Chunk B's grids and obstacles; nobody else reads this. */
  internal: unknown;
}
