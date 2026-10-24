# Editor core: one polygon editor under the plan and the site (Bruno Mars)

Status: landed (all four chunks merged; `scripts/editor-regression.mjs` is green on both editors). Plan for the refactor proposed in docs/review-2026-10/tech-render.md §6 and docs/review-2026-10.md §4 "Plan editor". The 2D plan editor (`src/editor/PlanEditor.tsx`, 2,298 lines, 23 `useState`s plus 2 in `usePlanCamera`, one inline drag machine) and the site editor (`src/editor/SiteEditor.tsx`, 1,023 lines, its own camera and drag machine) both move onto one shared core under `src/editor/core/`, with the pure maths in `src/lib/`. After this, an editing feature is built once and works the same way in both editors. Privacy: the house is "listing 91770873" and nothing else.

The work splits into **Chunk 0 (Ariana Grande)**, which lands first, then **A1 (Harry Styles)** and **B (Ed Sheeran)** in parallel, then **A2 (Olivia Rodrigo)** after A1.

| Chunk | Owns | Depends on | Model |
|---|---|---|---|
| **0 Ariana Grande: core and parity script** | new `src/lib/polygonEdit.ts` (+test), new `src/lib/editorCore.ts` (+test), new `src/editor/core/*`, new `scripts/editor-regression.mjs`, one `"regress:editors"` line in `package.json` | nothing: **lands first**, changes neither editor | Sonnet medium; **Opus medium review** of the core API |
| **A1 Harry Styles: plan onto the core** | `src/editor/PlanEditor.tsx`, new `src/editor/plan/use*.ts`, delete `src/editor/usePlanCamera.ts`, `src/lib/planMath.ts` (+test), `src/editor/PlanEditor.css`, the plan checks in `scripts/editor-regression.mjs` | Ariana Grande | Sonnet medium; **Opus medium review** of the diff (drag and keys) |
| **A2 Olivia Rodrigo: plan layers** | `src/editor/PlanEditor.tsx`, new `src/editor/plan/layers/*.tsx`, new `src/editor/plan/chrome/*.tsx`, `src/editor/PlanEditor.css` | Harry Styles (merged) | Sonnet medium |
| **B Ed Sheeran: site onto the core** | `src/editor/SiteEditor.tsx`, `src/editor/SiteEditor.css`, optional new `src/editor/site/*`, `src/lib/site.ts` (+test), the site checks in `scripts/editor-regression.mjs` | Ariana Grande | Sonnet medium |

**Merge order:** Ariana Grande, then Harry Styles and Ed Sheeran in either order, then Olivia Rodrigo. The only file shared after Ariana Grande is `scripts/editor-regression.mjs`, which is split into a `plan` section and a `site` section (§5): Harry Styles edits only the plan section and Ed Sheeran only the site section, so a merge is mechanical. No chunk edits `src/editor/core/*`, `src/lib/polygonEdit.ts` or `src/lib/editorCore.ts` after Ariana Grande. If a chunk finds a core bug, it works around it locally, marks the workaround `// CORE:` and lists it in its report; the merger fixes the core.

Not in scope, for any chunk: `src/three/*` (the hidden-Viewer re-render is a separate fix), `src/store.ts` (`holdUndo` semantics stay), `lib/nudge.ts`, `lib/planHit.ts`, `lib/planKeys.ts`, `lib/boundaryOpening.ts`, `lib/featureWalls.ts`, `lib/canopy.ts`, `components/ContextMenu.tsx`, `components/InspectorCard.tsx`. Do not recolour anything. The raw hex in both editors stays as it is; moving it to tokens is a separate task. New core components use CSS classes and tokens only (docs/brand.md).

---

## 1. Decisions (agents: don't reopen these)

1. **Units: a generic 2D frame.** The core never knows about pixels or metres. It works in the editor's model frame (plan: floorplan image px of one floor; site: world metres, x right, y = world z). Both frames have y pointing down the screen and neither rotates. A `Frame` adapter is built from the camera on every call:
   ```ts
   interface Frame {
     unitsPerPx: number;          // model units per screen px = cam.s
     unitsPerM: number;           // plan: floor.pxPerM; site: 1
     toScreen(p: Pt): Pt;         // model -> element-local screen px
     fromClient(c: { clientX: number; clientY: number }): Pt; // client px -> model
   }
   ```
   Every tolerance is a constant in **screen px**, multiplied by `unitsPerPx` at use. Distances in metres are multiplied by `unitsPerM`.
   - `SNAP_PX = 10` gives the corner, axis and edge-line snap tolerance. Plan: `10 * cam.s` image px, the same as today's `snapTol = px * 10` (PlanEditor.tsx:216). Site: `10 / ppm` m, the same as today's `SNAP_PX * px` (SiteEditor.tsx:71, 178).
   - Plan-only reaches stay as they are, expressed the same way. Fixture wall reach is `max(15 px, 0.1 m)`. An opening snaps to a wall within `25 px` and is placed within `30 px`. The context-menu hit is `10 px` and edge `12 px`.
   - Arrow nudge is `NUDGE_M` / `NUDGE_SHIFT_M` (nudge.ts) times `unitsPerM`.
