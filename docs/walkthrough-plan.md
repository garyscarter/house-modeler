# Walkthrough: plan

Status: agreed with the owner and being built (October 2026). The planner was Nancy Sinatra (Opus); the chunks below were built in parallel worktrees.

## What the owner asked

> "I would like a feature of the app to be that we can do a walkthrough in a person's eyes so that you can understand the flow of the property. So opening doors, walking into the room, looking around so that you can understand how the property might flow."

Decisions (one round of questions): doors open with a click or tap and a shut door stops you; tap or click the floor to walk there, drag to look, WASD / arrows too; extras: mini-map, flip layouts on the spot, out into the garden, guided tour; a Walk button in the 3D bar plus "Walk from here" on a room's menu.

I checked everything in your "what I already know" list against the code. It all holds. Corrections and extra facts I found:

- **No long-press menu in 3D today.** `RoomFloor` in House.tsx only opens its menu on right-click (button 2), so touch users have no 3D room menu. Chunk A adds a long-press.
- **The plan already has a room menu.** It is `src/editor/plan/useMenu.ts` → `menuItemsFor`, `t.kind === "room"`, with separate items for Decorate and Build/other modes. The long-press there already works.
- **Space is a peek.** `peekPatch` (src/lib/studio.ts) refuses to peek unless `viewMode` is single or overlay. So the walk forces `viewMode: "single"` and restores it when it ends; Space then needs no new code.
- **Orbit restores itself.** When `Orbit` remounts, its first effect jumps to `lastPose()` from cameraLink.ts, which is the last pose it published. Unmounting Orbit while walking and remounting it afterwards puts the camera back where it was, with no extra code.
- **`openingParts` details.** The leaf's hinge z depends on whether the leaf is open (`ang ? zf + s*FD/2 : zf`). Bi-folds are only shut or open (`bifoldStack(..., shut)`). Patio panels have no open state. The front door's default angle is 0 (drawn shut). The owner's back door has `openDeg: 0`. The front door is in a vertical wall (`"v"`), so it faces ±x, not +z.
- **Ground height.** Outside, feet height is `-GROUND_DROP + groundHeightAt(site, p)` (lib/site.ts, lib/siteItems.ts). Fixture footprints already exist: `fixtureSolids(fixtures, pxPerM, byId)` in lib/planMath.ts (rugs skipped, gives `z0`/`z1`).
- **Shadows.** `ShadowUpdates` (frameLoop.tsx) never redraws the shadow map for a camera-only frame, so walking costs camera frames only. Moving doors need a nudge (`doorsSettled` below).
- **Test fixtures.** Tests can load the real house with `builtInHouse("")`, `builtInProposed("")` and `listingSite()` from src/houses/default.ts, or build small floors with `rect` / `floor` from src/lib/testing.ts.

Split: four chunks, A to D, on disjoint files, plus a foundation you commit first. Commit this spec as **docs/walkthrough-plan.md** in the same foundation commit, so every agent can read it.

---

## 1. Shared foundation (you write this first)

Files:
1. `src/lib/walkTypes.ts`: types and shared rules (full code below).
2. `src/walkStore.ts`: the `useWalk` zustand store. Not persisted, not in undo (full code below).
3. `src/three/walk/doorTag.ts`: how a door leaf in the scene says which door it is (full code below).
4. `src/lib/walk.ts`: Chunk B's public API with stub bodies, so C and D compile now. B replaces the whole file.
5. `src/store.ts`: add one optional field to `Settings`:
   ```ts
   export interface Settings {
     quality: "high" | "balanced" | "low";
     /** Walk-through eye height in metres (1.0–2.0); absent = 1.6. Read it through eyeHeightOf (lib/walkTypes). */
     eyeHeight?: number;
   }
   ```
   No change to migrate.ts and no `PERSIST_VERSION` bump. `settings` is saved and loaded as one object, older saves simply lack the field, and `eyeHeightOf` clamps it and supplies the default.
6. `src/walkStore.test.ts`: small test (below).

### 1a. `src/lib/walkTypes.ts`
```ts
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
```

### 1b. `src/walkStore.ts`
```ts
import { create } from "zustand";
import { useStore } from "./store";
import type { DoorStates, TourState, WalkGoal, WalkPose, WalkRoute, WalkStart } from "./lib/walkTypes";

type Main = ReturnType<typeof useStore.getState>;
/** The view settings a walk changes, saved when it starts and put back when it ends. */
export type WalkUiSnapshot = Pick<Main, "viewMode" | "showCeilings" | "maxLevel" | "sectionHeight" | "showLabels" | "showExterior" | "showSite" | "measureTool">;
/** One view, ceilings on, every floor, no section cut or labels, roofs and garden shown, tape measure off. */
export const WALK_UI: WalkUiSnapshot = { viewMode: "single", showCeilings: true, maxLevel: null, sectionHeight: null, showLabels: false, showExterior: true, showSite: true, measureTool: false };
const snapshot = (m: Main): WalkUiSnapshot => ({
  viewMode: m.viewMode, showCeilings: m.showCeilings, maxLevel: m.maxLevel, sectionHeight: m.sectionHeight,
  showLabels: m.showLabels, showExterior: m.showExterior, showSite: m.showSite, measureTool: m.measureTool,
});

export const TOUR_OFF: TourState = { status: "off", stops: [], index: 0, phase: "walking" };
export interface WalkHint { text: string; id: number; ms: number }
/** What the HUD names: the room you are in (null between rooms), the storey, and whether you are out in the garden. */
export interface WalkWhere { level: number; roomName: string | null; outside: boolean }

export interface WalkState {
  on: boolean;
  /** A start waiting for the 3D view to place the walker (WalkControls takes it). */
  pending: WalkStart | null;
  /** Updated every frame while moving: subscribe transiently (useWalk.subscribe), never select it in render. */
  pose: WalkPose | null;
  doors: DoorStates;
  /** Bumped when a door finishes moving, so the viewer redraws shadows. */
  doorsSettled: number;
  route: WalkRoute | null;
  /** A place asked for from the HUD (mini-map), taken by WalkControls. */
  goal: WalkGoal | null;
  tour: TourState;
  hint: WalkHint | null;
  where: WalkWhere | null;
  showMap: boolean;
  before: WalkUiSnapshot | null;

  requestWalk: (start: WalkStart) => void;
  stopWalk: () => void;
  placed: (pose: WalkPose, doors: DoorStates) => void;
  setPose: (pose: WalkPose) => void;
  /** Add doors not seen yet (a layout flip, an edit); doors already set keep their state. */
  mergeDoors: (doors: DoorStates) => void;
  toggleDoor: (key: string, initial: boolean) => void;
  setDoor: (key: string, open: boolean) => void;
  doorSettled: () => void;
  setRoute: (route: WalkRoute | null) => void;
  requestGoal: (goal: WalkGoal) => void;
  takeGoal: () => WalkGoal | null;
  playTour: () => void;
  pauseTour: () => void;
  stopTour: () => void;
  setTour: (patch: Partial<TourState>) => void;
  say: (text: string, ms?: number) => void;
  clearHint: () => void;
  setWhere: (where: WalkWhere | null) => void;
  setShowMap: (show: boolean) => void;
  /** Swap As listed and Proposed where you stand (the Flip button; holding Space peeks as everywhere else). */
  flipLayout: () => void;
}

let hintId = 0;
const sameWhere = (a: WalkWhere | null, b: WalkWhere | null) => a === b || (!!a && !!b && a.level === b.level && a.roomName === b.roomName && a.outside === b.outside);
const CLEAR = { pending: null, pose: null, doors: {}, route: null, goal: null, tour: TOUR_OFF, hint: null, where: null } as const;

export const useWalk = create<WalkState>()((set, get) => ({
  on: false, ...CLEAR, doorsSettled: 0, showMap: true, before: null,
  requestWalk: (start) => {
    const main = useStore.getState();
    const before = get().before ?? snapshot(main);
    if (main.peek) main.setPeek(false);
    main.setUi({ ...WALK_UI, tab: "3d" });
    set({ on: true, ...CLEAR, pending: start, before });
  },
  stopWalk: () => {
    const { on, before } = get();
    if (!on) return;
    set({ on: false, ...CLEAR, before: null });
    if (before) useStore.getState().setUi(before);
  },
  placed: (pose, doors) => set({ pending: null, pose, doors }),
  setPose: (pose) => set({ pose }),
  mergeDoors: (doors) => set((s) => ({ doors: { ...doors, ...s.doors } })),
  toggleDoor: (key, initial) => set((s) => ({ doors: { ...s.doors, [key]: !(s.doors[key] ?? initial) } })),
  setDoor: (key, open) => set((s) => ({ doors: { ...s.doors, [key]: open } })),
  doorSettled: () => set((s) => ({ doorsSettled: s.doorsSettled + 1 })),
  setRoute: (route) => set({ route }),
  requestGoal: (goal) => set({ goal }),
  takeGoal: () => {
    const g = get().goal;
    if (g) set({ goal: null });
    return g;
  },
  playTour: () => set((s) => ({ tour: s.tour.status === "off" ? { ...TOUR_OFF, status: "playing" } : { ...s.tour, status: "playing" } })),
  pauseTour: () => set((s) => (s.tour.status === "playing" ? { tour: { ...s.tour, status: "paused" } } : s)),
  stopTour: () => set({ tour: TOUR_OFF }),
  setTour: (patch) => set((s) => ({ tour: { ...s.tour, ...patch } })),
  say: (text, ms = 3500) => set({ hint: { text, id: ++hintId, ms } }),
  clearHint: () => set({ hint: null }),
  setWhere: (where) => set((s) => (sameWhere(s.where, where) ? s : { where })),
  setShowMap: (showMap) => set({ showMap }),
  flipLayout: () => {
    const m = useStore.getState();
    if (m.peek) return;
    const other = m.activeVariant === "current" ? "proposed" : "current";
    if (m.variants[other]) m.setUi({ activeVariant: other });
  },
}));

if (import.meta.env?.DEV && typeof window !== "undefined") Object.assign(window, { __walkStore: useWalk });
```

