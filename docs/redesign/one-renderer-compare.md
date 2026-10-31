# One renderer for every compare mode

Status: proposal, not started. Written 31 Oct 2026. Source findings: PERF5 (its long-term fix, rated L by the verifier), PERF7, B9 (review-2026-10, context loss), review-2026-10's "Compare modes mount separate WebGL contexts" item; touches CODE1, CODE4, UX2 (quick wins assumed landed).

## Why (the problem, with numbers and evidence)

- **Each compare mode is its own set of Viewers, and each Viewer owns a `<Canvas>`** (`src/three/Viewer.tsx`, `ViewerImpl`, the `<Canvas key={canvasKey} …>` block). App.tsx has four branches on `effectiveViewMode` (`single`, `side-by-side`, `overlay`, `wipe`, App.tsx:204-270). Every switch unmounts one branch and mounts another, so contexts are thrown away and built again.
- **Wipe draws two full canvases.** `WipeCompare` (`src/three/WipeCompare.tsx`) stacks two `<Viewer>`s at full size and clips the top one with CSS (`.wipe-top { clip-path: inset(0 0 0 calc(var(--wipe) * 100%)) }`, `Wipe.css`). Every frame shades 2× the canvas pixels, and the hidden half of each is wasted.
- **Side by side** mounts two Viewers (App.tsx:219-239), each with its own context.
- **What one context costs** (review 2026-11, scene traversal of listing 91770873): 194 meshes, 162 materials, 54-92 shader programs, 41k triangles, **43 textures, 12.7 Mpx, about 65 MB of GPU memory with mips**. Two contexts hold two copies, although the JS objects are shared: `textures.ts` caches materials and canvases at module level (`materials`, `heightMaps`, `floorMaps` maps, `getMaterial`), so the second copy is pure duplication in the driver.
- **Drawing buffers double too.** Estimate at 1440x900, DPR 1.5 (2160x1350, 2.9 Mpx): colour + depth/stencil with r3f's default 4x MSAA is about 105 MB per context; wipe at HEAD holds about 210 MB of buffers. (Estimate; ANGLE and drivers vary. Chunk G measures it.)
- **Per-context extras:** each Viewer has its own sun shadow map (`SHADOW_MAP = { high: 4096, balanced: 2048, low: 1024 }`, Lighting.tsx:22; a 4096 depth map is about 64 MB) and, on High, its own `EffectComposer` + N8AO (`Effects.tsx`) with its own offscreen precompile (`Precompile … offscreen`, frameLoop.tsx).
- **Switching costs a cold start**: new context, `Precompile` recompiles 54-92 programs behind "Preparing the 3D view", every texture re-uploads. B9 counted **six contexts created in one session** of switching compare modes; iOS Safari kills a tab or loses contexts well before desktop does.
- **Linked cameras are a bus between contexts** (`cameraLink.ts`, `publishPose`/`subscribePose`; Orbit's `applying`, `dropMomentum` and "two linked views coasting would hand the camera back and forth" comments, Viewer.tsx). One renderer with one camera removes the problem rather than managing it.
- **PERF7:** `DPR.high = [1, 1.5]` and `DPR.balanced = [1, 1.5]` (Viewer.tsx, `const DPR`). A 1440x900 @2x laptop draws 2.9 Mpx through the composer while orbiting. Verifier: the "7 frames vs 18" figure is SwiftShader; r3f's `PerformanceMonitor` fits badly with `frameloop="demand"`; drop DPR during camera motion only, and measure on a real laptop.

## Goal and non-goals

Goal:
- One `<Canvas>`, one WebGL context, for the whole life of the 3D view: single, overlay, wipe and side by side are **layouts of panes** inside it, and switching between them never creates a context, compiles a material twice or re-uploads a texture.
- Wipe shades 1× the canvas, not 2×; side by side shades 1× in total.
- Everything that works in compare today keeps working: linked camera, picking rooms and walls in either half, labels, Measure, sun study, snapshots, saved-view shots, Render (path tracer), GLB export, High post-processing, context-loss recovery, demand frame loop.
- PERF7: DPR steps down to 1 while the camera moves and back when still, without breaking the demand loop.

Non-goals:
- No change to what the compare modes look like or to the LayoutSwitch (UX2 quick win owns that).
- No new compare modes (no vertical wipe, no slider on overlay).
- No change to the plan editors (SVG, no WebGL).
- Not reducing materials or shadow casters (PERF8, refuted as a problem).

## Decisions already made (by the owner; do not reopen)

1. The phone is for showing, walking and measuring plus light Decorate and Furnish; Build, Electrics, Garden and Plot are view-only there.
2. Devices that matter: iPhone 390x844 and laptop/desktop 1440x900, 1920x1080. iPad must keep working, not optimised for.
3. Full-bleed canvas with floating chrome everywhere; same brand (docs/brand.md); no Glass look.
4. Quick wins are being built now; this redesign is a spec for later.
- From the brief for this job: on the phone, compare is **wipe only, at DPR 1**.

## Assumptions (including which quick wins have landed)

- **Landed:** Glass removed; full-bleed canvas on every chassis; floating top-bar islands with `--float-top` under them.
- **Landed:** LayoutSwitch is As listed | Proposed | Compare; a floating Wipe | Side by side | Overlay segment shows under the top row while comparing; the dock Compare popover is gone. `viewMode` in the store keeps its values (`"single" | "wipe" | "side-by-side" | "overlay"`, `VIEW_MODES`, store.ts:478).
- **Landed:** CODE4 — `ViewerImpl` reads showLabels, showCeilings, doorsOpen, maxLevel, showExterior and selectedRoomId from the store; CODE1 — App.tsx's compare branches share one props object. So App passes Viewer little more than `active`, `model(s)`, the pick handlers and the layout.
- **Landed:** quality `'auto'` resolved by one `useQuality()` (phone and tablet balanced, desktop high); balanced DPR 1.25; wipe at DPR 1 on phones (PERF5 short-term fix); no canvas MSAA under the High composer; three.js in its own chunk, path tracer only for Render; App no longer re-renders on drag frames; home camera lower; neighbours darker.
- **Landed:** `lib/chassis.ts` `isCompact` and `canEdit(mode, compact)`; phone dock with 44 px targets, Measure in the dock, compass/home button instead of the view cube on phone; Capture popover (Snapshot, 2x, Render) in the dock.
- `effectiveCompare` (chassis.ts:51) still maps side by side to wipe where `FEATURES[chassis].sideBySide` is false (phone, tablet). If the Overlay segment is still offered on the phone, this spec maps overlay to wipe on phone too (decision "wipe only").
- Builders re-check line numbers: the quick wins move code in Viewer.tsx, App.tsx, Effects.tsx and Lighting.tsx. Names quoted here (`ViewerImpl`, `Orbit`, `ShadowUpdates`, `Precompile`, `CaptureBridge`, `registerCapture`, `lampPoolsOf`, `exposureByRenderer`) are stable.
- r3f 9.7, drei 10.7, three 0.185, postprocessing 6.39 (package.json). r3f `createPortal(children, scene, state)` accepts `camera`, `size` and `events.compute`.

## Design (what the user sees and does)

The visible design hardly changes; the gain is speed, memory and no "Preparing the 3D view" on a switch.

```
HEAD, wipe                               After, wipe
+-----------------------------------+    +-----------------------------------+
| canvas A (As listed), full size   |    | ONE canvas                        |
|  +-----------------------------+  |    |  pane A: viewport = left strip    |
|  | canvas B (Proposed), full   |  |    |  pane B: viewport = right strip   |
|  | size, CSS clip-path right   |  |    |  same projection (setViewOffset), |
|  +-----------------------------+  |    |  one camera, one OrbitControls    |
| 2 contexts, 2x pixels, 2x tex     |    | 1 context, 1x pixels, 1x textures |
+-----------------------------------+    +-----------------------------------+
         divider (DOM) ---^                       divider (DOM) ---^

After, side by side (desktop)            After, single / overlay / walk
+-----------------+-----------------+    +-----------------------------------+
| pane A          | pane B          |    | one pane, full canvas; the other  |
| own aspect,     | own aspect,     |    | scene stays mounted (warm) but is |
| same pose       | same pose       |    | not drawn: Flip and peek are an   |
+-----------------+-----------------+    | instant swap of which scene draws |
                                         +-----------------------------------+
```

**Desktop (1440x900, 1920x1080)**
- Compare → Wipe: the divider appears at 50 %; no loader if Proposed was already warm. Dragging the divider redraws one frame per move (both strips), at the same cost as one orbit frame.
- Wipe → Side by side → Overlay → single: instant, the camera pose holds, selection holds.
- Orbit, pan, zoom anywhere in the canvas move the one camera; both panes follow in the same frame (no link lag).
- Click a room or wall in either half: it selects in that half's layout and makes it active (as `pickIn` in App.tsx does now). The selection outline shows only in its own pane.
- Labels (`RoomLabels`) and Measure read-outs (`Measure`, drei `Html`) render into a DOM overlay per pane; in wipe the Proposed overlay is clipped at the divider exactly like the canvas.
- Sun study: one sun (store `sun`), each pane's lighting follows its own plot via `ViewedVariant` (viewedVariant.ts), as now. One `SunControls` panel.
- High: post-processing in each pane (see Technical design); the look matches single view.
- Capture popover: Snapshot / 2x / Render list the panes on screen with the same ids as today (`main`; `current`, `proposed` side by side; `wipe-current`, `wipe-proposed`), so `SavedViews.tsx` `shotTargets` and `ReportPanel.tsx` keep working.

**Phone (390x844)**
- Compare is wipe only, DPR 1. Divider grab area 44 px wide (28 px today, `.wipe-divider` in Wipe.css), handle 32 px.
- One-finger drag off the divider orbits; pinch zooms; the gesture fade (quick win) applies.
- Walk + Flip: walking forces single (`WALK_UI.viewMode = "single"`, walkStore.ts); Flip (`flipLayout`) and Space peek (`peekPatch`, lib/studio.ts) swap the drawn scene with no rebuild and no "Preparing" loader once the other scene is warm.
- Memory target on phone: one context, one texture set, two 1024 shadow maps at most.

**iPad**: as phone for compare (wipe; `FEATURES.tablet.sideBySide` is false), balanced DPR 1.25. No special work.

**States**
| State | What shows |
|---|---|
| Empty (only one layout exists) | Single pane; the Compare segment is disabled (quick win). Nothing else mounts. |
| First open | Whole canvas: `<Loader kind="blueprint">` "Preparing the 3D view" (as today). |
| Second scene not ready yet (first Compare, first Flip) | Pane A draws and stays live; pane B area shows the sky colour and a `<Loader kind="lift">` "Preparing Proposed" (or "Preparing As listed") centred in that pane. Flip/peek wait for it and then swap. |
| Selected | Outline in the pane of the selected room's layout; the inspector as today. |
| Busy: lights warming | `LightsWarming` once for the whole stage, as now. |
| Busy: Render (path tracer) | The whole stage's frame loop pauses (one canvas); the Render dialog shows its progress as today. |
| Error: context lost | One "Restoring the 3D view" (blueprint loader) over the stage; restore after 2 s (`restoreTimer`, as now). After 3 losses in 60 s: `PanelProblem` "The 3D view hit a problem" with "Reload 3D view" (App.tsx ErrorBoundary already exists). |
| Error: a pane's scene throws | The ErrorBoundary around the stage (App.tsx) catches it, as today. |

## Technical design

### Shape

```
App.tsx        <Viewer active layout models pickIn />            one branch, not four
Viewer.tsx     DOM shell: ViewCube/compass, MeasureButton, SunControls, LightsWarming,
               loaders, ContextMenu, PaneOverlays, WipeDivider, then <Stage>
Stage.tsx      the one <Canvas>; context loss; frameloop gate; Orbit or WalkControls;
               <PaneRender/>; one <SceneRoot variant=…/> per mounted layout
SceneRoot.tsx  createPortal(<ViewedVariant.Provider>{today's Canvas children}</…>,
               ownScene, { camera: paneCamera, size: paneSize, events: { compute } })
paneRender.tsx useFrame(…, 1): for each visible pane set viewport/scissor/viewOffset,
               shadow flag, then gl.render or composer.render
```

### New pure logic (src/lib, with tests)

- `src/lib/panes.ts`
  - `type PaneLayout = "single" | "overlay" | "wipe" | "side-by-side"`.
  - `interface Pane { key: VariantKey; viewport: Rect; scissor: Rect; offset: { fullW: number; fullH: number; x: number; y: number; w: number; h: number } | null; aspect: number }` (CSS px, top-left origin; conversion to GL bottom-left in paneRender).
  - `panesFor(layout, active: VariantKey, other: VariantKey | null, w, h, wipe: number, dpr: number): Pane[]`
    - single/overlay: one pane, full canvas, `active`.
    - wipe: two panes; boundary `b = round(wipe * w * dpr) / dpr` shared by both so there is no seam or overlap; `offset` set so both use the full-frame projection (`camera.setViewOffset(fullW, fullH, x, 0, stripW, h)`).
    - side by side: two panes at `floor(w/2)` and `w - floor(w/2)`, `offset` null, own aspect.
  - `paneAt(panes, x, y): Pane | null` hit test (CSS px relative to the canvas).
  - `clampWipe(x)` (moves MIN/MAX/STEP out of WipeCompare.tsx).
- `src/lib/motionDpr.ts` (PERF7)
  - `motionDpr(base: number, moving: boolean, chassis: Chassis): number` → `moving && base > 1 ? 1 : base`.
  - `class StillTimer` or `nextMotion(state, event: "start" | "frame-moved" | "still-check", now): { moving; restoreAt }` with `STILL_MS = 250`.
- Tests: `panes.test.ts` (each layout's rects; strips cover the canvas exactly at DPR 1, 1.25, 1.5, 3; boundary identical for both panes; offset maths; `paneAt` at edges and at the divider), `motionDpr.test.ts`.

### Three.js changes (src/three)

- **`Stage.tsx` (new)** takes over the `<Canvas>` from `ViewerImpl` with its props as today (`shadows="percentage"`, `NeutralToneMapping`, `onCreated` context-loss listeners, `gl.shadowMap.autoUpdate = false`, `canvasKey` remount). Root scene holds no meshes: only the master camera, `Orbit` (or `WalkControls`), `PaneRender`, `CaptureBridge`s, `FrameOnCommit`. Context-loss handling moves here unchanged, plus a loss counter for the 3-in-60-s `PanelProblem` path.
- **`SceneRoot.tsx` (new)** holds today's Canvas children for one layout: `SkyBackdrop`, `Lighting`, `House` (+ ghost `House` and `SiteDiff` in overlay), `SiteScene`, `SectionCut`, `ShadowUpdates`, `Precompile`, `TrackScene`, `Measure`, `WalkExposure` when walking. Mounted with `createPortal` into its own `THREE.Scene`, with portal state `{ camera: paneCamera, size: { width, height, top, left }, events: { compute } }`, wrapped in `ViewedVariant.Provider`. Memoised like `Viewer` is today (`memo(…, prev.active === false && next.active === false)`), so the scene not drawn does no React work.
  - Mount rule: a layout's SceneRoot mounts the first time it is needed (compare, Flip, peek) and stays until the house or the variant set changes. Single view of a house never edited in Proposed mounts one scene.
- **`paneRender.tsx` (new)**: `useFrame(render, 1)` (priority 1 makes r3f skip its own render). Per frame: `gl.info.autoReset = false; gl.info.reset()`; for each pane whose scene has compiled: copy the master pose into `pane.camera` (position, quaternion, fov), set `aspect`, `setViewOffset`/`clearViewOffset`, `updateProjectionMatrix`; `gl.setViewport`, `gl.setScissor`, `gl.setScissorTest(true)`; `gl.shadowMap.needsUpdate = shadowDirty(scene)`; then `gl.render(scene, cam)` or `composer.render()`. Afterwards `setScissorTest(false)` and full viewport, so captures and the path tracer start from a clean state. DEV: `window.__houseStage = { panes, lastFrame: { calls, tris, ms, panes: n }, scenes }`.
  - Why not drei `<View>`: it sizes each view's camera to its tracked element (wrong for wipe, which needs one projection across both strips), routes events by `event.target === track` (both wipe tracks overlap), and renders the composer only for the root scene. Manual panes are about 120 lines and fit all four layouts.
- **One camera.** The master camera in root state is driven by one `Orbit` (OrbitControls on the canvas) or by `WalkControls`. Pane cameras are copies refreshed each frame. `cameraLink.ts` keeps `lastPose()` and `publishPose` for remembering the pose across Plan/3D and remounts; `subscribePose` and Orbit's `applying`/`dropMomentum`-for-linked-views logic go (one view, nothing to link). `house:view` glides stay in Orbit.
- **Orbit's wheel zoom** raycasts `scene` from `useThree` (Viewer.tsx, the wheel effect). It must raycast the scene of `paneAt(cursor)`, with that pane's camera and NDC: `Stage` provides `usePanes()` (context) with `paneAt` and `ndcIn(pane, clientX, clientY)`.
- **Events / picking.** Each portal's `events.compute(event, state)`: if `paneAt(event) !== thisPane`, set `state.raycaster.layers.disableAll()` (nothing hits); else `layers.enableAll()`, compute NDC within the pane (with offset, NDC is relative to the full frame for wipe) and `raycaster.setFromCamera`. `onPointerMissed` stays on the canvas. Selection callbacks are per scene (`pickIn[k]`), as today.
- **Measure** (Measure.tsx:34 reads `gl, camera, scene, size` from `useThree` and does its own pointer maths): switch it to `ndcIn` from `usePanes()` so side by side measures in the right half. **WalkControls** runs in the root with the master camera and the visible pane's `model`/`variant`; walk is single-pane only.
- **Labels (`Html`).** Each pane has a DOM overlay `div.pane-overlay` (absolute, pane rect; in wipe the Proposed one has the same `clip-path` as the canvas strip). A `PaneOverlay` context gives its ref; `RoomLabels` and `Measure` pass it as drei `Html`'s `portal` prop. Portal state `size` = pane size (full canvas in wipe) so `Html` projects correctly.
- **Shadows.** One sun shadow map per scene (each `Lighting` has its own DirectionalLight). Today `ShadowUpdates` sets the renderer-wide `gl.shadowMap.needsUpdate`; three clears that flag after the first `render()` of a frame, so a second scene would never update. Change: `ShadowUpdates` writes a per-scene dirty count into `sceneShadow.ts` (`markShadow(scene, frames)`, `takeShadow(scene): boolean`); paneRender sets `gl.shadowMap.needsUpdate` from it before each scene's render. Per-light `shadow.needsUpdate` logic stays. The `contentSignature` after-effect is renderer-wide; it marks every scene dirty (errs to redraw, as its comment says).
- **Per-renderer maps become per-scene:** `lampPools`/`poolListeners` (`WeakMap<WebGLRenderer, …>`, lampPool.ts:32-51; used by `Precompile` via `lampPoolsOf(gl)`, `onLampPoolChange`) → keyed by `THREE.Scene`. `exposureByRenderer` (WalkExposure.tsx:19, read in Effects.tsx `ExposureEffectImpl.update`) → keyed by scene. `offstage` (frameLoop.tsx) stays per renderer (shared programs).
- **Precompile** runs per SceneRoot (it reads the portal scene and camera). Shared materials mean the second scene compiles only programs whose light counts differ (lamp pool sizes). `compiled` state moves to a small per-scene ready map in Stage; frameloop = `active && anyVisiblePaneReady && !tracing ? "demand" : "never"`.
- **Post-processing on High** (`Effects.tsx` uses `@react-three/postprocessing`'s `EffectComposer`, which renders the root scene): replace with `paneEffects.ts`, an imperative `postprocessing` `EffectComposer` per pane (`RenderPass(scene, paneCamera)`, N8AO pass, `ExposureEffectImpl`, `ToneMappingEffect`), created lazily with the existing dynamic import (`loadEffects`). Wipe: both composers sized to the full canvas (no realloc while dragging the divider), each output scissored to its strip. Side by side: each sized to its half. Single: one. `Precompile offscreen` stays.
- **Captures** (`capture.ts`, `captureRegistry.ts`): `CaptureBridge` registers one target per pane with the pane's id, scene and camera (`{ gl, scene, camera, invalidate }`, unchanged type). `renderToCanvas` and `captureAt` first `setScissorTest(false)` and set the full viewport, clear any `viewOffset` on a temporary camera clone, render, and restore. A wipe snapshot of `wipe-proposed` gives the full Proposed frame, as today.
- **Path tracer** (`pathtrace.ts`, `WebGLPathTracer(gl)`): `tracing` becomes "any `rendering` in progress" for the Stage (one canvas), not per captureId. Restores size/pixel ratio as now; paneRender redraws afterwards via `invalidate`.
- **Context loss**: one listener pair; restore remounts the Canvas (`canvasKey`); module caches in textures.ts re-upload on the new renderer automatically. Scenes stay as React state, so both layouts come back.

### PERF7: lower DPR while moving

- `Stage` keeps `base = DPR[resolvedQuality]` (with the landed balanced 1.25 and phone-wipe 1). On OrbitControls `start`, a glide start (`startGlide`) or WalkControls movement: `setDpr(motionDpr(base, true))` (r3f `useThree(s => s.setDpr)`), once per gesture, not per frame.
- When `Orbit`'s `coasting` ends and no glide runs, start a 250 ms still timer; on expiry `setDpr(base)` and `invalidate()`. r3f re-sizes and requests a frame; the demand loop draws one sharp frame. Composers resize in the same tick (`composer.setSize`).
- Desktop only for High and balanced where `base > 1`; phone already at 1. No `PerformanceMonitor`.
- Divider drag does not lower DPR (the camera is still; strips must stay sharp).

### App and store

- App.tsx: the four `effectiveViewMode` branches become one `<Viewer active={show3d} layout={effectiveViewMode} variants={variants} variant={activeVariant} pickIn={pickIn} />`; `WipeCompare` is deleted and its divider becomes `src/three/WipeDivider.tsx` (DOM only, writes `--wipe` and calls `setWipe` on release; keyboard as today).
- Wipe position: a non-persisted `useStage` zustand slice in `src/three/stageStore.ts` (`wipe`, `setWipe`); while dragging, a ref plus `invalidate()` per pointer move, no React render.
- `effectiveCompare` (chassis.ts:51): map overlay → wipe on phone, but only if the Overlay segment is still shown there (see Assumptions); test in chassis.test.ts.
- **Persisted state: no change, no migration.** `viewMode` values are unchanged; capture ids are not persisted (grep `captureId` in `lib/persist.ts`, `store.ts` partialize: none). Saved views store poses only.

### Accessibility

- Canvas `aria-label`: "3D view, As listed and Proposed, wipe at 50 %" (updates on release, not per move). Divider keeps `role="slider"`, arrows/Home/End, `aria-valuetext`.
- Pane badges (As listed / Proposed) stay `aria-hidden`; the segment control names the mode.
- `prefers-reduced-motion`: glides already jump; the DPR step still applies.

### Performance and memory budgets

Measured with the extended `scripts/perf-render.cjs` (chunk G) at 1440x900, DPR forced to 1.5, and at 390x844 DPR 1. "N" = single-view draw calls at HEAD for the same pose.

| Metric | HEAD (wipe) | Target |
|---|---|---|
| WebGL contexts created, 3 rounds of single→wipe→side→overlay→single | 2 per compare mount, ≥ 6 per session (B9) | **1** |
| Canvases in `.view3d` | 2 in wipe and side by side | **1** always |
| Textures in driver (`gl.info.memory.textures`, est. bytes) | 2 × 43, ~130 MB | **43 + render targets, ~65 MB** |
| Drawing buffers (est., 2160x1350) | ~2 × 105 MB | **≤ 105 MB** (≤ 35 MB without MSAA under High) |
| Sun shadow maps | 1 per context | 1 per scene, ≤ 2; phone ≤ 2 × 1024 |
| Programs compiled on single→wipe (warm Proposed) | full set again (54-92) | **≤ 10 new** (lamp-count variants only) |
| Switch time single→wipe→side (warm) | cold start with "Preparing" | **< 1 frame of new compiles; no loader** |
| Draw calls per wipe frame (still, no shadow redraw) | ~2N | **≤ 1.3N** (strip frustum culling via `setViewOffset`) |
| Pixels shaded per wipe frame | 2 × canvas | **1 × canvas** |
| Orbit frame on desktop High while moving (PERF7) | DPR 1.5 | DPR 1 while moving; sharp frame ≤ 300 ms after release |

## Build plan

Order: **A, B, G in parallel → C → D, E, F in parallel → G re-run and sign-off.** Each chunk in its own git worktree, symlinked node_modules (CLAUDE.md), commit trailer from the session.

**A. Pure pane and motion maths** (Sonnet, medium)
- Owns: `src/lib/panes.ts`, `src/lib/panes.test.ts`, `src/lib/motionDpr.ts`, `src/lib/motionDpr.test.ts`.
- Stay out of: everything in `src/three/`, App.tsx.
- Steps: implement the API above; tests for every layout, DPR 1/1.25/1.5/3, seams, `paneAt`, clamp.
- Verify: `npm run check`.

**B. Per-scene keying, no behaviour change** (Sonnet, medium)
- Owns: `src/three/lampPool.ts`, `src/three/walk/WalkExposure.tsx`, `src/three/Effects.tsx` (exposure lookup only), `src/three/frameLoop.tsx` (`ShadowUpdates`, `Precompile` key changes), new `src/three/sceneShadow.ts` (+ test).
- Stay out of: Viewer.tsx, App.tsx, WipeCompare.tsx, capture.ts.
- Steps: key lamp pools, pool listeners and exposure by `THREE.Scene`; `ShadowUpdates` writes `markShadow(scene)` and, while no paneRender exists, still sets `gl.shadowMap.needsUpdate` from `takeShadow(scene)` in its own `useFrame` (so HEAD behaviour holds until C).
- Verify: `npm run check`, `npm run build`; `scripts/perf-render.cjs` before/after shows the same programs count and no new stalls; `scripts/shoot-chassis.cjs` 3D shots unchanged.

**G. Measurement and checks** (Sonnet, medium)
- Owns: `scripts/perf-render.cjs`, new `scripts/test-compare.cjs`.
- Stay out of: `src/`.
- Steps: `addInitScript` wrapping `HTMLCanvasElement.prototype.getContext` to count `webgl2`/`webgl` contexts; `COMPARE=1` steps (single→wipe→side→overlay→single, 3 rounds) logging contexts, canvases, programs, `gl.info.memory`, estimated texture bytes (unique maps over all registered scenes: w × h × 4 × 1.33), calls per frame (from `__houseStage.lastFrame` when present, else per render call); `test-compare.cjs` with the checks in Acceptance. Must run against HEAD (records the baseline) and against C.
- Verify: runs green on HEAD for the behaviour checks and prints the HEAD budget column.

**C. Stage, panes and one canvas** (Sonnet, high effort; Opus medium reviews the diff before merge)
- Owns: `src/three/Viewer.tsx`, new `Stage.tsx`, `SceneRoot.tsx`, `paneRender.tsx`, `panesContext.ts`, `stageStore.ts`, `WipeDivider.tsx`, `Wipe.css`, `Viewer.css`; delete `WipeCompare.tsx`; `src/three/cameraLink.ts`; `src/three/Measure.tsx`, `src/three/RoomLabels.tsx` (portal prop and `ndcIn` only); `src/App.tsx` compare branches; `src/lib/chassis.ts` `effectiveCompare` if needed.
- Stay out of: capture.ts, captureRegistry.ts, pathtrace.ts, Effects.tsx (E replaces it), Lighting.tsx.
- Steps: move the Canvas into Stage; SceneRoot portals; paneRender with plain `gl.render` (High temporarily renders without the composer, behind a TODO for E); one Orbit with pane-aware wheel zoom; events.compute per pane; overlays for Html; WipeDivider; App single branch; DEV `__houseStage`.
- Verify: `npm run check`, `npm run build`, `scripts/test-compare.cjs` (all but capture/High checks), `scripts/test-touch-plan.cjs`, `npm run regress:editors -- --port <n>`, shoot-chassis at phone and desktop.

**D. Captures and Render** (Sonnet, medium) — after C
- Owns: `src/three/capture.ts`, `src/three/captureRegistry.ts`, `src/three/pathtrace.ts`, `src/components/SavedViews.tsx` (only if ids need mapping).
- Stay out of: Stage/paneRender (call their exported helpers only).
- Steps: per-pane `CaptureBridge`; reset scissor/viewport/viewOffset in `renderToCanvas`, `captureAt`, path tracer; stage-wide `tracing`.
- Verify: test-compare capture checks; Snapshot, 2x and Render by hand in wipe and side by side at 1440x900.

**E. Post-processing per pane** (Sonnet, high effort) — after C
- Owns: `src/three/Effects.tsx` → `src/three/paneEffects.ts`, the composer hook-up in `paneRender.tsx` (one function, agreed with C: `getComposer(pane)`).
- Stay out of: capture.ts, Lighting.tsx.
- Steps: imperative composer per pane; sizing rules above; exposure effect per scene; dispose on pane unmount and context loss.
- Verify: High screenshots single vs wipe halves match (pixel check below); perf-render `QUALITY=high COMPARE=1`.

**F. PERF7 motion DPR** (Sonnet, medium) — after C
- Owns: DPR logic in `Stage.tsx` (one hook `useMotionDpr` in new `src/three/useMotionDpr.ts`), Orbit's start/coast-end hooks.
- Stay out of: paneEffects.ts (call `composer.setSize` through E's API).
- Verify: `motionDpr.test.ts`; perf-render orbit step logs DPR 1 while moving and 1.5 after; screenshot after 400 ms still equals one taken at rest.

## Acceptance checks

- `npm run check` and `npm run build` pass; GitHub Actions workflow green.
- `node scripts/test-compare.cjs` (new) at **1440x900** and **390x844**, dev server, listing 91770873:
  - Exactly **1** `canvas` under `.view3d` at every step; `getContext` webgl calls = **1** after 3 rounds of single→wipe→side→overlay→single (phone: single→wipe→single).
  - No `.viewer-loading` visible after the first switch round.
  - Wipe at 0.5: click a room at x = 25 % → `selectedRoomId` set and `activeVariant === "current"`; at x = 75 % → `"proposed"`. Drag divider to 0.3, click at 40 % → `"proposed"`.
  - Side by side (desktop): same in left and right halves; Measure across a room in the right half gives the same length as single view in Proposed (± 1 cm).
  - Room labels of Proposed are not visible left of the divider (`elementFromPoint` on a label centre left of the divider returns the As listed overlay or canvas).
  - Pixel check: wipe strips equal the same strips of single-view shots of each layout at the same pose (mean abs diff < 2/255 at balanced; < 4/255 at High), and the column at the divider has no seam row of background colour.
  - Walk in Proposed, Flip twice: no new programs (`gl.info.programs.length` unchanged) and no loader.
  - Context loss: `WEBGL_lose_context.loseContext()` then `restoreContext()` → view back within 3 s, still 1 canvas, both panes draw.
  - Snapshot ids: `useCaptureIds()` lists `wipe-current`, `wipe-proposed` in wipe and `current`, `proposed` side by side; each `captureImage` returns a PNG of that layout only.
- `PORT=… LABEL=… COMPARE=1 node scripts/perf-render.cjs` at `QUALITY=balanced` and `high`: meets every Target in the budget table; prints both columns.
- `node scripts/shoot-chassis.cjs`: phone 390x844, desktop 1440x900 and 1920x1080, views 3d-build, 3d-decorate-room, plus new compare-wipe and compare-side shots; tablet 820x1180 compare-wipe still renders.
- `scripts/test-touch-plan.cjs`, `scripts/test-garden.cjs`, `npm run regress:editors -- --port <n>` unchanged.
- Owner's laptop (real GPU), once: orbit in wipe at High feels smooth; after release the view sharpens within a third of a second.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Divider drag now costs a render per move (HEAD moves a CSS clip only). | Strips together shade 1× the canvas, about one orbit frame. If too slow on phone: cache each scene's still frame in a render target and composite the wipe with one quad while only the divider moves (adds 2 colour targets; phase 2). |
| r3f portal events: hits in the wrong half, or `onPointerMissed` firing oddly. | `events.compute` disables raycaster layers outside the pane; test-compare clicks both halves at several divider positions. |
| Shadow flag cleared by the first `render()` (three resets `shadowMap.needsUpdate`). | Per-scene dirty in `sceneShadow.ts`, set before each scene render; test: move the sun in wipe, both halves' shadows change. |
| Programs differ between scenes (lamp counts baked into shaders), so the second scene still compiles some. | Budget allows ≤ 10; `Precompile`'s background other-lamp-state pass runs per scene. |
| Two composers on High double AO work in wipe. | Desktop only, High opt-in; see open question 2. |
| Memory: two 4096 shadow maps (~128 MB) on desktop High. | Open question 1; phone capped by PERF3 quick win. |
| `Html` labels mis-placed in panes. | Pane overlays with pane-sized portal state; pixel and `elementFromPoint` checks. |
| DPR change resizes buffers (and composers) per gesture: a hitch on start/end. | Once per gesture, not per frame; 250 ms still delay; skip when `base === 1`. |
| Big diff in Viewer.tsx collides with other work. | Chunk C owns Viewer/App exclusively; B lands first with no behaviour change; Opus reviews C. |
| Context-loss loop on iOS. | Loss counter → `PanelProblem` after 3 in 60 s instead of endless restore. |

## Open questions for the owner

1. **Shadow quality in compare on desktop High.** Options: (a) 4096 per scene, ~128 MB; (b) 2048 per scene in compare only, ~32 MB, slightly softer shadow edges; (c) 2048 always. **Recommend (b).**
2. **High (ambient occlusion) in Wipe.** Options: (a) a composer per pane, the look matches single view, about 2× AO cost in wipe; (b) compare always draws Balanced, cheaper, but the halves look flatter than single view. **Recommend (a)**; High is opt-in and desktop-only.
3. **Keep the other layout's scene warm after you leave Compare** (instant Flip, peek and re-compare; holds the second house's geometry, a few MB, no extra textures). Options: (a) keep warm on every device; (b) keep on desktop, drop on phone when leaving compare. **Recommend (a)**, revisit if phone context losses show up.
4. **PERF7 softness while moving.** Options: (a) always drop to DPR 1 while moving on desktop; (b) only on High; (c) a setting. **Recommend (a)**, no setting; ship after the one real-laptop check.

## Out of scope

- Selecting furniture and points in 3D (UX10).
- Lean phone shell (docs/redesign/phone-shell.md) and the modes/top-bar redesign (docs/redesign/modes-and-top-bar.md).
- Cutting shadow casters or merging materials (PERF8).
- Image sync by hash (PERF9), Welcome code-splitting (PERF4).
- A still-frame cache for divider drags (phase 2, only if measured slow).
- Vertical or diagonal wipes, swipe-to-flip gestures.

## Effort

| Chunk | Effort |
|---|---|
| A Pure pane and motion maths | S |
| B Per-scene keying | M |
| G Measurement and checks | M |
| C Stage, panes, one canvas | L |
| D Captures and Render | S |
| E Post-processing per pane | M |
| F PERF7 motion DPR | S |
| **Total** | **L** (C is the critical path) |
