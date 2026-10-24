import type { Pt } from "../types";
import type { Cam, Size } from "./planMath";

/**
 * Pure helpers behind the shared editor core (src/editor/core). No React, no DOM.
 * Models are generic 2D frames: the plan's image px or the site's metres. Both have y down the screen.
 */

/** A press and release closer than this (screen px) is a tap, not a drag. */
export const CLICK_SLOP_PX = 6;
/** A touch or pen press held this long without moving more than LONG_PRESS_SLOP_PX is a long press (the touch right-click). */
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP_PX = 8;
/** Two presses on the same key within this many ms and DOUBLE_PRESS_PX make a double press. */
export const DOUBLE_PRESS_MS = 400;
export const DOUBLE_PRESS_PX = 6;
/** A wheel burst commits its camera after this much quiet (equal to wheelGesture's STICKY_MS). */
export const WHEEL_COMMIT_MS = 150;
/** Zoom step for buttons and keys. */
export const ZOOM_STEP = 1.4;

/** The model <-> screen adapter, built from the camera on every call. */
export interface Frame {
  /** Model units per screen px (cam.s). */
  unitsPerPx: number;
  /** Model units per metre: plan floor.pxPerM; site 1. */
  unitsPerM: number;
  /** Model point to element-local screen px. */
  toScreen(p: Pt): Pt;
  /** Client px to model point. */
  fromClient(c: { clientX: number; clientY: number }): Pt;
}

/** Whether a press may still become a long press: a finger or pen (not a mouse), alone on the screen, within the slop. */
export const canLongPress = (pointerType: string, pointerCount: number, from: Pt, to: Pt): boolean =>
  pointerType !== "mouse" && pointerCount === 1 && !pastSlop(from, to, LONG_PRESS_SLOP_PX);
/** True once b is at least `slop` screen px from a. */
export const pastSlop = (a: Pt, b: Pt, slop = CLICK_SLOP_PX) => Math.hypot(b.x - a.x, b.y - a.y) >= slop;

/** One primary press: what was pressed (a key), when (ms, e.timeStamp) and where (client px). */
export interface PressRecord {
  key: string;
  at: number;
  x: number;
  y: number;
}

/** Whether `next` is the second press of a double press after `last`. */
export function isDoublePress(last: PressRecord | null, next: PressRecord, ms = DOUBLE_PRESS_MS, px = DOUBLE_PRESS_PX): boolean {
  if (!last || last.key !== next.key) return false;
  const dt = next.at - last.at;
  if (dt < 0 || dt > ms) return false;
  return Math.hypot(next.x - last.x, next.y - last.y) <= px;
}

const num = (n: number) => String(Math.round(n * 1e6) / 1e6);

/**
 * The transform for the layer `<g>` that maps the committed camera c0 to the live camera c1:
 * "matrix(k 0 0 k tx ty)" with k = s0 / s1 and t = (x0 - k * x1, y0 - k * y1). "" when they are equal.
 */
export function liveTransform(committed: Cam, live: Cam): string {
  if (committed.x === live.x && committed.y === live.y && committed.s === live.s) return "";
  const k = committed.s / live.s;
  return `matrix(${num(k)} 0 0 ${num(k)} ${num(committed.x - k * live.x)} ${num(committed.y - k * live.y)})`;
}

/** Clamp the scale to [minS, maxS], keeping the model point under element-local screen point `about` where it was. */
export function clampScale(c: Cam, minS: number, maxS: number, about: Pt): Cam {
  const s = Math.max(minS, Math.min(maxS, c.s));
  if (s === c.s) return c;
  const px = c.x + about.x * c.s;
  const py = c.y + about.y * c.s;
  return { x: px - about.x * s, y: py - about.y * s, s };
}

/**
 * The camera after the element changes size. "topLeft" keeps the top-left model point (the plan); "centre" keeps
 * the model point at the centre (the site).
 */
export function resizeCam(c: Cam, from: Size, to: Size, anchor: "topLeft" | "centre"): Cam {
  if (anchor === "topLeft") return c;
  const cx = c.x + (from.w * c.s) / 2;
  const cy = c.y + (from.h * c.s) / 2;
  return { x: cx - (to.w * c.s) / 2, y: cy - (to.h * c.s) / 2, s: c.s };
}