### 1c. `src/three/walk/doorTag.ts`
```ts
import type { Object3D } from "three";
/** userData key on a door's leaf group: which door it is and how it started, so a tap on it can open or shut it. */
export const DOOR_TAG = "walkDoor";
export interface DoorTag { key: string; initial: boolean }
export function doorTagOf(o: Object3D | null): DoorTag | null {
  for (; o; o = o.parent) {
    const t = o.userData?.[DOOR_TAG] as DoorTag | undefined;
    if (t) return t;
  }
  return null;
}
```

### 1d. `src/lib/walk.ts` (stub; Chunk B replaces it)
These are the public signatures C and D build against. The bodies are trivial: no collision, routes in a straight line.
```ts
import type { HouseModel, Site } from "../types";
import { areaOf, pointInPolygon, polygonCentroid, roomWorldPolygon, type V2 } from "./geometry";
import type { DoorStates, NavWorld, RouteResult, TourStop, WalkGoal, WalkHit, WalkPoint, WalkPose, WalkStart } from "./walkTypes";

/** STUB (foundation). Chunk B replaces this file; keep every exported name and signature. */
export const WALKER_R = 0.25;
export const MAX_STEP = 0.3;
const base = (m: HouseModel, level: number) => level * (m.ceilingHeight + m.slabThickness);

export function buildNav(model: HouseModel, site: Site | undefined, doorsOpen: boolean): NavWorld {
  void doorsOpen;
  const levels = model.floors.map((f) => ({
    level: f.level, floorId: f.id, baseY: base(model, f.level),
    rooms: f.rooms.map((r) => { const poly = roomWorldPolygon(f, r); return { id: r.id, name: r.name, poly, area: areaOf(poly) }; }),
  }));
  return { levels, flights: [], doors: [], plot: site?.boundary ?? null, internal: null };
}
export function initialDoors(nav: NavWorld): DoorStates {
  return Object.fromEntries(nav.doors.map((d) => [d.key, d.initial]));
}
export function startPose(nav: NavWorld, start: WalkStart): WalkPose {
  const lv = nav.levels.find((l) => l.level === (start.kind === "room" ? start.level : 0)) ?? nav.levels[0];
  const room = start.kind === "room" ? lv.rooms.find((r) => r.id === start.roomId) : undefined;
  const pts = lv.rooms.flatMap((r) => r.poly);
  const at = start.kind === "room" && start.at ? start.at : room ? polygonCentroid(room.poly)
    : { x: pts.reduce((s, p) => s + p.x, 0) / Math.max(1, pts.length), y: Math.max(...pts.map((p) => p.y)) + 2 };
  return { x: at.x, y: at.y, level: lv.level, stair: null, feetY: lv.baseY, yaw: 0, pitch: 0 };
}
export function stepWalker(nav: NavWorld, pose: WalkPose, dx: number, dy: number, doors: DoorStates): WalkPose {
  void nav; void doors;
  return { ...pose, x: pose.x + dx, y: pose.y + dy };
}
export function settle(nav: NavWorld, pose: WalkPose, doors: DoorStates): WalkPose {
  void nav; void doors;
  return pose;
}
export function pickTarget(nav: NavWorld, hit: WalkHit, from: WalkPose): WalkPoint | null {
  void from;
  const lv = [...nav.levels].sort((a, b) => Math.abs(a.baseY - hit.y) - Math.abs(b.baseY - hit.y))[0];
  return lv ? { x: hit.x, y: hit.z, level: lv.level, stair: null } : null;
}
export function goalPoint(nav: NavWorld, goal: WalkGoal): { point: WalkPoint; yaw?: number } | null {
  if (goal.kind === "point") return { point: { ...goal.at, level: goal.level, stair: null } };
  const room = nav.levels.find((l) => l.level === goal.level)?.rooms.find((r) => r.id === goal.roomId);
  return room ? { point: { ...polygonCentroid(room.poly), level: goal.level, stair: null } } : null;
}
export function routeTo(nav: NavWorld, from: WalkPose, to: WalkPoint, doors: DoorStates): RouteResult {
  void nav; void from; void doors;
  return { ok: true, route: { points: [to], doors: [] } };
}
export function planTour(nav: NavWorld, from: WalkPose, doors: DoorStates): TourStop[] {
  void from; void doors;
  return nav.levels.flatMap((l) => l.rooms.map((r) => ({ roomId: r.id, name: r.name, level: l.level, at: polygonCentroid(r.poly), yaw: 0 })));
}
export function roomAt(nav: NavWorld, level: number, p: V2): { id: string; name: string } | null {
  const r = nav.levels.find((l) => l.level === level)?.rooms.find((x) => pointInPolygon(p, x.poly));
  return r ? { id: r.id, name: r.name } : null;
}
```

### 1e. `src/walkStore.test.ts`
- `requestWalk({kind:"front"})` sets `on`, `pending`, `tab: "3d"` and every field of `WALK_UI`.
- `stopWalk()` puts the saved values back (e.g. start from `viewMode: "wipe"`, `showCeilings: false`, `maxLevel: 0` and check they return).
- `toggleDoor("k", false)` twice gives true, then false. `mergeDoors({k: false, j: true})` keeps an existing `k`.

Then run `npm run check`, commit, and branch the four worktrees from that commit.

---

## 2. Chunks