2. **Camera: `Cam { x, y, s }` (planMath.ts:445) for both editors, drawn as the SVG `viewBox` at rest and as a CSS/SVG transform on one root `<g>` during a gesture.**
   - `x, y` is the model point at the top-left of the element and `s` is model units per screen px. The site's `view { cx, cy, ppm }` is retired.
   - Why viewBox at rest: strokes, handles and text are sized from `s`, so they stay crisp and constant at every zoom, and hit testing stays native.
   - Why a transform during gestures: a pan re-renders nothing (today a 30-move pan costs 76 commits).
   - **Gesture flow:**
     1. Pan, pinch and wheel bursts update a `live` cam in a ref.
     2. Each animation frame writes `transform="matrix(k 0 0 k tx ty)"` with `k = s0/s1` and `t = (x0 - k*x1, y0 - k*y1)` onto the layer `<g>`. This maps the committed cam `c0` to the live `c1`.
     3. The gesture commits `setCam(live)` on pointerup, and for the wheel after `WHEEL_COMMIT_MS = 150` (equal to `STICKY_MS`) of quiet.
     4. The transform is cleared in a `useLayoutEffect` keyed on the committed cam, so there is no frame with a double offset.
     5. Zoom buttons, keys and Fit commit at once.
   - **Things that must sit inside the layer `<g>`:** everything in model units. The site's grid `<rect>` is drawn three viewports wide (`x = vb.x - vb.w`, `w = 3 * vb.w`, and the same for y), so a pan never shows past its edge.
   - **Limits:** plan `minS = pxPerM / 2000`, `maxS = max(imageW / w, imageH / h) * 3` (as usePlanCamera.ts:14-17). Site `minS = 1/400`, `maxS = 1/2` (today's ppm clamp 2..400).
   - **Resize:** the plan keeps the top-left (today). The site keeps the centre (today), through `anchor: "centre"`.
   - **Fit:** both use `fitCamInset(rect, size, coveredRight())`, where `coveredRight()` is `INSPECTOR_INSET` when the enclosing `main` has an `.inspector-card` (usePlanCamera.ts:31-34).
     - Plan home = `roomsRect` (rooms' bbox, else the image), with "show the whole image" as a second fit.
     - Site home = the bbox of boundary, house outlines, house walls and neighbours, expanded by 2 m on every side, with `padFrac 0`. That keeps today's +4 m margin and adds the card inset, which is the one framing change.
     - Fit again when `fitKey` changes (plan: floor id; site: `"site"`, so once).
3. **Pointer capture: on the SVG root, at every primary press that reaches the core.** This is the only capture rule.
   - Primary means `button === 0`, or any touch or pen press. Right button presses are ignored so `contextmenu` still fires.
   - Capture is eager: this is the site's rule, and the plan's lazy capture after the slop (PlanEditor.tsx:538-546) goes.
   - So **native `click` and `dblclick` are never used inside either canvas.**
     - The core synthesises a **tap**: press and release with the same pointer within `CLICK_SLOP_PX = 6`.
     - A **double press** comes from `useDoublePress`: two presses on the same key within `DOUBLE_PRESS_MS = 400` and `DOUBLE_PRESS_PX = 6`.
     - Every `onClick` and `onDoubleClick` on SVG children is removed, and so is `suppressClick`.
   - The core never calls `preventDefault` on pointerdown. The plan's edge-length field (an HTML `div` outside the SVG) must still blur, and so close, when the canvas is pressed.
   - A second pointer (`onPointerDownCapture`) **cancels** the running drag (snapshot restored) and starts a pinch. Today the plan keeps the half-done drag and leaves undo held.
4. **Drag state machine**, in `useDrag`, one per editor.
   - A drag is a `DragSpec` with a string `kind`, generic `data`, and its own `move`, `start`, `end`, `tap` and `cancelled` callbacks, so feature hooks compose without one central switch.
   - States: idle, then pressed (captured, snapshot, `holdUndo(true)` if `undo`), then moving (slop crossed; `moved = true`; `start()` once), then ended or cancelled.
   - `pan` and `pinch` are built-in kinds owned by the core and wired to the camera. A background press runs the editor's `background(press)`: it returns a spec (plan marquee, site rectangle) or `null`, and `null` means pan.
   - `Esc` (window keydown, **capture phase**, `stopImmediatePropagation`, as PlanEditor.tsx:784-793), window `blur`, peek turning on, a mode change, a second pointer and unmount all **cancel**:
     1. restore the snapshot,
     2. reset the camera to `cam0` for a pan,
     3. call `holdUndo(false)`,
     4. release capture,
     5. call `spec.cancelled()`.
   - `pointercancel` and `lostpointercapture` **end** the drag and keep the changes (today's behaviour in both editors).
5. **Undo: one step per drag.** `holdUndo(true)` at the press of every spec with `undo !== false` (the default) and `holdUndo(false)` at end or cancel. Camera kinds, marquee, rectangle drafting and chip taps pass `undo: false`.
   - Snapshot = `{ variants, sites, past, future }` from `useStore.getState()`, restored with `useStore.setState(snapshot)`. This covers both editors, and a cancelled drag leaves no undo entry (the site's `updateSite(() => snap0)` at SiteEditor.tsx:250-255 goes).
   - **rAF coalescing:** `onPointerMove` stores the latest `Move` in a ref and schedules one `requestAnimationFrame`. The rAF callback calls `spec.move` once with the newest move (modifiers included).
     - `pointerup` **flushes** a pending move synchronously before `end`, so the final position is always written.
     - Cancel drops the pending frame.
   - Snap targets and other per-drag lookups (the plan's fixture `others` boxes, PlanEditor.tsx:592-598) are computed **once at press** and kept in `data`.
6. **Keyboard scope stays as it is.** `useEditorKeys(handler)` attaches one window `keydown` listener (bubble phase) that reads the latest handler through a ref. It ignores the event when `keyBelongsElsewhere(e.target, document)` or `useStore.getState().peek`.
   - `InspectorCard` keeps **no** `role="dialog"` (that is why the global dialog check works). Replacing it with key scopes is a separate task.
   - Key order and the `planKeyAction` mapping are unchanged (§3.3).
7. **What the core owns:** the camera, pointers, capture, slop, taps, double presses, undo hold, Esc snapshot, rAF, vertex drag, edge slide, midpoint insert, double-press remove, the locked flag, handle and hit components, dimension chip, status line.
   - **What stays plan-specific:** rooms (fills, labels, knock-through, edge-length typing), free walls (`wallEnd`, `wall`), openings, fixtures (wall snapping, alignment guides, groups, marquee, clipboard), stairs, canopies (`canopy`, `canopyCorner`: rectangles, no midpoint or remove), tools (draw, measure, calibrate, place), the context menu, the image three-state, and Build/Decorate/Furnish.
   - **What stays site-specific:** boundary edge kinds and the opening `slideFor`, surface corners carried by `moveBoundaryCorner`, surfaces and neighbours (`move` with the Shift axis lock, the `rect` draw), clearances, north arrow, scale bar, Plot inspector.
8. **Deliberate unifications.** These are the only behaviour changes; everything else is parity:

   | Behaviour | Plan today | Site today | Both after |
   |---|---|---|---|
   | Esc during a drag | restores every drag | restores the edge drag only | restores every drag |
   | Midpoint `+` | click inserts, no drag | press inserts and drags | press inserts and drags; a tap just inserts |
   | Remove a corner | native dblclick (OS interval) | own detector, 350 ms | `useDoublePress`, 400 ms / 6 px |
   | Fixture double-click turns 90° | native dblclick | n/a | `useDoublePress` |
   | Pan start | 6 px slop | immediate (3 px for "moved") | 6 px slop |
   | Fit | inset for the card | no inset | inset for the card |
   | Second finger mid-drag | keeps the drag, undo stays held | starts a pinch | cancels the drag, then pinches |
   | Window blur mid-drag | nothing | nothing | cancels |

   Deliberate differences kept as options:
   - `snapAxis`: plan true; site false, so the site keeps corner-only snapping.
   - Hit and handle sizes, as today (§2.6).
   - Zoom limits and the resize anchor.

---

## 2. The core API

Pure maths in `src/lib/` (unit-tested; no React, no DOM), hooks and components in `src/editor/core/`. `Cam`, `Rect`, `Size`, `fitCamInset`, `pinchCam`, `zoomCam`, `panCam`, `INSPECTOR_INSET` stay in `planMath.ts` and the core imports them.

### 2.1 `src/lib/polygonEdit.ts` (merges planMath.ts:104-137, 709-756 and site.ts:497-529)
```ts
export const SNAP_PX = 10;
export interface SnapResult { p: Pt; kind: "corner" | "axis" | "none" }
/** Nearest target within tol; else (axis !== false) line up x and y separately with the nearest targets; skip(q, k) drops a target. */
export function snapPoint(p: Pt, targets: readonly Pt[], tol: number, opts?: { axis?: boolean; skip?: (q: Pt, k: number) => boolean }): SnapResult;
/** Unit normal of edge i (vertex i to i+1) pointing OUT of the polygon, whichever way it winds; null for a zero-length edge. */
export function outwardNormal(poly: readonly Pt[], i: number): Pt | null;
/** Component of delta along edge i's outward normal (0 for a zero-length edge). */
export function edgeOffset(poly: readonly Pt[], i: number, delta: Pt): number;
/** Move edge i by offset along its outward normal; both ends move, neighbours stretch. Copies every point (extra fields kept). */
export function slideEdge<P extends Pt>(poly: readonly P[], i: number, offset: number): P[];
/** Snap offset so the slid edge's line passes through the nearest target within tol (strict <, first wins on ties). */
export function snapEdgeOffset(poly: readonly Pt[], i: number, offset: number, targets: readonly Pt[], tol: number): number;
export const midpointOf: (poly: readonly Pt[], i: number) => Pt;
/** Insert p after vertex i (the new vertex is i + 1). */
export function insertVertex<P extends Pt>(poly: readonly P[], i: number, p: P): P[];
/** Remove vertex i, or null when that would leave fewer than min (default 3). */
export function removeVertex<P extends Pt>(poly: readonly P[], i: number, min?: number): P[] | null;
export function moveVertex<P extends Pt>(poly: readonly P[], i: number, p: Pt): P[];
/** Shift lock for a whole-shape move: keep only the axis the pointer travelled further along (site `move`). */
export function lockToAxis(d: Pt): Pt;
/** Shift lock for a segment move: keep only the part of d along the segment's normal (plan `wall`). */
export function lockToNormal(d: Pt, a: Pt, b: Pt): Pt;
```
Conventions settled here:
- **Outward normal** in both editors (the plan's current meaning). The site's left-hand `edgeNormal` goes, and its test signs flip in Chunk B.
- `<` on snap ties (the plan's rule).
- Zero-length edges return an unchanged copy.

### 2.2 `src/lib/editorCore.ts` (pure helpers for the hooks)
```ts
export const CLICK_SLOP_PX = 6, DOUBLE_PRESS_MS = 400, DOUBLE_PRESS_PX = 6, WHEEL_COMMIT_MS = 150, ZOOM_STEP = 1.4;
export const pastSlop = (a: Pt, b: Pt, slop = CLICK_SLOP_PX) => Math.hypot(b.x - a.x, b.y - a.y) >= slop;
export interface PressRecord { key: string; at: number; x: number; y: number }   // client px, ms (e.timeStamp)
export function isDoublePress(last: PressRecord | null, next: PressRecord, ms?: number, px?: number): boolean;
export function liveTransform(committed: Cam, live: Cam): string;               // "matrix(k 0 0 k tx ty)"; "" when equal
export function clampScale(c: Cam, minS: number, maxS: number, about: Pt): Cam; // keeps the model point under `about`
export function resizeCam(c: Cam, from: Size, to: Size, anchor: "topLeft" | "centre"): Cam;
export const wheelZoomFactor = (dy: number, ctrl: boolean) => Math.exp(-dy * (ctrl ? 0.01 : 0.0015));
export function frameOf(cam: Cam, rect: { left: number; top: number }, unitsPerM: number): Frame;
```

### 2.3 `src/editor/core/useCanvasCamera.ts`
```ts
export interface CameraOptions {
  home: Rect; fitKey: string; unitsPerM: number;
  limits: (size: Size) => { minS: number; maxS: number };
  anchor?: "topLeft" | "centre";            // default topLeft
  insetRight?: () => number;                // default: INSPECTOR_INSET when closest("main") has .inspector-card
}
export interface CanvasCamera {
  size: Size | null; cam: Cam | null;       // committed (React state)
  px: number;                               // committed cam.s, 1 before the first fit
  viewBox: string;                          // committed
  layerRef: RefObject<SVGGElement | null>;  // root <g> that takes the live transform
  frame(): Frame;                           // from the LIVE cam: use for every pointer conversion
  fit(r?: Rect): void; zoomBy(factor: number, at?: Pt): void; setCam(c: Cam): void;
  gesture: { begin(): void; update(c: Cam): void; commit(): void; cancel(): void };
}
export function useCanvasCamera(el: RefObject<HTMLElement | null>, o: CameraOptions): CanvasCamera;
```
- A ResizeObserver ignores 0×0, so the hidden state is handled (usePlanCamera.ts:20-28).
- Fit runs once a size exists and again on each `fitKey` change.
- The wheel listener is native and non-passive, with `wheelClassifier()` per element.
  - Pan intent: `update(panCam(live, -dx, -dy))`.
  - Zoom intent: `update(zoomCam(live, at, wheelZoomFactor(dy, e.ctrlKey), minS, maxS))`, where `at` is element-local.
  - Either way the gesture commits after `WHEEL_COMMIT_MS` of quiet.
- `zoomBy` without `at` zooms about the element centre.

### 2.4 `src/editor/core/useDrag.ts`
```ts
export interface Press { pointerId: number; pointerType: string; client: Pt; local: Pt; at: Pt; time: number; shift: boolean; alt: boolean; mod: boolean }
export interface Move { client: Pt; local: Pt; at: Pt; delta: Pt; screen: Pt; shift: boolean; alt: boolean; mod: boolean } // delta: model units since press; screen: px since press
export interface DragSpec<K extends string = string, D = unknown> {
  kind: K; data: D;
  undo?: boolean;                 // default true: holdUndo + snapshot
  slop?: number;                  // default CLICK_SLOP_PX; 0 moves from the first event
  start?(d: ActiveDrag<K, D>): void;
  move?(m: Move, d: ActiveDrag<K, D>): void;   // at most once per frame
  end?(m: Move, d: ActiveDrag<K, D>): void;    // after a real drag
  tap?(m: Move, d: ActiveDrag<K, D>): void;    // released within slop
  cancelled?(d: ActiveDrag<K, D>): void;       // after the snapshot is restored
}
export type ActiveDrag<K extends string = string, D = unknown> = DragSpec<K, D> & { press: Press; moved: boolean };
export interface DragOptions {
  svg: RefObject<SVGSVGElement | null>; camera: CanvasCamera;
  background(p: Press): DragSpec | null;  // null = pan
  backgroundTap?(m: Move): void;          // a pan released within slop
  hover?(m: Move | null): void;           // pointer moves with no press (null on leave)
  disabled?(): boolean;                   // e.g. peek: presses are ignored
}
export interface DragApi {
  begin(e: React.PointerEvent, spec: DragSpec): void;      // stopPropagation, capture, snapshot, holdUndo
  beginPan(e: React.PointerEvent, opts?: { tap?: (m: Move) => void }): void;
  cancel(): boolean;                                       // false when nothing cancellable runs
  active(): ActiveDrag | null;                             // ref read, no render
  kind: string | null;                                     // React state set on start/end only (status lines, stairs highlight)
  svgProps: Pick<React.SVGProps<SVGSVGElement>, "onPointerDownCapture" | "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture" | "onPointerLeave">;
}
export function useDrag(o: DragOptions): DragApi;
```
- **Pointers:** a `pointers` map is kept for the pinch. A mouse press clears stale entries (PlanEditor.tsx:512).
- **Pinch:** at two pointers, `gesture.begin()` and `pinchCam(c0, m0, m1, d0, d1, minS, maxS)` per frame. The pinch ends when fewer than two pointers remain.
- **Pan:** `panCam(cam0, screen.x, screen.y)` after the slop.
- **Leaving the canvas:** `onPointerLeave` calls `hover(null)` only; capture keeps the drag.
- **Mode, peek, unmount:** editors call `cancel()` from their mode and peek effects; unmount cancels and calls `holdUndo(false)`.

### 2.5 `src/editor/core/useDoublePress.ts` and `usePolygonEdit.ts`
```ts
export function useDoublePress(): (key: string, e: React.PointerEvent) => boolean; // true on the second press; then forgets
export interface PolygonTarget<C = unknown> {
  key: string;                         // "room:<id>", "boundary", "surface:<id>", "neighbour:<id>"
  poly: readonly Pt[];
  locked?: boolean;                    // locked: presses select only, no drag, no insert, no remove
  minVertices?: number;                // default 3
  snapAxis?: boolean;                  // default true
  snapTargets(ex: { vertex?: number; edge?: number }): Pt[];   // called once at press
  skipSnap?(q: Pt, vertex: number): boolean;
  slides?(vertex: number): boolean;    // constrained corner: no snapping, moveVertex applies the constraint
  moveVertex(i: number, p: Pt): void;
  edgeBegin?(i: number): C;            // context kept for the drag (plan: openings on the edge)
  setEdge(i: number, next: Pt[], shift: Pt, ctx: C): void;
  insertVertex(i: number, p: Pt): void;   // new vertex is i + 1
  removeVertex(i: number): void;
  pickVertex?(i: number | null): void;    // plan activeCorner, site sel.vertex
}
export function usePolygonEdit(drag: DragApi, camera: CanvasCamera, dbl: ReturnType<typeof useDoublePress>): {
  vertexDown(e: React.PointerEvent, t: PolygonTarget, i: number): void;
  edgeDown(e: React.PointerEvent, t: PolygonTarget, i: number): void;
  midDown(e: React.PointerEvent, t: PolygonTarget, i: number): void;
};
```
- **`vertexDown`:**
  - On a double press of `${t.key}#${i}`, it calls `removeVertex(i)` when `poly.length > minVertices` and the target is not locked, and starts no drag (today SiteEditor.tsx:333-350).
  - Otherwise it calls `pickVertex(i)` and begins kind `"poly-vertex"`. Each move takes `p = m.at`.
  - Unless Alt is held or `slides(i)` is true, `p` is snapped: `snapPoint(p, targets, SNAP_PX * unitsPerPx, { axis: snapAxis, skip })`.
  - Then it calls `moveVertex(i, p)`.
- **`edgeDown`:** begins kind `"poly-edge"` with `poly0` and `ctx = edgeBegin(i)`.
  - Move: `off = edgeOffset(poly0, i, m.delta)`. Unless Alt is held, `off = snapEdgeOffset(poly0, i, off, targets, tol)`.
  - Then `setEdge(i, slideEdge(poly0, i, off), n * off, ctx)`, where `n` is the outward normal.
- **`midDown`:** calls `insertVertex(i, midpointOf(poly, i))` and `pickVertex(i + 1)`, then continues as a `"poly-vertex"` drag of `i + 1` in the **same** undo step and snapshot. Esc removes the new corner again.
- **Shift:** no constraint on vertex or edge drags (none today). Shift locks are per kind: plan `wall` uses `lockToNormal`, site `move` uses `lockToAxis`.
- **Alt:** turns off every snap in both editors.

### 2.6 Shared SVG components: `src/editor/core/components.tsx` (+ `core.css`)
All sizes are in **screen px** and multiplied by `px` inside the component. Hit areas are transparent, and the visible shape has `pointer-events: none`.
- `Handle`: `{ at: Pt; px: number; r: number; hit: number; className?: string; fill?: string; ink?: string; sw?: number; style?; title?: string; onPointerDown }`.
  - Plan sizes: selected `r 6`, `hit 8`; others `r 3.6`, `hit 6`; strokes `1.25 × (2 | 1.3)`.
  - Site sizes: `r 6`, `hit 12`, stroke 1.5.
  - Class names stay: `plan-handle`, `site-handle`, `active`.
- `MidpointHandle`: `{ a; b; px; r; hit; plus?: boolean; className?; title?; onPointerDown }`.
  - Plan: `r 3.6`, `hit 6`, class `plan-handle add`, title "Add a corner here".
  - Site: `r 5`, `hit 9`, `plus`, class `site-mid`.
- `EdgeHit`: `{ a; b; px; width: number; className?; title?; onPointerDown }`.
  - Plan room edge: `width 10`, class `plan-edge-hit`, title "Drag to move the wall".
  - Site surface edge: `width 10`, class `site-edge-hit`.
  - The site's **boundary** edges keep their own `<g>` (§6).
- `DimensionChip`: `{ at: Pt; text: string; px: number; fontSize: number; className?; title?; onPointerDown? }`. It is horizontal and sized by planMath's `chipSize` formula (PlanEditor.tsx:2132). The plan uses it for `EdgeLabels` and the site for the selected-edge length.
- `StatusLine`: `{ className: "plan-status" | "site-status"; children }`. It renders `<div className={`${className} float-card`} role="status">`.

---

## 3. Migration tables

### 3.1 Drag kinds

**Plan** (`type Drag`, PlanEditor.tsx:87-106; handlers 548-704, 1395-1820):

| Kind or gesture | Today | After | Notes |
|---|---|---|---|
| `corner` | Handle press, 1794; move 680-688 | `usePolygonEdit.vertexDown`, room target | `pickVertex` sets `activeCorner`; the press also calls `select({room})` |
| corner dblclick | `onDoubleClick`, 1797 | core double press | keeps `removeCorner(r, i)` (wallFinishes), min 3, not when locked |
| midpoint click | `onClick`, 1765 | `usePolygonEdit.midDown` | `insertCorner(r, i, m)` keeps wallFinishes; press inserts and drags |
| `edge` | 1682-1697; move 648-667 | `usePolygonEdit.edgeDown` | `edgeBegin` = `openingsOnEdge(floor, id, i, EXT_WALL_T/2*ppm)`; `setEdge` writes polygon and openings in one `updateFloor`; targets = other rooms' corners and wall ends |
| `wallEnd` | 1650; move 642-646 | plan spec in `usePlanDrag` | `snapPoint` from polygonEdit, axis on, skip the end itself |
| `wall` | 1631; move 668-679 | plan spec | Shift: `lockToNormal`; no Shift and no Alt: `snapShift` (canopy.ts) |
| `fixture` | 1496; move 584-640 | plan spec | `others` cached at press; `tap` with `wasSelected` is `nextUnder` (now in `tap`, was in endPointer 727-732) |
| fixture Shift+click | 1478-1485 | stays in the press handler | toggles groups, begins nothing |
| fixture dblclick | 1501-1508 | `useDoublePress` key `fx:<id>` in the fixture press | turns 90° unless locked; a double press begins no drag |
| `opening` | 1727; move 698-704 | plan spec | press selects |
| `canopy` | 1401; move 690-696 | plan spec | only the selected canopy drags |
| `canopyCorner` | 1818; move 689 | plan spec | `moveCanopyCorner`, core snap |
| `stairs` | 1660-1666; move 697 | plan spec | `stairsActive` is replaced by `drag.kind === "stairs"`; the window `pointerup` listeners go |
| `marquee` | 527-533, 561-569, 733-739 | `background()` spec, `undo: false`, `slop` 6 | only when Furnish, Select tool, Shift and a mouse; `end` selects; `cancelled` clears |
| `pan` | 535, 576-585 | core | `backgroundTap` = today's `onClickCanvas` body (823-905) with `m.at`, `m.shift`, `m.alt` |
| `pinch` | 510-521, 572-575 | core | |
| edge chip click | `EdgeLabels`, 2175 | spec `{kind:"chip", undo:false, tap: setEdgeEdit}` | locked rooms: no-op |
| wall hit (unselected) | 1628-1633 | press selects and `stopPropagation` | no pan, as today |

**Site** (`type Drag`, SiteEditor.tsx:52-58; handlers 286-470):

| Kind or gesture | Today | After | Notes |
|---|---|---|---|
| `vertex` | `onVertexDown` 333-350; move 395-407 | `usePolygonEdit.vertexDown` | boundary target: `slides(i)` = `slideFor(sel, i) !== undefined`. `moveVertex` = `slideCorner(st, i, slide, p)` or `moveBoundaryCorner(st, i, p)`. `skipSnap` = coincident with `boundary[i]` at press. `snapAxis: false`. Targets = house outline corners plus every other polygon's corners |
| double press | detector 331-347 | core `useDoublePress` | boundary `removeBoundaryVertex`; others `removeVertex` |
| `edge` | `onItemDown` 322 (boundary, selected); `onEdgeDown` 353-357 (surfaces, neighbours); move 408-425 | `usePolygonEdit.edgeDown` | boundary `setEdge` = `moveBoundaryCorner(moveBoundaryCorner(st, i, next[i]), j, next[j])`; targets as SiteEditor.tsx:414-417 |
| mid | `onMidDown` 358-370 | `usePolygonEdit.midDown` | boundary `insertBoundaryVertex` |
| `move` | `onItemDown` 321; move 426-435 | site spec | Shift: `lockToAxis` |
| item press (not selected) | 323-324: pan with `moved: true` | `select` then `drag.beginPan(e)` with no `tap` | the release must not deselect |
| `pan` | background 311; move 388-392 | core | `backgroundTap` = `setSel(null)` (was `!d.moved`, 448) |
| `rect` | background 305-310; up 449-466 | `background()` spec when the tool isn't Select: `undo: true`, `slop: 0` | move sets `draft` (snapped start and end); `end` and `tap` create (min 0.3 m) and go back to Select; `cancelled` clears `draft` |
| `pinch` | 286-292, 377-386 | core | |

### 3.2 Plan `useState`s and refs

| State (PlanEditor.tsx line) | Goes to |
|---|---|
| `tool` 143, `calib` 144, `draft` 145, `hover` 146, `altHeld` 147, `measure` 148, `placing` 167 | `plan/usePlanTools.ts` (with `pick`, `startPlacing`, the `PLAN_TOOL_EVENT` and `house:place-piece` effects, the mode-change effect 1124-1145) |
| `edgeEdit` 149, `litEdge` 153, `selectedOpeningId` 154, `selectedWallId` 155, `selectedFixtureIds` 157, `hoverGroup` 159, `selectedCanopy` 163, `activeCorner` 165, `roomHint` 171 | `plan/usePlanSelection.ts`: `select()`, `liveIds`, `targetIds`, `removeSelected`, the stale-canopy effect, the room-hint effect |
| `movingWall` 152 | removed: `drag.kind === "poly-edge" \|\| drag.kind === "wall"` |
| `stairsActive` 172 | removed: `drag.kind === "stairs"` |
| `marquee` 161, `guides` 189 | `plan/usePlanDrag.ts` (the plan specs), passed to the Overlays layer |
| `menu` 181 | `plan/usePlanMenu.ts` (`onContextMenu`, `menuItemsFor`) |
| `addOpen` 168 | PlanEditor (the rail and key `A` both need it) |
| `imageOpen` 169 | `plan/chrome/ImageOptions.tsx` (with `imagePop` and its outside-click/Esc effect 1170-1186) |
| `size`, `cam` (usePlanCamera) | `useCanvasCamera` |
| refs `drag`, `pointers`, `suppressClick`, `press0`, `capturedId`, `cancelRef` | core `useDrag` (`suppressClick` is deleted) |
| `keyRef` | core `useEditorKeys` |
| `prevMode`, `pickRef` | `usePlanTools` |

Layers (A2), each `memo`'d and fed only what it draws plus `px`. Pointer handlers come in as stable callbacks from `usePlanDrag` through a ref-backed `useEvent`-style wrapper:
- `layers/Rooms.tsx`: fills, hover outline, labels.
- `layers/Walls.tsx`: thick walls, free walls, end handles.
- `layers/Openings.tsx`
- `layers/Fixtures.tsx`: fixtures, selection and hover boxes.
- `layers/Canopies.tsx`: canopies, labels, corner handles.
- `layers/Handles.tsx`: room corners, midpoints, edge hits, quiet-mode filter.
- `layers/Overlays.tsx`: guides, clearances, marquee, measure, calibrate, drafts, lit edge, edge chips, stairs marker.

Chrome:
- `chrome/PlanStatus.tsx`: uses `StatusLine` and has the "Finish room" button.
- `chrome/PlanZoom.tsx`
- `chrome/ImageOptions.tsx`

### 3.3 Keyboard
- **Plan `onKey` (PlanEditor.tsx:448-491) moves verbatim to `plan/usePlanKeys.ts` on `useEditorKeys`.** Keep this order:
  1. arrows nudge, only when not placing and with the Select tool, through `nudgeSelection(dx*ppm, dy*ppm)`;
  2. Ctrl/⌘C;
  3. Ctrl/⌘V (switches to Furnish);
  4. Ctrl/⌘G and Ctrl/⌘Shift+G;
  5. Ctrl/⌘A (Furnish);
  6. Escape, unless `defaultPrevented`: clears draft, calib and measure, calls `select({})` and stops placing;
  7. Ctrl/⌘D;
  8. `planKeyAction`: tool, rotate (placing or selection), image cycle, zoom ±`ZOOM_STEP`, fit, add;
  9. Delete/Backspace, in Build or Furnish.
- **The capture-phase Esc cancel** moves into the core.
- **Site `onKey` (SiteEditor.tsx:243-277) moves to `useEditorKeys`, in the same order:**
  1. arrows run `nudge` in metres;
  2. Escape clears `sel` and `draft` and goes back to Select (the edge-cancel branch is deleted; the core handles it);
  3. `v`/`r`/`b` pick tools;
  4. `f` fits;
  5. `+`/`=` and `-`/`_` zoom;
  6. Delete/Backspace removes the vertex or the item.

### 3.4 Context menu
The plan only. It moves verbatim into `usePlanMenu`. Every label and hint stays:
- **Empty canvas:** "Paste … here" (Ctrl V), "Fit the rooms" (F), "Hide floorplan image"/"Show floorplan image" (I).
- **Fixture, in Furnish:** "Turn 90°" (R), "Lock"/"Unlock", "Duplicate" (Ctrl D), "Copy" (Ctrl C), "Group" (Ctrl G), "Ungroup" (Ctrl Shift G), "Select group", "Fit to window"/"Refit to recess", "Remove" (Del).
- **Opening, in Build:** "Flip hinge", "Flip swing", "Make it a door|window|gap", "Delete".
- **Wall:** "Decorate this wall" in Decorate; "Add door here", "Add window here", "Delete wall" in Build.
- **Room in Decorate:** "Decorate the floor", "Decorate this wall", "Edit shape in Build".
- **Room otherwise:** "Rename…", "Decorate this room", "Lock shape"/"Unlock shape", "Add door here", "Add window here", "Knock through into…", "Delete room".

A right-click while drawing cancels the shape instead of opening the menu, and it calls `drag.cancel()`. Today it sets `drag.current = null` (PlanEditor.tsx:913-916). The site gets no menu in this refactor.

### 3.5 Status-line strings (keep every one, byte for byte)
- **Plan `statusText` (PlanEditor.tsx:1312-1343):**
  - the canopy, rect, room, door, window, gap, wall, measure, calibrate and three place strings, as they stand;
  - "Drag to move the wall · Esc cancels" while a `poly-edge` or `wall` drag runs;
  - "Right-click a room for more" (`roomHint`).
- **Plan `selectHint`:** the four Info strings at 1344-1351 stay as they are.
- **Site:** "Drag to move the edge · Esc cancels" while a `poly-edge` drag runs (Select tool); "Drag out a rectangle." plus the surface `<select>` when the tool isn't Select. The Info footer text stays as it is.

---

## 4. Chunks

**Chunk 0, Ariana Grande (Sonnet medium). Must not change either editor's behaviour; neither editor imports the core yet.**
1. Write `scripts/editor-regression.mjs` (§5) against the **current** editors and get every check green, before writing the core. Add `"regress:editors": "node scripts/editor-regression.mjs"` to `package.json`.
2. `src/lib/polygonEdit.ts` + `polygonEdit.test.ts` (§5.2), and `src/lib/editorCore.ts` + `editorCore.test.ts`.
3. `src/editor/core/`: `frame.ts` (types), `useCanvasCamera.ts`, `useDrag.ts`, `useDoublePress.ts`, `usePolygonEdit.ts`, `useEditorKeys.ts`, `components.tsx`, `core.css`, `index.ts` (barrel).
4. Verify with `npm run check`, `npm run build` and `npm run regress:editors` (still green; nothing imports the core). Opus review of the core API before merging.

**Chunk A1, Harry Styles (Sonnet medium). Plan onto the core and the hook split. The layers stay inline.**
- **Owns:** `src/editor/PlanEditor.tsx`, new `src/editor/plan/usePlanSelection.ts`, `usePlanDrag.ts`, `usePlanKeys.ts`, `usePlanMenu.ts`, `usePlanTools.ts`, and `PlanEditor.css`.
- **Deletes** `src/editor/usePlanCamera.ts`.
- **In `planMath.ts`:**
  - delete `snapPoint`, `SnapResult`, `edgeNormalOffset`, `slideEdge`, `snapEdgeOffset` and the private `outwardNormal`;
  - add `export { snapPoint, type SnapResult } from "./polygonEdit"`, so `canopy.ts` is untouched;
  - move the matching tests out of `planMath.test.ts`.
- **May touch the plan section** of `scripts/editor-regression.mjs`: flip midpoint to press-and-drag, add the pinch-cancels check and the blur-cancels check.
- **Stays out of:** `SiteEditor*`, `site.ts`, `src/editor/core/*`, `src/lib/polygonEdit.ts`, `src/lib/editorCore.ts`, `App.tsx`. `PlanEditor.tsx` keeps its path and its export, so App's lazy import is unchanged.
- **Target:** `PlanEditor.tsx` under 1,300 lines after A1.

**Chunk A2, Olivia Rodrigo (Sonnet medium), after A1 is merged.** Owns `PlanEditor.tsx`, new `src/editor/plan/layers/*.tsx` and `src/editor/plan/chrome/*.tsx` (§3.2), and `PlanEditor.css`.
- Wrap the model-unit content in the camera's `layerRef` `<g>`.
- Memoise the layers and keep the handlers stable.
- **Target:** `PlanEditor.tsx` composition only, at about 400 lines.
- **Perf acceptance:** with the script's `--perf` flag, a 40-move corner drag gives ≤ 41 store writes (no worse than today), and a 30-move pan gives 0 React commits of the rooms layer (React Profiler `onRender` counter on `Rooms`, dev only).

**Chunk B, Ed Sheeran (Sonnet medium), in parallel with A1 and A2.**
- **Owns:** `src/editor/SiteEditor.tsx`, `SiteEditor.css`, optional `src/editor/site/*` (for example `useSiteKeys.ts`, `SiteLayers.tsx`), and `src/lib/site.ts` + `site.test.ts`.
- **In `site.ts`:** delete `edgeNormal`, `slideEdge` and `snapEdgeOffset`, and move their tests to `polygonEdit.test.ts`. That test file is Ariana Grande's, so add the site cases as a separate `site-polygonEdit.test.ts` instead.
- **May touch the site section** of `scripts/editor-regression.mjs`: add the vertex Esc-cancel check, the pan-slop check and the fit-inset check.
- **Stays out of:** `PlanEditor*`, `src/editor/plan/*`, `planMath.ts`, `src/editor/core/*`, `src/lib/polygonEdit.ts`, `src/lib/editorCore.ts`.
- **Done when:**
  - `SiteEditor.tsx` holds no pointer, camera or wheel code of its own;
  - its `SitePlan` is under 450 lines;
  - the Plot `Inspector`, `OpeningWidth`, `FollowGround` and `Clearances` are untouched.

Each agent:
- works in its own worktree and symlinks node_modules (CLAUDE.md);
- runs `npm run check`, `npm run build` and `npm run regress:editors` (with `npx vite --port 5199` running in that worktree);
- ends commits with the session trailer the merger gives it.

---

## 5. Acceptance checks

### 5.1 `scripts/editor-regression.mjs`
**Usage.** `node scripts/editor-regression.mjs [--url http://localhost:5199] [--only plan|site] [--perf]`, with `npx vite --port 5199` running.

**Browser setup.**
- Playwright comes from `/opt/node22/lib/node_modules` through `createRequire`, as in `scripts/screenshots.mjs`.
- Launch with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, at a 1500×900 viewport.
- Before `goto`, an `addInitScript` sets `localStorage["house-modeler-panels"]` to `{"state":{"coachDone":true,"quiet":true},"version":0}`.

**Setup per suite.**
1. `await page.evaluate(async () => (await import("/src/lib/presetActions.ts")).loadListing("current"))`.
2. Then through `window.__houseStore`:
   - plan suite: `setState({ tab: "plan", editFloorId: <ground floor id> })` and `getState().setMode("build")`;
   - site suite: `getState().setMode("plot")` with `tab: "plan"` (App switches `editFloorId` to `"site"`).
3. Wait for `.plan-canvas svg` or `.site-canvas svg`.

**Helpers.**
- `toClient(p)`: model to client through `svg.getScreenCTM()` and `createSVGPoint`. It works before and after A2, because the layer transform is identity at rest.
- `floor()` and `site()` read the store.
- `steps(from, to, n)` issues `mouse.move` n times.
- `check(name, fn)` prints `PASS|FAIL name detail` and sets the exit code.
- Every drag uses `mouse.down`, 10 moves, then `mouse.up`. Snap-sensitive drags hold `Alt` (`keyboard.down("Alt")`).
- `past.length` is read before and after every edit.

**Fixtures chosen by the script, never hard-coded:**
- the first room of the ground floor with four corners;
- an opening that lies on one of that room's axis-aligned edges (the same test as `openingsOnEdge`, re-implemented in the script);
- the first fixture;
- a background point: the canvas top-left plus 30 px, asserted to be outside every room.

**Plan suite (current behaviour; A1 changes only where marked):**
1. **fit**: press `F`; every room vertex lies inside the viewBox, and the right-most one is left of the `.inspector-card` client rect.
2. **pan**: drag the background (90, 40) px. viewBox x and y change by `-(90, 40) * s` (± s). `variants` are unchanged (JSON equal) and so is `past.length`.
3. **wheel zoom**: `mouse.wheel(0, -100)` at the room centre. The viewBox width shrinks, and the model point under the cursor stays within 1 screen px.
4. **select and hint**: tap the room interior. `selectedRoomId` equals the room, and `.plan-status` reads "Right-click a room for more".
5. **corner drag**: drag vertex 0 by (30, 20) px with Alt. The vertex moves by `(30, 20) * s` (± s), `past.length` is +1, one `undo()` restores the polygon exactly, and `redo()` reapplies it.
6. **snap**: drag vertex 0 to 5 px from a corner of another room, without Alt. The vertex equals that corner exactly.
7. **Esc cancel**: press vertex 0, move 40 px, press `Escape`, then release. The polygon is unchanged, `past.length` is unchanged, and the room stays selected.
8. **edge slide**: on the opening's edge, press at 25 % along the edge (clear of the midpoint) and drag 40 px along the outward normal with Alt.
   - Both edge corners shift by the same `offset * n`, and the other corners are unchanged.
   - The opening moves by the same vector.
   - `.plan-status` reads "Drag to move the wall · Esc cancels" mid-drag.
   - There is one undo step.
9. **midpoint insert**: tap the midpoint handle of edge 1. The corner count is +1 and the new corner is at the old midpoint (± 0.5). One undo restores it. *(A1 adds: press the midpoint and drag 20 px; the new corner ends 20 px away; Esc removes it.)*
10. **double-press remove**: `mouse.dblclick` on the new corner. The corner count is -1. On a 3-corner polygon (made with `updateRoom` in setup), nothing is removed.
11. **edge-length typing**: tap the `.plan-edge-label` of edge 0. A focused `.edge-input input` appears. Type `3` and Enter, and the edge length is 3.00 m (± 0.005).
12. **keyboard nudge**: tap vertex 0, then `ArrowRight` gives x + `0.01 * ppm` and `Shift+ArrowRight` gives + `0.1 * ppm`. With focus in an inspector `input`, `ArrowRight` changes nothing.
13. **knock-through**: Shift+tap a neighbouring room. A `[role="dialog"]` appears. Cancel it, and `variants` are unchanged.
14. **opening drag**: switch to the select tool, press the `.plan-opening` and drag 30 px along its orientation. The along-coordinate changes, the perpendicular one stays within 1 image px, and there is one undo step.
15. **stairs** (only if `floor.stairs`): drag the marker 20 px. `stairs.x` changes and there is one undo step.
16. **context menu**: right-click the room. `.ctx-menu` lists "Rename…" and "Delete room", and Escape closes it. Right-click the background and it lists "Fit the rooms".
17. **image three-state**: press `I` three times. `planImage` goes through the cycle `imageStateOf` gives (off, faint, trace) and comes back.
18. **quiet handles**: with nothing hovered, the count of corner handles (`.plan-handle:not(.add)` outside wall groups) equals the selected room's corner count.
19. **Furnish marquee**: `setMode("furnish")`, then Shift+drag a rectangle around the first fixture. Press `Delete`, and the fixtures removed equal `expandToGroups(fixturesInRect(...))`, computed in the page from `/src/lib/fixtureGroups.ts`. Then undo.
20. **fixture move**: drag the fixture 40 px right with Alt. x is + `40 * s` (± s) and there is one undo step.
21. **fixture rotate**: tap it and press `R` for rot + 90 (mod 360). `dblclick` gives a further + 90.
22. **pinch** (separate context with `hasTouch`): two CDP `Input.dispatchTouchEvent` touches spread from 100 px to 200 px apart. The viewBox width halves (± 10 %).
23. *(A1 adds)* **blur cancels**: press a corner, move, `page.evaluate(() => window.dispatchEvent(new Event("blur")))`, release. Nothing changed.

**Site suite:**
1. **fit**: press `F`; every boundary vertex is inside the viewBox. *(B adds: and left of the `.inspector-card`.)*
2. **pan**: as plan 2.
3. **wheel zoom**: as plan 3.
4. **select edge**: tap the hit line of boundary edge 0, and its `<g>` gets `.site-edge-sel`.
5. **corner drag and carried surfaces**: drag a boundary vertex 30 px with Alt held off and no snap target near. Pick a vertex that a surface corner shares (search in the script); if there is none, add a surface touching it in setup. The surface corner moves with it, and there is one undo step.
6. **edge slide**: with edge 0 selected, drag it 40 px along its normal. Both ends move by the same vector, and Esc mid-drag restores the site exactly with `past.length` unchanged. *(B adds: Esc during a vertex drag restores too.)*
7. **midpoint insert**: press `.site-mid` of edge 0 and drag 20 px. The boundary has one more vertex, and it sits at mid + 20 px. One undo removes it.
8. **double-press remove**: `dblclick` the new `.site-handle`. The count is -1.
9. **slideFor**: in setup, set edge 1 to `{ kind: "open", height: 0 }`, select it and drag its first corner 30 px off-line. The corner stays collinear with its previous wall (cross product < 1e-6 × length²).
10. **rectangle**: press `R` and drag 80×60 px. `surfaces` grows by one, with 4 corners spanning about `(80, 60) / ppm` m, and the tool returns to Select.
11. **move with Shift**: tap the new surface, then Shift+drag (50, 10) px. Every corner moves by (50/ppm, 0).
12. **nudge and delete**: tap a surface corner. `ArrowRight` gives x + 0.01 m, and `Delete` removes the corner.

### 5.2 Unit tests: `src/lib/polygonEdit.test.ts` (Chunk 0)
- **snapPoint:**
  - corner beats axis;
  - x and y snap separately to different targets;
  - none outside tol;
  - `axis: false` gives corner or none only;
  - `skip` drops targets;
  - the plan's three existing cases (planMath.test.ts:123-125) unchanged.
- **outwardNormal:** points out for clockwise and anticlockwise squares and a triangle; null for a zero-length edge.
- **edgeOffset:** projects onto that normal.
- **slideEdge:**
  - moves exactly i and i+1;
  - a positive offset grows the area, for both windings;
  - copies (input not mutated) and keeps extra fields;
  - a zero-length edge gives an unchanged copy;
  - fewer than 3 points gives a copy.
- **snapEdgeOffset:** snaps to the nearest target line within tol, keeps the offset outside it, and the first target wins a tie; ports of planMath.test.ts:495-496 and site.test.ts:267-268 with signs for the outward normal.
- **insertVertex, removeVertex, moveVertex:** indices and wrap-around; `removeVertex` returns null at `min`.
- **lockToAxis, lockToNormal:** the dominant axis; the projection onto a diagonal wall's normal.

`src/lib/editorCore.test.ts`:
- `isDoublePress`: same key inside 400 ms and 6 px; other key, too late or too far all fail.
- `liveTransform`: maps `c0`-frame points to where `c1` shows them; identity gives `""`.
- `resizeCam`: both anchors.
- `clampScale`: keeps the point under `about`.
- `frameOf`: round-trips `toScreen` against `fromClient`.

---

## 6. Risks and what not to change
- **Snapping rules.**
  - The plan corner snap is corner, then axis, against room corners and wall ends only. Measure snaps also take fixture corners (`snapMeasure`, PlanEditor.tsx:797).
  - The site snap is corner-only and includes the house outline corners.
  - Alt frees every snap. Wall drag: Shift slides along the normal *and* disables snapping (PlanEditor.tsx:677).
- **`keyBelongsElsewhere`** stays global, including the `[role="dialog"]` check. Do not add `role="dialog"` to `InspectorCard`, or every editor key dies while the card is open.
- **The stairs drag:** `StairsMarker` keeps its own hit shape, and `interactive` is Build plus the Select tool only. Its highlight now comes from `drag.kind`. Check that pointer leave mid-drag does not end it (capture).
- **Knock-through Shift+click** lives in `backgroundTap`, so it needs `m.shift` from the *press* or the release. Use the release, as `click` does today. Locked rooms are excluded from "Knock through into…" only, as now.
- **`planImage` three-state:** `imageStateOf` / `imageForState` (planMath.ts:503-517). `I` cycles off, faint, trace. "Show/Hide floorplan image" in the menu toggles `show` only. The faint state clips to `imageClipRect`. Trace hides Storey's room labels.
- **Quiet mode:** corner handles are drawn only for the selected and the hovered room (PlanEditor.tsx:1745). Midpoint handles and edge hits only for the selected, unlocked room.
- **Site `slideFor`:** only the two corners of a *selected open* edge slide. Sliding corners never snap. Nudging a sliding corner also uses `slideCorner` (SiteEditor.tsx:225-231).
- **Boundary vertex moves always go through `moveBoundaryCorner`:** drag, edge slide (twice) and nudge. That way surface corners that met the boundary go along. The `skipAt` rule keeps those carried corners from snapping the vertex back.
- **The `.site-edge` hit group:** each boundary edge is one `<g>` holding a 16 px transparent line, the selection glow and the `.site-edge.edge-<kind>` line (styled in SiteEditor.css:16-20). Keep that structure and its class names, and do not swap it for `EdgeHit`. Pressing an unselected edge selects it and pans; pressing the selected one slides it.
- **`edgeEdit` click-to-type:**
  - Chips hide below 30 px of edge and for the edge being edited.
  - The HTML field is pinned where it opened and closes on blur.
  - Taps on chips must not start a pan.
  - Locked rooms open nothing.
- **The first-selection hint:** `roomHintShown` is module-level, once per page load, for 5 s, and only while a room is selected.
- **Mode change and peek** both cancel the drag, clear the marquee and hover group, and close the menu. Peek ignores all pointer input (`disabled`) and keys (the `peek` gate).
- **Fixture press order:** Shift (no Ctrl) toggles the group. Ctrl/⌘ picks the item alone. A locked item selects but never drags; its press falls through to pan (PlanEditor.tsx:1490-1492). Keep the fall-through by *not* calling `begin` for locked items.
- **Placing and drawing tools:** `hover` follows the mouse only for drawing tools and place, never in Select. Through the core's `hover`, it must not re-render in Select (today 3 commits per 30 moves).
- **Undo hold leaks:** every path that ends a press must reach `holdUndo(false)`, or the next edit joins the wrong step. The paths are up, cancel, lost capture, Esc, blur, peek, mode change, right-click and unmount.
- **Don't touch** the 3D view, `store.ts`, `holdUndo`'s semantics, `nudge.ts`, `planKeys.ts`, `planHit.ts`, `boundaryOpening.ts`, `featureWalls.ts`, `canopy.ts`, `ContextMenu.tsx` or `InspectorCard.tsx`. Leave colours and copy alone, and add no new strings except the test names.