/** Wheel delta to a zoom factor (> 1 zooms in). Trackpad pinches arrive as ctrl+wheel with small deltas, so they get more punch. */
export const wheelZoomFactor = (dy: number, ctrl: boolean) => Math.exp(-dy * (ctrl ? 0.01 : 0.0015));

/** A Frame for a camera on an element whose top-left is at `rect` (client px). */
export function frameOf(cam: Cam, rect: { left: number; top: number }, unitsPerM: number): Frame {
  return {
    unitsPerPx: cam.s,
    unitsPerM,
    toScreen: (p) => ({ x: (p.x - cam.x) / cam.s, y: (p.y - cam.y) / cam.s }),
    fromClient: (c) => ({ x: cam.x + (c.clientX - rect.left) * cam.s, y: cam.y + (c.clientY - rect.top) * cam.s }),
  };
}

/** Size of a horizontal dimension chip for its text, in model units (px is model units per screen px). */
export function chipSize(text: string, px: number, fontSize: number): { w: number; h: number } {
  return { w: text.length * fontSize * 0.56 + px * 8, h: fontSize * 1.35 };
}

/** Midpoint and spread of two pointers (client px). The spread is never 0, so it is safe to divide by. */
export function pinchOf(a: Pt, b: Pt): { m: Pt; d: number } {
  return { m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
}

/**
 * The drag state machine, as a pure reducer so the hook around it (useDrag) only has to carry out effects.
 * idle -> pressed (captured) -> moving (slop crossed) -> idle. Events from another pointer are ignored.
 */
export type DragPhase =
  | { tag: "idle" }
  | { tag: "pressed"; pointerId: number; origin: Pt; slop: number }
  | { tag: "moving"; pointerId: number };

export type DragEvent =
  | { type: "press"; pointerId: number; client: Pt; slop: number }
  | { type: "move"; pointerId: number; client: Pt }
  | { type: "up"; pointerId: number }
  /** pointercancel or lostpointercapture: ends the drag and keeps the changes. */
  | { type: "lost"; pointerId: number }
  /** Esc, blur, a second pointer, a mode change, unmount: puts everything back. */
  | { type: "cancel" };

/**
 * What the hook must do, in order. "flush" applies the newest pending move at once; "restore" puts the snapshot
 * back; "finish" releases capture and the undo hold and forgets the drag; "cancelled" calls the spec's hook.
 */
export type DragEffect = "start" | "move" | "flush" | "end" | "tap" | "restore" | "finish" | "cancelled";

export const IDLE: DragPhase = { tag: "idle" };

export function reduceDrag(phase: DragPhase, ev: DragEvent): { phase: DragPhase; effects: DragEffect[] } {
  const same = (id: number) => phase.tag !== "idle" && phase.pointerId === id;
  switch (ev.type) {
    case "press":
      if (phase.tag !== "idle") return { phase, effects: [] };
      return { phase: { tag: "pressed", pointerId: ev.pointerId, origin: ev.client, slop: ev.slop }, effects: [] };
    case "move":
      if (!same(ev.pointerId)) return { phase, effects: [] };
      if (phase.tag === "pressed") {
        if (!pastSlop(phase.origin, ev.client, phase.slop)) return { phase, effects: [] };
        return { phase: { tag: "moving", pointerId: phase.pointerId }, effects: ["start", "move"] };
      }
      return { phase, effects: ["move"] };
    case "up":
      if (!same(ev.pointerId)) return { phase, effects: [] };
      return { phase: IDLE, effects: phase.tag === "moving" ? ["flush", "end", "finish"] : ["tap", "finish"] };
    case "lost":
      if (!same(ev.pointerId)) return { phase, effects: [] };
      return { phase: IDLE, effects: phase.tag === "moving" ? ["flush", "end", "finish"] : ["finish"] };
    case "cancel":
      if (phase.tag === "idle") return { phase, effects: [] };
      return { phase: IDLE, effects: ["restore", "finish", "cancelled"] };
  }
}