**Rules for every chunk.** Read CLAUDE.md and this spec. Follow the code map; don't explore at random. Read large files by searching first and then reading a range. Each chunk works in its own worktree and symlinks node_modules. Before reporting it runs `npm run check` and `npm run build`. Each uses its own dev-server port: A 5311, C 5313, D 5314 (`npx vite --port N`). Pure logic goes in src/lib with a `.test.ts`. CSS uses tokens only, per docs/brand.md. Any wait shows `<Loader>`. Do not edit any file another chunk owns. Commit trailer: the one from the system reminder.

**Shared Playwright harness.** Every chunk uses this. Quality is set to Low so SwiftShader keeps up.
```js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const PORT = process.env.PORT; let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
async function open(tile = 0, ctxOpts = { viewport: { width: 1440, height: 900 } }) {
  const browser = await chromium.launch({ args });
  const page = await (await browser.newContext(ctxOpts)).newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); failed++; });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.welcome-tile', { timeout: 120000 });
  await page.locator('.welcome-tile').nth(tile).click();          // 0 = as listed, 1 = with the extension
  await page.waitForSelector('.dock', { timeout: 120000 });
  await page.evaluate(() => { const s = window.__houseStore.getState(); s.setSettings({ quality: 'low' }); s.setUi({ tab: '3d' }); });
  await page.waitForFunction(() => !document.querySelector('.viewer-loading'), null, { timeout: 180000 });
  return { browser, page };
}
const toScreen = (page, x, y, z) => page.evaluate(([x, y, z]) => {
  const cam = window.__houseCamera.camera; const v = cam.position.clone().set(x, y, z).project(cam);
  const r = document.querySelector('.viewer canvas').getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, [x, y, z]);
// iPad: { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true }
// phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
```
Put each chunk's script in `scripts/test-walk-<a|c|d>.cjs`, run with `PORT=… node scripts/test-walk-x.cjs`.

### Chunk A: door leaves out of the shell, animated, tappable (Madonna)

**Goal.** While walking (`useWalk.on`), each floor's shell is built without its moving door leaves. The leaves are drawn as separate hinged, sliding or folding groups that animate to the walk store's door state. When not walking, nothing changes.

**Owns:** `src/lib/openings.ts`, `src/lib/openings.test.ts`, `src/three/shell.ts`, `src/three/shell.test.ts`, `src/three/House.tsx`, new `src/three/DoorLeaves.tsx`, new `scripts/test-walk-a.cjs`.
**Must not touch:** Viewer.tsx, App.tsx, Dock, any `src/lib/walk*.ts`, store.ts, walkStore.ts, walkTypes.ts. It only reads `useWalk` and `doorTag`.

**Step 1, before any refactor.** Add a snapshot test to openings.test.ts: `openingParts(...).boxes`, sorted and rounded to 1e-6, for kinds door (internal and external, width 0.8 and 1.4), front (with and without sidelight), french, patio (2.4 and 3.6 m), bifold. Cover `out` 0/1/-1 × flipHinge × flipSwing × doorsOpen, plus openDeg 0/30/undefined. Commit the generated `__snapshots__`. After the refactor this test must still pass unchanged.

**openings.ts additions:**
```ts
export interface LeafPose { x: number; y: number; z: number; ry: number }   // the panel frame in the opening's local frame
export interface LeafPanel { boxes: Box[]; pose: (t: number) => LeafPose } // boxes in the panel's own frame; sides already final (incl. the out === -1 flip)
export interface DoorRig { motion: DoorMotion; panels: LeafPanel[]; rest: 0 | 1 }
export interface OpeningParts { boxes: Box[]; quads: FaceQuad[]; bayFloor?: …; /** door, front, french, patio (slider only), bifold */ rig?: DoorRig }
export function openingParts(pl: OpeningPlacement, wallT: number, out: 1 | -1 | 0, doorsOpen = true, opts: { leaves?: boolean } = {}): OpeningParts
export function rigBoxes(rig: DoorRig, t: number): Box[]   // = place(panel.boxes, [pose.x, pose.y, pose.z], pose.ry) for each panel
```

Rules for the rig:
- `rest = initiallyOpen(op, doorsOpen) ? 1 : 0`.
- Swing leaves: angle(t) = t × `openTargetDeg(op)` in radians. The hinge z switches to the open value as soon as t > 0, matching the existing `ang ? … : zf` choice.
- Patio: only the panel from `patioSlider(pl.width, op.flipHinge).index` is in the rig. It slides `0.95 × lw/n` towards the other end (index n−1 slides −x, index 0 slides +x). The other panels stay in `boxes`.
- Bifold: fold angle θ = t × `BIFOLD_FOLD`. The stack starts at x = side·clear/2, z = zf + (θ > 0 ? swing·FD/2 : 0). Panel i has direction (−side·cosθ, (i%2 ? −1 : 1)·swing·sinθ)·panel. At θ = 0 this reproduces the shut row exactly; at BIFOLD_FOLD it reproduces the open stack.
- `opts.leaves === false` leaves the rig's boxes out of `boxes`. Otherwise `boxes` holds exactly what it holds today, order aside.
- Make sure the `out === -1` side flip is applied once only.

**shell.ts additions:**
```ts
export interface ShellLeafPanel { meshes: ShellMesh[]; pose: (t: number) => LeafPose }  // geometry in the panel frame
export interface ShellLeaf { key: string; openingId: string; kind: OpeningKind; motion: DoorMotion; initial: boolean; frame: { centre: V2; dir: V2 }; panels: ShellLeafPanel[] }
ShellInput.splitLeaves?: boolean
buildShell(inp): { meshes; bayFloors; roomSlots; leaves: ShellLeaf[] }   // leaves [] unless splitLeaves
```
- With `splitLeaves`, call `openingParts(…, { leaves: false })`. For each rig, batch every panel's `boxQuads(panel.boxes, { centre: {x:0,y:0}, dir: {x:1,y:0} })` through its own `Batcher`, using `partSpec(slot.mat, op, trimColor, slot.side)` and the same coloured `op`. Glass slot is 0: leaf glass doesn't glow while walking.
- `key = doorKey(floor.id, op.id)`; `initial = initiallyOpen(op, inp.doorsOpen)`.
- Bays and windows are untouched.

**`src/three/DoorLeaves.tsx`:**
```tsx
export function DoorLeaves({ leaves, glass }: { leaves: ShellLeaf[]; glass: THREE.Material }): JSX.Element
```
- Each leaf is an outer `<group position={[cx, 0, cz]} rotation-y={Math.atan2(-dir.y, dir.x)} userData={{ [DOOR_TAG]: { key, initial } }}>`. Inside, one group per panel holds the panel's meshes: material `getMaterial(spec)`, or `glass` for glass; castShadow and receiveShadow as the shell does.
- `useWalk((s) => s.doors)` drives the target: `doors[key] ?? initial`.
- Each leaf keeps its current t in a ref and moves it towards the target: 0.7 s for a swing, 0.9 s for slide and fold, eased with `easeInOut` from lib/cameraViews. Under `prefers-reduced-motion` it jumps.
- Each frame sets the panel groups from `pose(easedT)`. Call `invalidate()` while anything moves, and `useWalk.getState().doorSettled()` when a move ends.
- A leaf's first render places it at `initial` with no animation.
- Dispose the geometries with the shell.
- Dev hook: `window.__walkDoors = () => [{ key, kind, t, panels: [{ x, z, ry }] }]`, reading the live panel groups.

**House.tsx:**
- In `FloorShell`, `const split = useWalk((s) => s.on)`. Pass `splitLeaves: split` into `buildShell` and add `split` to its memo deps. Dispose the leaf geometries too.
- Render `{split && <DoorLeaves leaves={shell.leaves} glass={glass} />}` next to the shell meshes. The FloorShell group is already offset to the floor's Y.
- Extra: `RoomFloor` gets a touch long-press when `onContext` is set. On `pointerType === "touch"`, start a 550 ms timer and cancel it on move over 8 px, pointerup, or a second pointer. When it fires, call `onContext(clientX, clientY)` and swallow the click that follows. This gives iPad and phone users the 3D room menu, including "Walk from here".

**Tests (vitest):**
- The snapshot test above.
- `rigBoxes(rig, rig.rest)` plus `openingParts(…, {leaves:false}).boxes` equals `openingParts(…).boxes` as a sorted multiset, for the same matrix.
- shell.test.ts: with the `f` fixture plus an internal door and a patio, `buildShell({...,splitLeaves:true})` meshes plus leaf quads moved into world by the two group transforms at rest t give the same vertex positions per material key as `splitLeaves:false`, within 1e-6.
- `rig.rest === (initiallyOpen(op, doorsOpen) ? 1 : 0)`.
- Swing at t=1 turns the leaf by `openTargetDeg` (front: 80°, back door with openDeg 0: 75°).
- The patio slider moves 0.95·lw/n along x and not in z.

**Acceptance (tile 0):**
```js
const { browser, page } = await open(0);
await page.evaluate(() => window.__walkStore.setState({ on: true }));
await page.waitForFunction(() => window.__walkDoors && window.__walkDoors().length >= 5);
const d0 = await page.evaluate(() => window.__walkDoors());
ok(d0.every((d) => d.t === 0), 'doors shut (Doors open off) start at rest 0');
const front = d0.find((d) => d.kind === 'front'), patio = d0.find((d) => d.kind === 'patio'), inner = d0.find((d) => d.kind === 'door');
await page.evaluate((ks) => ks.forEach((k) => window.__walkStore.getState().toggleDoor(k, false)), [front.key, patio.key, inner.key]);
await page.waitForTimeout(4000);
const d1 = Object.fromEntries((await page.evaluate(() => window.__walkDoors())).map((d) => [d.key, d]));
ok(Math.abs(Math.abs(d1[front.key].panels[0].ry - front.panels[0].ry) - 80 * Math.PI / 180) < 0.05, 'front door swings 80°');
ok(Math.abs(d1[inner.key].panels[0].ry - inner.panels[0].ry) > 1.2, 'internal door swings ~75°');
ok(Math.abs(d1[patio.key].panels[0].x - patio.panels[0].x) > 0.8, 'patio slider slides');
ok(await page.evaluate(() => window.__walkStore.getState().doorsSettled) >= 3, 'settled events');
await page.evaluate(() => window.__walkStore.setState({ on: false }));
await page.waitForTimeout(1500);
ok((await page.evaluate(() => window.__walkDoors())).length === 0, 'leaves merged back after the walk');
```
Then repeat with `__houseStore.getState().setUi({doorsOpen:true})` set before `on`: internal doors must start at t = 1.

### Chunk B: pure walk logic (Prince, Opus medium; high if the stairs fight back)

**Goal.** Implement `src/lib/walk.ts` (replacing the stub) with exactly the stub's exported names and signatures. Internals go in new files.

**Owns:** `src/lib/walk.ts` (rewritten as a facade that re-exports), new `src/lib/walkNav.ts`, `walkMove.ts`, `walkRoute.ts`, `walkTour.ts`, each with a `.test.ts`.
**Must not touch:** anything else, including walkTypes.ts (ask Nancy if a type must change). It may import from geometry, walls, stairs, stairwell, openings (`frontUnit`, `bayOutline`), planMath (`fixtureSolids`), catalogue, gardenCatalogue, siteItems, site, surfaceSlope.

**Constants:** `WALKER_R = 0.25`, `MAX_STEP = 0.3`, grid cell 0.15 m (B's call; keep `buildNav` under about 80 ms in node for the owner's house plus plot).

**`buildNav(model, site, doorsOpen)`**
- `levels`: per floor, with `baseY = level*(ceilingHeight+slabThickness)` (as three/floorBase.ts) and rooms from `roomWorldPolygon`.
- Blocking segments per level (capsules `{a,b,r}`):
  - Wall pieces from `cutWall(wall, ceilingHeight)` for every `buildWalls(floor)` wall where `y0 < 0.3`, with `r = wallThickness(w)/2`. This catches the wall under a window's sill.
  - Windows, and bays on internal walls: the whole placement.
  - Garages and anything with passage "shut": the whole placement.
  - Doors (passage "door"): the never-passable part of the placement is permanent. Its passable `span` is a door segment tagged with the door key. `span` is the whole width for door, french and bifold (minus 0.05 per side), `frontUnit(op, w).door` for front doors, and `patioSlider(w, flipHinge).span` for patios.
  - Gaps and archways add nothing.
  - Bays on external walls: the `bayOutline` polyline, placed with the placement's frame, blocks; the bay floor is walkable.
  - Fixtures: `fixtureSolids(floor.fixtures ?? [], floor.pxPerM, byId)` with `z0 < 1.0 && z1 > 0.15`, skipping `isElectricalItem(item)` and footprints thinner than 0.05 m. The polygon is mapped to world with `toWorld`, and its edges become segments (r = 0).
- Garden, on level 0 (or the lowest level when there is no level 0):
  - Walkable means inside `site.boundary` (with no site, the house bbox grown by 4 m) and outside every room polygon.
  - The boundary blocks, "open" edges included, since the plot is the limit. Neighbour polygons block.
  - Garden items block by type:
    - path kind: never.
    - lights: never, apart from a bollard's 0.1 m post.
    - festoon and stepping stones: never.
    - parasol, pergola, washing-line: posts only (0.08 m circles at the post positions; the parasol and washing line have a single centre post).
    - plants with `h ≥ 0.3`: a circle of r = clamp(spread/4, 0.15, 0.5).
    - hedge, bamboo and climber runs: `itemFootprint`.
    - everything else with `h ≥ 0.1` and base under 1.0: `itemFootprint`.
- Stairs, per flight from `stairFlights(model, HEADROOM)`:
  - The flight's rectangle (`flightAt` corners, run × width) blocks on the lower level, except its **entry edge**. That is s = 0 for a straight foot, or the side l = turn·w/2 for s ∈ [0, w] with a turned foot.
  - On the upper level, the `stairwells(model)` rects block, except where they meet the **exit edge**. That is s = run for a straight head, or the side l = topTurn·w/2 for s ∈ [run−w, run] with a turned head.
  - Upper-level cells inside a well are not walkable.
  - `footStand` and `headStand` are the edge midpoints pushed 0.35 m out of the flight, snapped to the nearest free cell.
- Grid per level: a cell is free if it is in the walkable area and more than `WALKER_R` + r from every permanent segment. `doorCells: Map<doorKey, cells>` lists cells that are free only while that door is open.
- `doors`: one `NavDoor` per opening of passage "door" (and "open", for the HUD), with `initial = initiallyOpen(op, doorsOpen)`.
- `plot`: the boundary, or the box round the house.

**`stepWalker(nav, pose, dx, dy, doors)`**
- Sub-step moves to at most 0.1 m each. Circle-against-capsule push-out, 4 iterations, so the walker slides along walls; shut-door segments block.
- Reject a sub-step whose `feetY` rises more than `MAX_STEP` (kerbs, raised beds).
- Stairs state machine:
  - Crossing a flight's entry edge from its lower level puts you on the stair (`stair = i`). Crossing its exit edge from its upper level does the same.
  - On a stair, only the flight's perimeter blocks, minus its entry and exit edges. `feetY = lowerBase + stairHeight(f, flightS, flightL)`. `level` is the lower level until `feetY > lowerBase + rise/2`, then the upper.
  - Leaving through the entry edge sets the lower level; leaving through the exit edge sets the upper level. `stair` becomes null either way.
- Elsewhere `feetY` is: inside a room, `baseY`; outside, `-GROUND_DROP + groundHeightAt(site, p)`.
- If you start inside an obstacle (after a flip, say), moves that reduce the overlap are allowed.

**`settle(nav, pose, doors)`**
- If the pose's level is missing, use the nearest level.
- If the spot isn't free, use the nearest free cell within 1.5 m on that level. Failing that, the stand spot of the nearest room on that level; failing that, `startPose(front)`.
- Recompute `feetY`, clear `stair` unless still inside that flight, and keep yaw and pitch.

**`startPose(nav, {kind:"front"})`**
- The front door is the lowest level's "front" opening. Failing that, its external "door" nearest +z; failing that, a point 3 m off the +z face.
- Stand 1.6 m outside along the outward normal (`outwardSign`), snapped free, facing the door: `yaw = yawOf(door − stand)`, pitch 0.
- `{kind:"room", at?}`: `at` if it is free (snapped within 1 m), else the room's stand spot. Face the room's centroid, or the longest free sight line when standing on the centroid.

**`pickTarget(nav, hit, from)`**
- Level: whichever has `|hit.y − baseY| < 0.4`. On level 0, a hit outside the rooms counts as garden when `|hit.y − ground(p)| < 0.4`.
- A hit inside a flight rectangle between two bases goes to `headStand` if you are on the lower level, else `footStand`.
- Snap to the nearest free cell within 1 m; null if there is none.

**`goalPoint(nav, goal)`**
- Room: its stand spot, the free cell nearest the centroid (ties go to more clearance), and the yaw to face.
- Point: snap free.

**`routeTo(nav, from, to, doors)`**
- A* over all level grids, plus stair links footStand ↔ headStand (cost = flight length + 0.5).
- Route points through a flight go foot → entry-edge midpoint → the inner walking line (≤ 0.3 m apart, staying 0.4 m from the stringers) → exit-edge midpoint → headStand. Each point carries `stair`, and its `level` follows the stairs state machine.
- String-pull with line-of-sight on the grid.
- If no route exists with the doors as they are, retry with every "door" open. On success return `{ok:false, reason:"shut-door", door: <first shut door on it>, route}`; otherwise `unreachable`.
- `route.doors` lists every door crossed, with the index of the first point beyond it.

**`planTour(nav, from, doors)`**, routing with every door open:
- Rooms with area ≥ 1.8 m², not named /cupboard|cpd|store|airing/i, and reachable.
- Start on the level you are on (level 0 from the front). Pick the nearest room by walking distance each time, using one Dijkstra distance field per pick. Then the next level up, the same way.
- Last, if there is a plot: a garden stop at the centroid of the largest lawn behind the house (centroid y below the house centroid's y). Failing that, 4 m out from the door that leads into the garden.
- Stops are `{roomId, name, level, at: stand spot, yaw: facing into the room}`; the garden stop has name "Garden" and `roomId: null`.

**`roomAt`** is as the stub.

**Tests**, on `builtInHouse("")` plus `listingSite()`, and `builtInProposed("")`:
- nav has levels 0 and 1, one flight, and doors including one front and one patio, all `initial === false`.
- `startPose(front)` is outside every room, inside the plot, `feetY ≈ -0.26 + ground` (±0.05), and faces within 10° of the door centre.
- `routeTo` start → hall centroid with doors `{}` gives `shut-door` with the front door's key. With `{[front]: true}` it is ok, and the route passes within 0.4 m of the front door's centre.
- With every door open, hall → the largest level-1 room is ok. It has points with `stair !== null` and ends on level 1. Simulating it at 0.05 m steps with `stepWalker` reaches within 0.3 m of the goal, `feetY` never jumps more than `MAX_STEP` between steps, and it rises monotonically on the flight.
- Walking straight into a wall: the walker ends at least `WALKER_R + halfT − 1e-3` from the wall's centre line. Walking diagonally keeps over half the along-wall component (it slides).
- A shut door blocks `stepWalker`; an open one lets you through.
- Kitchen → lawn centroid: `shut-door` with the patio or back door key while shut, ok once open. Along that route the feet height steps by at most 0.3 m.
- On a synthetic floor (testing.ts) with a 1×1 m table in the middle, the route goes round the table and never comes within `WALKER_R` of it.
- `settle` of a point on a wall line moves it to a free spot within 1.5 m.
- `planTour` covers every room ≥ 1.8 m² on both levels, ground floor first, the garden last, and every stop is reachable.
- The tour also works on Proposed (the extension layout).
- `buildNav` plus one `routeTo` on the owner's house runs in under 300 ms in vitest (generous; it catches gross slowness).

### Chunk C: walk controller and Viewer integration (Freddie Mercury)

**Goal.** First-person movement in the canvas: keys, drag to look, tap to walk and open doors, route following, tour playback, continuous frames. Viewer integration, and the room-menu entries.

**Owns:** `src/three/Viewer.tsx`, `src/three/Viewer.css`, new `src/three/walk/WalkControls.tsx` (plus any helpers under `src/three/walk/` except doorTag.ts), new `src/lib/walkMotion.ts` with its test, `src/editor/plan/useMenu.ts`, new `scripts/test-walk-c.cjs`.
**Must not touch:** House.tsx, shell.ts, openings.ts, `src/lib/walk*.ts` other than walkMotion, Dock, App.tsx, store.ts, walkStore.ts, walkTypes.ts.

**`src/lib/walkMotion.ts`** (pure):
```ts
export const WALK_SPEED = 1.4, RUN_SPEED = 2.8, ROUTE_SPEED = 1.3, TURN_RATE = Math.PI / 2;
export interface HeldKeys { forward: boolean; back: boolean; left: boolean; right: boolean; turnLeft: boolean; turnRight: boolean; fast: boolean }
export const NO_KEYS: HeldKeys;
/** KeyW/ArrowUp forward, KeyS/ArrowDown back, KeyA left, KeyD right (strafe), ArrowLeft/KeyQ turnLeft, ArrowRight/KeyE turnRight, Shift fast. */
export function keyIntent(code: string): keyof HeldKeys | null;
export function keyMove(keys: HeldKeys, yaw: number, dt: number): { dx: number; dy: number; dyaw: number };
/** Next move along a route: towards points[index], advancing index within 0.15 m; yaw eases to the direction of travel. */
export function followStep(pose: WalkPose, route: WalkRoute, index: number, dt: number, speed?: number): { dx: number; dy: number; index: number; yaw: number; done: boolean };
/** Look-round at a tour stop: base ± 50° over a 4 s sine. */
export function lookSweep(baseYaw: number, t: number, period?: number, ampRad?: number): number;
/** Grab-the-scene drag: dragging right turns left, dragging down looks up; a drag the canvas height turns by the vertical FOV. Pitch clamped to ±PITCH_MAX. */
export function dragLook(yaw: number, pitch: number, dxPx: number, dyPx: number, vfovRad: number, heightPx: number): { yaw: number; pitch: number };
export function isTap(down: { x: number; y: number; t: number }, up: { x: number; y: number; t: number }): boolean; // < 6 px and < 500 ms
```
Tests cover each function: key map, diagonal speed normalised, yaw wrap, followStep reaching done, the dragLook sign, and the pitch clamp.

**`WalkControls({ model, variant }: { model: HouseModel; variant: VariantKey })`**, mounted inside the Canvas.
- **Nav.** `const site = useStore((s) => siteOf(s.sites, variant))`, `doorsOpen = useStore((s) => s.doorsOpen)`, `nav = useMemo(() => buildNav(model, site, doorsOpen), …)`.
- **Placing the walker.**
  - When `pending` is set: `placed(startPose(nav, pending), initialDoors(nav))`, then say the first-time hint once per session. Touch: "Tap the floor to walk · drag to look round · tap a door to open it". Desktop: "Click the floor to walk · drag to look · WASD or arrows to move · Esc to stop".
  - When nav changes with a pose already set (flip, peek, edit): `mergeDoors(initialDoors(nav))`, `setPose(settle(nav, pose, doors))`, clear the route.
  - If it mounts with a pose and no pending (context restored), keep the pose.
- **Camera.**
  - On mount: `fov = aspect < 1 ? 80 : 65`, `near = 0.05`, `updateProjectionMatrix()`, `rotation.order = "YXZ"`. On unmount restore fov 45, near 0.1, order "XYZ".
  - Each frame: `position.set(x, smoothedFeetY + eyeHeightOf(settings), y)` and `rotation.set(pitch, yaw, 0)`. smoothedFeetY lowpasses at about 12/s so the 0.26 m door step doesn't jolt.
  - In dev, set `window.__houseCamera = { camera, controls: null }` on mount.
- **Frames.** `useFrame((_, delta))` with dt clamped to 0.1. It integrates keys, route, tour and look inertia, calls `stepWalker`, and `setPose` whenever the pose changes. `setWhere` uses `roomAt`, with `outside` when on level 0 and outside every room. Call `invalidate()` while anything is moving, a key is held, a route is active or the tour is playing. Input handlers call `invalidate()` to wake the loop.
- **Keys.**
  - Capture phase on `window`. Ignore when `keyBelongsElsewhere(e.target, document)` or a modifier other than Shift is held.
  - WASD, arrows, Q/E and Shift: preventDefault plus stopPropagation (so the floor digits and M never reach useStudioKeys).
  - Digits and M: swallowed while walking.
  - Space is not handled here; useStudioKeys peeks as usual.
  - Esc on `window` bubble phase, only when `!e.defaultPrevented` (so an open popover closes first): `stopWalk()`.
  - Clear held keys on blur.
- **Pointer** on `gl.domElement`:
  - pointerdown records the press. Move by more than 6 px makes it a look-drag (`dragLook`, cursor `grabbing`). Mouse uses the left button only; a second touch pointer cancels the gesture.
  - On release, `isTap` decides whether it was a tap. A tap raycasts the scene from the camera; take the hits in order:
    1. `doorTagOf(hit.object)` → `toggleDoor(tag.key, tag.initial)` and stop.
    2. A material that is `transparent`, or an invisible ancestor → skip.
    3. `face.normal` transformed to world with `y > 0.6` → `pickTarget(nav, hit.point, pose)`, then `routeTo`. On ok: `setRoute` and show a fading ring on the floor at the target (a small mesh owned by WalkControls). On `shut-door`: say "The door's shut — tap it to open" ("click it" on a fine pointer) and don't move. On unreachable: say "Can't get there from here".
    4. Anything else (a wall face): do nothing.
  - Prevent `contextmenu` on the canvas. Wheel events: preventDefault and ignore.
- **Mini-map goals.** On `goal` (subscribe): `takeGoal()` → `goalPoint` → `routeTo`, the same as a tap.
- **Taking over.** Any key, drag, tap or goal pauses a playing tour (`pauseTour`) and replaces the route. A flip (activeVariant change, including a Space peek) pauses the tour and clears the route.
- **Tour.**
  - When `tour.status === "playing"`: if `stops` is empty, `setTour({ stops: planTour(nav, pose, doors), index: 0, phase: "walking" })`.
  - Walking phase: `routeTo(stop)`, using the all-doors-open route when the result is `shut-door`. Follow it at `ROUTE_SPEED`. Within 1.0 m of a route door that is shut, `setDoor(key, true)` and wait 0.6 s.
  - On arrival: phase "looking" for 4 s using `lookSweep(stop.yaw, t)`, with pitch easing to 0. Then `index + 1`.
  - After the last stop: `stopTour()` and say "That's the tour".
  - Paused, nothing moves. Playing again replans the route from where you stand to the current stop.
- **Stalls.** A route that makes no progress for 0.5 s is replanned once (a door shut on the way); a second stall shows the shut-door hint.
- **Dev hooks.** `window.__walk = { nav: () => nav, sim: (seconds) => WalkPose[] }`. `sim` runs the same update synchronously in 1/30 s steps with the held keys, route and tour, returning the poses visited, then calls invalidate. All Playwright movement checks use `sim`.

**Viewer.tsx edits:**
- `const walking = useWalk((s) => s.on) && active` (chrome views only).
- Render `{walking ? <WalkControls model={model} variant={variant ?? activeVariant} /> : <Orbit … />}`. Orbit's remount restores the pre-walk camera through `lastPose()`, so add no other restore code.
- While walking, pass House `onSelectRoom={NOOP}`, `onContextRoom={undefined}` and `onPickWall={undefined}`, and hide `ViewCube` and `MeasureButton`.
- Add `useWalk((s) => s.doorsSettled)` to the `ShadowUpdates` deps.
- `useEffect`: when `!active` while walking, or the store `mode === "review"`, call `stopWalk()`.
- `openRoomMenu`: insert after "Select": `{ label: "Walk from here", run: () => { first(); useWalk.getState().requestWalk({ kind: "room", level: floor.level, roomId: room.id }); } }`.

**useMenu.ts.** In the room menu, in both the decorate list and the other one, add `{ label: "Walk from here", run: () => { select({ room: room.id }); useWalk.getState().requestWalk({ kind: "room", level: floor.level, roomId: room.id, at: toWorld(floor, raw) }); } }`. requestWalk switches to 3D itself.

**Acceptance (tile 0, desktop; then the key steps on the iPad context with touch taps via `page.touchscreen.tap`):**
```js
const { browser, page } = await open(0);
const orbit = await page.evaluate(() => window.__houseCamera.camera.position.toArray());
await page.evaluate(() => window.__walkStore.getState().requestWalk({ kind: 'front' }));
await page.waitForFunction(() => window.__walkStore.getState().pose && window.__walk);
const st = () => page.evaluate(() => ({ w: window.__walkStore.getState(), cam: window.__houseCamera.camera.position.toArray(), m: window.__houseStore.getState() }));
let s = await st();
ok(Math.abs(s.cam[1] - (s.w.pose.feetY + 1.6)) < 0.05 && s.m.showCeilings && s.m.viewMode === 'single', 'eye at 1.6 m, ceilings on, single view');
const front = await page.evaluate(() => window.__walk.nav().doors.find((d) => d.kind === 'front'));
await page.keyboard.down('w'); await page.evaluate(() => window.__walk.sim(5)); await page.keyboard.up('w');
s = await st(); ok(Math.hypot(s.w.pose.x - front.centre.x, s.w.pose.y - front.centre.y) > 0.2 && !s.w.where?.roomName, 'shut front door stops you outside');
await page.evaluate(() => window.__walk.sim(0.2));
const p = await toScreen(page, front.centre.x, s.w.pose.feetY + 1.0, front.centre.y); await page.mouse.click(p.x, p.y);
await page.waitForFunction((k) => window.__walkStore.getState().doors[k] === true, front.key);
const hall = await page.evaluate(() => { const n = window.__walk.nav(); const l = n.levels.find((x) => x.level === 0); return l.rooms.find((r) => /hall/i.test(r.name)); });
// click the hall floor: centroid at baseY, then simulate
// … ok(route set) ; await page.evaluate(() => window.__walk.sim(12)); ok(where.roomName matches /hall/i)
// shut door hint: shut front again from inside, click the garden through glass → hint includes "shut"
// stairs: requestGoal({kind:'room', level:1, roomId: <largest level-1 room>}); sim(40) → pose.level===1; the poses' feetY never step >0.3
// Space: keyboard.down('Space') → activeVariant flipped and pose free (settled); up → back
await page.keyboard.press('Escape');
s = await st(); ok(!s.w.on && s.m.viewMode === 'single' && !s.m.showCeilings, 'Esc stops and restores the view settings');
await page.waitForTimeout(1500);
ok(Math.hypot(...(await page.evaluate(() => window.__houseCamera.camera.position.toArray())).map((v, i) => v - orbit[i])) < 0.05, 'orbit camera back where it was');
// room menu: right-click a room floor in orbit → menu has "Walk from here" → click → walking, pose.level matches
// plan menu: tab plan, right-click inside a room (mirror scripts/test-touch-plan.cjs for SVG coordinates) → "Walk from here" → tab 3d, walking
// tour: playTour(); sim(120) → tour.index advanced ≥ 3 and doors opened on the way; any key → status 'paused'
```

### Chunk D: Walk button, walk bar, mini-map, hints, phone and tablet layout, docs (Dua Lipa)

**Goal.** Everything on screen outside the canvas. It builds against store state only, so it runs with C's work unmerged; with no WalkControls the pose stays null.

**Owns:** `src/components/Dock.tsx`, `src/components/Dock.css`, `src/components/icons.tsx` (adds walk, play, pause, flip and map), new `src/components/walk/WalkBar.tsx`, `WalkMap.tsx`, `WalkHint.tsx`, `walk.css`, new `src/lib/walkMap.ts` with its test, `src/App.tsx` (only the `data-walking` attribute), `src/lib/shortcuts.ts`, `README.md`, new `scripts/test-walk-d.cjs`.
**Must not touch:** Viewer.tsx, House.tsx, shell.ts, openings.ts, `src/lib/walk.ts` and B's files, walkStore.ts, walkTypes.ts, store.ts.

**Dock.tsx**
- Not walking, in 3D: add a "Walk" button between the View popover and `SavedViewsMenu`. On desktop and tablet it is a text button with the icon; on the phone it is an icon-only `icon-btn` after the eye button. Title: "Walk through the house · Esc to stop". It calls `useWalk.getState().requestWalk({ kind: "front" })`, then `(document.activeElement as HTMLElement | null)?.blur()` so Space can't press it again.
- Walking: the dock renders `<WalkBar />` in place of its usual contents, in the same `.dock float-card` container, and also renders `<WalkMap />` and `<WalkHint />`.
- The desktop dock does not change apart from that one button.

**WalkBar**, left to right:
1. Stop: "Stop walking", with Esc in the title.
2. Readout: `where.roomName ?? "Garden"` (when outside) and `floorDisplayName` of the level's floor, e.g. "Kitchen · Ground floor". Hidden on the phone.
3. Tour: Play/Pause (`playTour` / `pauseTour`), plus a small ✕ while the tour is on (`stopTour`).
4. Flip: shows the layout you are looking at, e.g. "As listed ⇄"; title "Swap to Proposed · hold Space to peek"; `flipLayout()`. Only when both layouts exist.
5. Eye height: a `Popover` labelled "Eye 1.60 m" holding a range input from `EYE_HEIGHT.min` to `max` in `step`s, plus a reset to 1.6. It writes `setSettings({ eyeHeight })`.
6. Map toggle (`setShowMap`).

Every button blurs itself after a click. Phone: icons only, 36 px targets. Touch tablet: 40 px, as the dock does.

**WalkMap** (only with `showMap` and a pose):
- An SVG of the current level's rooms from `variants[activeVariant]`, drawn with `roomWorldPolygon` through `fitTransform` / `pathFor` (lib/footprint.ts). Plan up is −z, as on the plan.
- On level 0 when `where.outside`, also the plot boundary from `siteOf(sites, activeVariant)`, dashed.
- The current room is filled `var(--accent-soft)`; others `var(--surface-2)` with a `var(--line)` stroke.
- Marker: a dot plus a 60° view cone in `var(--accent)`. Update it through `useWalk.subscribe` by setting a `<g>` transform from `walkMap.ts`, with no React render per frame.
- Tapping a room sends `requestGoal({ kind: "room", level, roomId })`; tapping the plot outside rooms sends `requestGoal({ kind: "point", level: 0, at })`.
- Size: 180 px on desktop and tablet, bottom-right at `bottom: 76px; right: var(--float-gap)` (the view cube's place, hidden while walking). 120 px on the phone, top-right at `top: var(--float-gap)`. Card look (`--shadow-card`, `--radius-l`).

**`src/lib/walkMap.ts`** (pure, tested):
```ts
export function mapFit(polys: V2[][], sizePx: number, pad?: number): FitTransform;
export function markerTransform(fit: FitTransform, pose: Pick<WalkPose, "x" | "y" | "yaw">): string; // "translate(px,py) rotate(deg)"
export function roomUnder(fit: FitTransform, rooms: { id: string; poly: V2[] }[], px: number, py: number): string | null;
export function mapToWorld(fit: FitTransform, px: number, py: number): V2;
```

**WalkHint.** A pill at the top centre: `top: calc(var(--float-top) + 44px)`, below the peek badge. It shows `hint.text` for `hint.ms`, keyed on `hint.id`, with `role="status"`. Text colour `--text` on `--surface`.

**App.tsx.** Add `data-walking={walking || undefined}` on `.app`. walk.css hides `.layout-pill` while walking on the phone, since Flip replaces it. Nothing else changes.

**shortcuts.ts.** Add a "Walk" group:
- W A S D / arrows: walk (← → turn)
- Q E: turn
- Shift: faster
- drag: look round
- click floor: walk there
- click door: open or shut
- Space (hold): show the other layout
- Esc: stop walking
- Also add a 3D-group row: right-click → "Walk from here".

**README.md.** Add a "Using it" bullet after "3D view" (text in section 5).

**Tests.** `walkMap.test.ts`: the marker turns 90° for yaw π/2 (sign matches `forwardOf`), `roomUnder` hits the right room, and `mapToWorld(mapFit(...))` round-trips.

**Acceptance** (desktop, iPad and phone contexts, tile 1 so both layouts exist):
```js
for (const ctx of [{ viewport: { width: 1440, height: 900 } }, IPAD, PHONE]) {
  const { browser, page } = await open(1, ctx);
  const dockW0 = await page.$eval('.dock', (e) => e.getBoundingClientRect().width);
  ok(await page.$('.dock [aria-label^="Walk"], .dock button:has-text("Walk")') !== null, 'Walk button in the dock');
  await page.click('.dock [aria-label^="Walk"], .dock button:has-text("Walk")');
  await page.waitForSelector('.walk-bar');
  ok(await page.evaluate(() => window.__walkStore.getState().on), 'walking');
  // stand-in pose so the map draws without WalkControls (no-op once C is merged)
  await page.evaluate(() => { const w = window.__walkStore.getState(); if (!w.pose) w.placed({ x: 0, y: 0, level: 0, stair: null, feetY: 0, yaw: 0, pitch: 0 }, {}); });
  ok(await page.$('.walk-map svg path') !== null, 'mini-map shows rooms');
  // tap a room on the map → goal set (or consumed by C)
  // eye height: set the range to 1.7 → __houseStore settings.eyeHeight === 1.7, survives reload (localStorage)
  // flip: click Flip → activeVariant changes; click again → back
  // tour: Play → tour.status 'playing'; Pause → 'paused'
  const r = await page.$eval('.walk-bar', (e) => e.getBoundingClientRect());
  ok(r.left >= 0 && r.right <= ctx.viewport.width, 'walk bar fits the screen');
  await page.screenshot({ path: `${process.env.SHOTS || '/tmp'}/walk-${ctx.viewport.width}.png` });
  await page.click('.walk-bar [aria-label="Stop walking"]');
  ok(!(await page.evaluate(() => window.__walkStore.getState().on)), 'stopped');
  await browser.close();
}
// desktop, not walking: dock width grows by the Walk button only (record before and after in the main checkout once, then compare)
```

---

## 3. Interfaces between chunks

| From | To | Contract |
|---|---|---|
| Entry points (Dock, the 3D room menu, the plan menu) | foundation | `useWalk.getState().requestWalk(start: WalkStart)`; nothing else |
| C | B | `import { buildNav, initialDoors, startPose, stepWalker, settle, pickTarget, goalPoint, routeTo, planTour, roomAt, WALKER_R } from "../../lib/walk"` with the stub's exact signatures |
| C | A | `doorTagOf(hit.object)` (foundation) finds `{ key, initial }`; C calls `toggleDoor(key, initial)` |
| A | store | reads `useWalk(s => s.on)` (split the leaves) and `s.doors`; calls `doorSettled()` after each move |
| C | Viewer | adds `doorsSettled` to the `ShadowUpdates` deps |
| A, B | foundation | both decide a door's starting state with `initiallyOpen(op, doorsOpen)`, its opening angle with `openTargetDeg`, the patio slider with `patioSlider`, and keys with `doorKey(floor.id, op.id)`, so the leaf you see and the doorway you can walk through always agree |
| D → C | store | `requestGoal`, `playTour`, `pauseTour`, `stopTour`, `flipLayout`, `setShowMap`, `setSettings({eyeHeight})`; C reads `tour`, `goal`, `settings.eyeHeight` |
| C → D | store | `pose` (subscribe transiently), `where`, `hint` (via `say`), `tour.index` and `tour.status` |
| Tests | dev hooks | `window.__walkStore` (foundation), `window.__walkDoors()` (A), `window.__walk.{nav,sim}` (C), plus the existing `__houseStore`, `__houseCamera` and `__houseRenderer` |

**Stubs.** The only stub is `src/lib/walk.ts`, from the foundation. B rewrites it and nobody else edits it, so take B's version at merge. D's acceptance seeds a pose with `placed(...)` because WalkControls is missing in its worktree; that line does nothing once C is merged. C's checks run against the stub until B lands (no collision, straight-line routes). Its collision, door and stairs checks only pass after the B merge, so re-run `scripts/test-walk-c.cjs` after merging B.

**Merge order:** foundation, then A, B, C, D. The files are disjoint, so expect no conflicts. After all four: run `npm run check`, `npm run build`, then the scripts `test-walk-a`, `test-walk-c` and `test-walk-d`, then `scripts/shoot-chassis.cjs` to confirm the desktop is unchanged apart from the Walk button.

---

## 4. Risks and decisions

1. **Leaves split only while walking.** The non-walking scene keeps the exact same merged shell (the snapshot test guards this). Starting or stopping a walk rebuilds each floor's shell once, a short one-off hitch. While walking there are roughly 40–80 extra draw calls (about 15 doors × 3–5 materials); the materials are already compiled. Leaf glass doesn't glow at night during a walk.
2. **iPad performance.** Frames are drawn only while something moves (keys, a route, the tour, a drag, a door). The shadow map is never redrawn for a camera move, only when a door settles. I left render quality alone (no surprise recompile when the walk starts). The README tells iPad users to pick Balanced if walking stutters.
3. **frameloop "demand".** WalkControls calls `invalidate()` every frame while busy and from its input handlers. dt is clamped to 0.1 s. The tests drive movement with `__walk.sim`, not wall-clock time.
4. **Raycast order.** Door tag first, then transparent hits are skipped (so you can tap the garden through glass), then floor-like faces (normal y > 0.6) become walk targets. Walls do nothing. React-three-fiber events on room floors still fire, which is why Viewer passes a no-op select while walking.
5. **Space and Flip.** Holding Space peeks exactly as elsewhere; it works because the walk forces `viewMode: "single"` and restores it afterwards. The Flip button swaps the layout for good, like the phone's layout pill. Both pause the tour and cancel the route.
6. **A flip that leaves you inside a wall.** `settle()` moves you to the nearest free spot within 1.5 m on the same level, then to the nearest room's stand spot, then to the front door. A missing level falls to the nearest level. Doors in the new layout start from their own drawn state; their keys contain the floor id, so the two layouts never share door state.
7. **Stairs** are a small state machine (on via the entry or exit edge, height from `stairHeight`). Upper-floor stairwells and the flight's sides block. Tapping the treads walks to the other end. Taps through the well onto the floor below route down the stairs.
8. **Doors and collision.** A shut door blocks movement and routes. An open leaf is not an obstacle (v1). Patio doors are passable only through the panel that slid. The front door's side lights never are. Garages and windows always block; gaps and archways never do.
9. **Garden.** You walk within the plot boundary; every edge blocks, "open" ones included, so you can't wander into the street. Neighbours block, and garden items block per type (B's list). Ground heights come from the surface slopes; steps over 0.3 m are refused. Garden walking is ground level only.
10. **Tour.** Ground floor first, picking the nearest room by walking distance each time; then upstairs the same way; then out to the garden last. Cupboards and rooms under 1.8 m² are skipped. It opens shut doors as it reaches them, and looks round each room for 4 s (±50°). Any key, drag, tap, map tap or flip pauses it; Play continues from the current stop; at the end it says "That's the tour".
11. **Where a walk ends.** Stop walking or Esc returns to the orbit view where it was (through Orbit's remount). Switching to the Plan tab or opening Review also stops the walk. The mode never changes. `viewMode` is persisted, so if the page reloads mid-walk Single sticks; I accept that.
12. **Keys.** While walking, the floor digits and M are swallowed. Tab still switches tabs, which stops the walk. Esc yields to an open popover.
13. **Facing.** Drag uses grab-the-scene on mouse and touch alike, like estate-agent tours. Left and right arrows turn rather than strafe.
14. **Long-press in 3D.** The only change here outside the walk is the touch long-press on room floors (A), which iPad and phone users need to reach "Walk from here".

---

## 5. Docs

- **README.md, "Using it"** (D), a new bullet after "3D view":
  "**Walk through**: **Walk** in the 3D bar puts you at the front door. Click or tap the floor to walk there, drag to look round, and use WASD or the arrow keys on a keyboard (Shift for faster). Click or tap a door to open or shut it, patio and bi-fold doors included; a shut door stops you. The stairs take you up. Out in the garden you stay inside the plot. **Walk from here** on a room's menu (right-click, or a long press on a touch screen) starts in that room. The mini-map shows where you are; tap a room on it to walk there. **Flip** (or holding Space) swaps As listed and Proposed where you stand. **Tour** walks through every room and out into the garden by itself. Eye height is adjustable (1.6 m to start) and remembered. Esc or **Stop walking** goes back to the view you had. On older iPads, set Settings → render quality to Balanced if walking stutters."
- **Shortcut sheet** (D): the "Walk" group.
- **docs/walkthrough-plan.md** (you, in the foundation commit): this spec as written, with a "Decisions" section copied from section 4 for later readers.

### Critical files for implementation
- /home/user/house-modeler/src/lib/openings.ts
- /home/user/house-modeler/src/three/shell.ts
- /home/user/house-modeler/src/three/House.tsx
- /home/user/house-modeler/src/three/Viewer.tsx
- /home/user/house-modeler/src/lib/stairs.ts
- /home/user/house-modeler/src/lib/stairwell.ts
- /home/user/house-modeler/src/components/Dock.tsx
- /home/user/house-modeler/src/editor/plan/useMenu.ts
