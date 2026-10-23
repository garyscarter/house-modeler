# Storey: technical review, rendering and front end (Shakira)

Scope: the 3D scene (src/three), the 2D plan and site editors (src/editor), the geometry libs that feed them, UI components, CSS, accessibility and bundle weight. Read-only review at commit `cf7db41`. The house is referred to only as listing 91770873.

How I measured: headless Chromium with SwiftShader (software GL), so absolute frame times are meaningless and only counts and ratios matter. React commits were counted with a stub `__REACT_DEVTOOLS_GLOBAL_HOOK__` (one count per `onCommitFiberRoot`, split by renderer). WebGL contexts were counted by patching `getContext`. `renderer.info` came from `captureRegistry.getCapture(id)`. Scripts: `/tmp/claude-0/-home-user-house-modeler/fc23123e-6ea8-5abc-a1a6-b4700cd73045/scratchpad/perf.mjs`, `perf2.mjs`, `perf3.mjs`. The production bundle came from `npm run build` into `dist/`, which was empty when I started.

---

## 1. Verdict

1. The 3D side is in good shape. Frames are drawn on demand (0 frames in 3 s idle). Shells and fixtures are merged into one mesh per material per floor and rebuilt only when their structure signature changes. The shadow map is redrawn only when something changes. Post-processing is lazy-loaded. Geometry is disposed on every rebuild.
2. The weak spots are around the scene, not in it. There are no error boundaries anywhere, so a bad model or WebGL failure blanks the whole app. A drei `Html` pin uses the default z-index range of about 16.7M, which is the cause of the pins drawing above modals. Every compare-mode switch tears down and rebuilds WebGL contexts (6 contexts created in one session).
3. The plan editor is the main performance and maintainability risk. It is one 2,075-line component with 26 `useState`s. A drag writes the store on every pointermove with no rAF coalescing: 2 React commits per move, and one of those is the hidden 3D view re-rendering. The whole SVG reconciles on each move.
4. Memoisation relies on hand-built JSON signatures and about 22 `eslint-disable react-hooks/exhaustive-deps` comments, but ESLint is not installed. Nothing checks those dependency lists.
5. Accessibility basics are present (toolbar and radio roles, labelled buttons, reduced motion), but modals have no focus trap, no focus return and no inert background. The plan and 3D views are mouse-only.

### The five changes that matter most

| # | Change | Why | Effort |
|---|---|---|---|
| 1 | Add an error boundary around each `<Canvas>` (and one at the App root), with a "3D view failed, reload view" card. Also handle `webglcontextlost` / `webglcontextrestored`. | Any throw in scene code, or a missing WebGL context, currently unmounts the whole app. | S |
| 2 | Fix z-index layering: add `zIndexRange={[10, 0]}` to the photo-pin badge `Html` (House.tsx:605), and `isolation: isolate` on `.viewer` (styles.css:119). | This is the root cause of the pins drawing above the shortcut sheet and the photos dialog. | S |
| 3 | Stop the hidden Viewer re-rendering: move the `variants` and `sites` subscriptions (Viewer.tsx:67-68) behind `active`, or into a child. Coalesce plan-drag store writes to one per animation frame. | Halves React commits during plan drags and removes wasted framing maths. | S-M |
| 4 | Split PlanEditor.tsx into a drag/pointer state machine hook, a keyboard hook, a selection hook and per-layer components. Draw the dragged element from a ref or preview layer and commit on rAF. | 2,075 lines and 26 states. Every move re-renders 640 SVG nodes. | L |
| 5 | Use one persistent WebGL renderer for single, side-by-side and wipe, with scissored viewports (drei `<View>`, or a hand-written scissor pass). | Removes context churn and repeated shader compiles on each mode switch. Shares texture and program memory. Halves the pixels drawn in wipe. | L |

---

## 2. Scene construction

### What is built per floor
- **Shell** (walls, skirting, joinery, glass, bays): `buildShell` (shell.ts:155) batches quads into one indexed `BufferGeometry` per `matKey`, inside a `useMemo` in `FloorShell` (House.tsx:281-301). The memo is keyed on `shellLooks(floor)`, a JSON signature cached in a `WeakMap` (structure.ts:47-55), plus the upper floor's structure, the exterior colours and `doorsOpen`.
  - It is rebuilt on wall and room geometry edits, room paint and covering changes, and door toggles.
  - It is not rebuilt on selection, hover, sun changes or fixture moves.
  - Measured CPU cost of `buildShell` for listing 91770873: **8.0 ms ground floor, 4.1 ms first floor**. `buildWalls` costs 0.25 ms and `planRoofs` 0.27 ms. That is fine at edit rate, but at pointermove rate it is half a 60 Hz frame budget (see §6).
  - Old geometry is disposed in an effect cleanup (House.tsx:302). No leak.
- **Floors**: one `ShapeGeometry` per room (House.tsx:404), kept separate so each room can be clicked. One merged slab per floor (House.tsx:310-316). All are disposed.
- **Fixtures**: unit box and cylinder parts are cloned, transformed and merged into one mesh per colour+finish per floor (Fixtures.tsx:50-78). The memo is keyed on `floor.fixtures`, origin, offset, ppm and ceiling. Moving one fixture rebuilds that floor's fixtures, which is cheap. This already beats `InstancedMesh` here, because fixtures differ in scale and parts.
- **Roof**: planned with `planRoofs` keyed on `roofStructure` (Roof.tsx:174-181). Materials are made once per tile style and quality, and colours are set in place (Roof.tsx:185-215). This is good.
- **Selection** re-renders every `FloorGroup`, because `selectedRoomId` is one of the props its comparator checks (House.tsx:122-127). Shell memos survive; only `RoomFloor` swaps to a "selected" material. Measured: **4 React commits per selection change**. Acceptable.
- **Hover** is isolated well: `RoomHover` subscribes on its own (House.tsx:467-498). Measured: 10 hover changes gave 11 commits and 15 frames, with no floor re-render.

### Numbers (single view, balanced quality, both layouts loaded, 1440x852)

| | low / balanced | high | + 37 photos (balanced) |
|---|---|---|---|
| draw calls (`gl.render`, no shadow pass) | 181 | **353** | 202 |
| triangles | 35,062 | 66,200 | 35,104 |
| meshes in scene | 173 | 173 | 194 |
| unique materials | 147 | 147 | 170 |
| shadow casters | 139 | 139 | 139 |
| GPU textures | 47 | 61 | 70 |
| programs | 15 | 41 | n/a (accumulates) |

- On high quality, draw calls and triangles **double** (181 to 353) before N8AO even runs. The cause is `MeshPhysicalMaterial.transmission = 1` on the glass (textures.ts:1513-1521): three.js renders the opaque scene a second time into a transmission target. The composer then adds the N8AO depth/normal passes (Effects.tsx:25). **Medium / S**: on high, keep the film glass and drop transmission, or use transmission only on glass you can see through from close up. The visual gain from refraction through 2 mm panes is small.
- 147 materials for 173 meshes is high, but programs stay at 15, so the cost is uniform uploads and state changes, not compiles. It comes from per-room paint colours, per-colour fixture materials and per-colour floor materials. Fine at this scale.
- **Materials are a module-global cache shared by every canvas** (textures.ts:1489, Fixtures.tsx:96). That is safe, because three.js objects are context-independent. But each WebGL context uploads its own copy of every texture (see §4).

### Textures (textures.ts)
- Canvas sizes come from pixels-per-metre × tile size. Examples: brick 990×660 (WALL_PX 1100 × 0.9 m), oak 1008×504, wide oak 1320×360, porcelain 672×1008, floral wallpaper 477×576. There is a height map of the same size for bump. These are NPOT canvases, which is fine in WebGL2.
- Every texture uses `anisotropy = 8`, mipmaps, trilinear filtering and the correct colour space (sRGB for colour maps, NoColorSpace for height maps) (textures.ts:1442-1451). Correct.
- **First-draw cost (CPU, measured)**:

  | texture | ms |
  |---|---|
  | floor terrazzo | 109 |
  | floor herringbone | 72 |
  | ext pebbledash | 38 |
  | floor porcelain | 30 |
  | ext brick | 23 |
  | floor oak | 15 |
  | wall tiles | 14 |
  | floral wallpaper | 11 |

  Colour maps are drawn **per colour** (`floorMaps` key `${finish}|${color}|${grout}`, textures.ts:1599). A native `<input type="color">` fires `onChange` continuously (DecoratePanel.tsx:117, 131, 168, 179), so dragging the picker over a terrazzo or herringbone floor costs 70-110 ms per step: visible jank. **Medium / M**: draw each pattern once in neutral greys and tint it with `material.color` plus a grout mask (a second map or an `onBeforeCompile` mix). Or debounce the picker and only re-draw on `change`/pointerup, showing a plain-colour tint while dragging.
- Caching and eviction: materials use an LRU capped at 256, with at most 16 textured ones. Floor maps are capped at 20. Eviction skips anything a tracked scene still draws (`inUse()` walks every live scene, textures.ts:1637). Correct, but `inUse()` is O(scene) and runs on every eviction, which happens on every picker step once the cap is reached. It is fine at 173 meshes.
- `canvas()` asks for `willReadFrequently: true` on every canvas (textures.ts:154). Only `grain()` uses `getImageData`. The flag forces a CPU-backed canvas for every texture, which makes the big pattern fills (arcs, roundRects) slower. **Low / S**: set it only where `grain` is used, or apply grain to a small tile.
- CanvasTextures keep their source canvases alive: colour plus height, about 2-5 MB of CPU memory per finish. That is needed for context-restore re-uploads, but nothing restores today (§7). **Low**.

### Shadows and lights (Lighting.tsx)
- One shadow-casting directional light, fitted tightly to the house or plot box from the light's view (Lighting.tsx:73-115). Map size is 4096 on high, 2048 on balanced and 1024 on low, with PCF (`shadows="percentage"`) and a radius that follows quality. Normal bias scales with texel size. This is well done.
- `gl.shadowMap.autoUpdate = false`. `ShadowUpdates` (frameLoop.tsx:26-74) marks the map dirty on scene-relevant changes and on any change in renderer geometry, texture or program counts, which catches async loads. Camera-only frames skip the shadow pass. Good.
- On high, a 4096² depth map is about 64 MB of GPU memory **per context**: 128 MB in side by side or wipe. **Low / S**: cap it at 2048 when two canvases are mounted.
- The environment is a PMREM bake of a gradient sphere, rebaked at most every 250 ms and only when the warmth step (1/20) changes (Lighting.tsx:176-245). Good.

### Postprocessing
- `Effects` is lazy-loaded: a 227 kB chunk (101 kB gzip) fetched only when quality is "high" (Viewer.tsx:55-56). It contains EffectComposer, N8AO (16 samples, half resolution, 4 denoise samples) and tone mapping.
- The Canvas keeps its default `antialias: true` while the composer runs `multisampling={2}`. On high, the default framebuffer's MSAA is wasted. **Low / S**: pass `gl={{ antialias: quality !== "high" }}`. This needs a remount, so tie it to the key used when quality changes.

### drei usage
Only `OrbitControls`, `Html`, `Billboard` and `Image` are used, all as named imports. Tree-shaking works: none of GLTFLoader, DRACO, troika, meshline or similar is in any chunk. Of `three-stdlib`, only `Sky` lands in the bundle.

### InstancedMesh opportunities
Few, and they are not needed. The shell, fixtures, roof and site parts are already merged. The candidates would be site fence posts and boundary pieces, and neighbour houses, but those are merged per part too (Site.tsx:506-536). Instancing would only pay for a large catalogue of repeated furniture with per-instance picking. Not recommended now.

### Photo pins
- 37 listing photos, all 1024×768 JPEG, 3.74 MB on disk. They are fetched only when "Load listing photos" is pressed (`import.meta.glob ... ?url`, listingAssets.ts:11). They are then stored as **base64 data URLs (4.76 MB of strings)** in the store.
- Each room pin and exterior pin is a drei `<Image>` that decodes the full 1024×768 file: +23 GPU textures, about 4 MB each with mipmaps, so about 90 MB of VRAM per context for 1.1×0.8 m billboards. **Medium / S**: build a 256 px thumbnail (canvas or `createImageBitmap` with resize) once per photo for the pin texture, and keep the full image for the lightbox only.
- The heap went from 98 MB to 101 MB after a GC, because textures live on the GPU. Heap rose to 132-152 MB across mode switches (old contexts are held until GC).

---

## 3. Frame loop

- `frameloop="demand"`, and `"never"` while hidden or while shaders precompile (Viewer.tsx:94). This is right, and the `compileAsync` precompile (frameLoop.tsx:107-136) is a nice touch.
- Measured: **idle 3 s gave 0 frames**. 30 pointer moves over the canvas gave 2 frames and 0 commits.
- An orbit drag of 30 steps gave 35 frames. Damping (0.12) settles in about half a second, and the leftover momentum is explicitly dropped (Viewer.tsx:446-456).
- Nothing invalidates every frame. `useFrame` callbacks that run on each drawn frame:
  - the Orbit yaw CSS variable (it writes a style only when the change exceeds 0.2°);
  - `CompassBridge` (the same pattern);
  - `RoomLabels` visibility (`setState` only on a flip);
  - the sky dome following the camera;
  - the neighbour fade raycast against one Box3 per neighbour (Site.tsx:693-708);
  - the `ShadowUpdates` counter;
  - drei `Html` projection for each label and badge.

  All are O(1) or O(labels). Good.
- `FrameOnCommit` (frameLoop.tsx:77-83) invalidates after **every** commit of the R3F root, including commits that changed nothing visible. While the view is hidden, that is harmless (`never`). While it is visible, it means any App re-render (for example a TopBar or ModePanel change) draws a frame. **Low**.
- Sun "play" (SunControls.tsx:47-59) writes `setSun` to the store on each rAF. Each write re-renders Lighting, SkyBackdrop and ShadowUpdates, refits the shadow camera and redraws the shadow map. That is inherent to the feature and acceptable. The PMREM rebake is throttled.

---

## 4. Two-canvas modes (side by side, wipe)

- Each mode mounts **separate `<Viewer>`s, each with its own WebGL context**. Each one has its own lights, shadow map, PMREM environment, Sky, compiled programs and its own upload of every texture.
- Measured context creations:

  | step | contexts created so far |
  |---|---|
  | single | 1 |
  | then side by side | 3 |
  | then wipe | 5 |
  | then back to single | 6 |

  Every switch remounts the canvases (App.tsx:184-254 renders different subtrees per mode), recompiles shaders behind "Preparing the 3D view", and re-uploads about 70 textures.
- Side by side: two 719×852 canvases, about 346-351 calls each (the measured frame included a shadow pass).
- Wipe: **two full-size 1440×852 canvases**. The top one is clipped by CSS `clip-path` (Wipe.css:3), so each canvas renders every pixel and then half (on average) is thrown away. 18 `Html` overlays (9 per canvas). **Medium**.
- Camera link (cameraLink.ts): a tiny module bus. The 'change' event on one view's OrbitControls publishes, and other views `jump()` and invalidate (Viewer.tsx:356-409). Echoes are prevented with `applying`, and glide and drag conflicts are handled. Clean, and cheap.
- **Recommendation: one renderer with scissored views. Medium-High / L.** There is now one camera pose shared by both views, one sun and one site per layout. drei `<View>` (or a custom pass: `gl.setScissorTest(true)`, then for each view `setViewport`/`setScissor` and render that view's scene) would give:
  - one context, so no re-upload or recompile on mode switch, and the "Preparing" wait disappears after the first time;
  - textures and programs shared;
  - wipe drawing exactly W pixels instead of 2W;
  - one place for Effects (N8AO would need per-view composers or would run only in single view).

  Two scenes are still needed, because they show different houses. The shadow maps stay per scene light.

  The cost: Html labels need per-view portals, and the R3F event system needs per-view event compute (drei View handles this).

  A cheaper step first: keep both Viewers mounted across side-by-side and wipe changes and only change the CSS layout, so switching between the two compare modes stops recreating contexts.
- **Context loss is not handled at all.** There is no `webglcontextlost` listener and no `restored` path. On a lost context (GPU reset, too many contexts, tab backgrounded on mobile), R3F keeps the dead canvas and the view stays black. **Medium / S**: listen on `gl.domElement`, call `preventDefault()`, show the Loader with "Restoring the 3D view", and remount the Canvas by bumping a key on `webglcontextrestored`, or on a timeout.

---

## 5. Picking and interaction in 3D

- Raycasting goes through R3F's event system against meshes that have handlers.
  - Build mode: the `RoomFloor` meshes (one `ShapeGeometry` per room, tens of triangles), plus photo-pin images.
  - Decorate mode: the merged shell meshes gain `onClick` (House.tsx:354-364), so the whole shell is raycast on each pointer event. That is about 15-20k triangles for the floor, brute force (no BVH), well under 1 ms. Fine.
  - Measured: 30 pointer moves gave 0 commits and 2 frames (hover outline only).
- The wall pick uses `e.face.normal` as the world normal, which is valid because shell meshes are only translated (House.tsx:360), plus a 2D `pickWallFace` against room polygons (App.tsx:108-116). Sound.
  - Small inefficiency: `bays` is rebuilt per click (House.tsx:361) and the room polygons are rebuilt per click (App.tsx:110). Negligible.
- Hover goes through the store (`hoveredRoomId`), but only `RoomHover` (per floor) and PlanEditor subscribe. Hovering does **not** re-render the house. Good.
- `lastDown` is a module-level `window` pointerdown listener added at import time (House.tsx:388-397), used to tell a right-click from a right-drag. It is never removed, and it is shared by all viewers. **Low**: move it into a hook on the canvas element.
- Right-click menu: `ContextMenu` is portalled with arrow keys, Enter and Esc, and closes on outside click, wheel or blur (ContextMenu.tsx). Viewer passes `onClose={() => setMenu(null)}` as a fresh closure on every render, so the listeners are re-added on each Viewer render while the menu is open (Viewer.tsx:199, ContextMenu.tsx:28-49). **Low / S**: `useCallback`.

---

## 6. The plan editor (PlanEditor.tsx, 2,075 lines)

### Structure
- One component, `PlanEditor`, spans lines 109 to about 1,828. It holds **26 `useState`s**: tool, calib, draft, hover, altHeld, measure, edgeEdit, litEdge, the selected opening, wall, fixtures and canopy, hoverGroup, marquee, activeCorner, placing, addOpen, imageOpen, menu, guides and others. On top of those it has 11 `useStore` subscriptions, about 20 `useMemo`s and about 10 effects. Small helper components follow (Handle, RoomLabel, EdgeLabels, MeasureLine, StairsMarker).
- Pointer handling is one state machine in a ref (`drag.current`, with kinds pan, pinch, marquee, fixture, wallEnd, corner, canopy, canopyCorner, stairs, opening). Pointer capture is taken lazily once the 6 px slop is crossed (PlanEditor.tsx:468-528). Esc cancels a drag by restoring the store snapshot taken at the press (PlanEditor.tsx:646-683). This is a good design that is simply inlined.
- Undo granularity: `holdUndo(true)` at the press and `holdUndo(false)` at the end. **Measured: 40-move corner drag = 1 undo step.** Correct.

### Re-render cost of a drag (measured)

| interaction | React commits | SVG mutations | store writes |
|---|---|---|---|
| corner drag, 40 moves | **81** (about 2 per move) | 400 (10 per move) | 41 |
| same, split by renderer (20 moves) | react-dom 21, **@react-three/fiber 18** | | |
| background pan, 30 moves | 76 | 172 | 0 (`setCam` React state) |
| wheel zoom, 10 notches | 10 | 10 | 0 |
| hover in Select tool, 30 moves | 3 | 1 | 0 |

- Store edit to React flush in dev: **42-80 ms per corner move** for 10 sampled moves (two outliers at 7 and 15 ms).
- Each move calls `updateFloor` synchronously, with no rAF coalescing (PlanEditor.tsx:560-600). That re-renders App, which subscribes to `variants`, TopBar, Dock, InspectorCard and PlanEditor's entire tree of 640 SVG nodes, 45 handles and 81 `<title>`s.
- **The hidden 3D Viewer also re-renders on every move.** `Viewer` is `memo`'d with a comparator that skips prop changes while it is inactive (Viewer.tsx:63). But `ViewerImpl` itself subscribes to `s.variants` and `s.sites` (Viewer.tsx:67-68). A store subscription bypasses `memo`, so every plan edit re-runs `framed`, `modelBounds`, `frameFor` and every Canvas child, and commits the R3F root. `SiteScene` also subscribes to the active variant (Site.tsx:32). **High / S**:
  - read the bounds through `useStore(s => active ? s.variants : null)`, or keep the last snapshot in a ref while inactive;
  - drop the `active` fallback subscription in SiteScene, because Viewer always passes `model`.
- Snapping per fixture move rebuilds `others` with `fixtureBox` for every other fixture on every move (PlanEditor.tsx:533-538): O(n) allocation per move. That is fine for tens of fixtures. Cache it per drag in `drag.current` at press time.
- **Recommendations:**
  - **(a) Medium / S**: coalesce drag writes. Keep the last pointer position in `drag.current` and apply it in a single rAF callback, so a burst of 3-4 moves per frame (common with high-rate mice) costs one store write and one commit.
  - **(b) Medium / M**: make the big layers memoised child components that take only the data they draw: `<PlanRooms rooms px stroke selectedId>`, `<PlanOpenings>`, `<PlanWalls>`, `<PlanFixtures>`, `<PlanCanopies>`. Then a corner drag re-renders only the room layer. `FixtureSymbol` and `OpeningSymbol` are already `memo`.
  - **(c) Low / M**: during pan and zoom, `vb` and `px` change, so all stroke widths change and everything re-renders. Pan alone gave 76 commits for 30 moves. Applying a CSS/SVG `transform` on a root `<g>` during the gesture and committing the viewBox on pointerup would make pan free. Keep the viewBox approach for crisp strokes at rest.

### Other points
- **Zoom/pan** (usePlanCamera.ts) uses the SVG viewBox, a native non-passive wheel listener, a trackpad pan/pinch classifier, and a ResizeObserver that ignores 0×0, so the hidden state is handled. It fits again when `fitKey` (the floor id) changes. Good.
- **Image underlay**: one `<image href={floor.image}>` (PlanEditor.tsx:1220), a 53 kB WebP. Fine.
- **Text measurement**: none (no getBBox or measureText). Label sizes come from `px`. Good.
- **Hit testing**: transparent wide-stroke lines and circles (`.plan-hit`, `Handle` with a separate `hit` radius) plus the SVG's own hit testing. Fine.
- **Keyboard**: one window listener reads the latest handler through a ref (PlanEditor.tsx:370-430). It is gated by `keyBelongsElsewhere` (nudge.ts:31-38): inputs, contenteditable, or **any `[role="dialog"]` in the document**. That global dialog check is why InspectorCard deliberately avoids `role="dialog"` (InspectorCard.tsx:9). The workaround weakens semantics. **Low / M**: replace it with an explicit "key scope" (for example a `data-keyscope` attribute on Modal and Palette roots, or a small focus-scope store).
- **Context menu**: shared `ContextMenu`. Good.
- **Colours**: 54 raw hex literals in PlanEditor.tsx (for example `WALL_FILL = "#27272a"` at line 95, and the canopy hatch at lines 1222-1225). They should come from brand tokens (`src/lib/brand.ts`) or CSS variables read once. **Low / S**.
- The SVG has no `role`, no `aria-label` and no keyboard focus path to rooms, openings or fixtures (see §9).

### Proposed split (Medium-High / L, after (a) and (b))
```
src/editor/plan/
  PlanEditor.tsx          // composition only (~250 lines)
  usePlanSelection.ts     // selected opening/wall/fixtures/canopy/corner, select(), liveIds
  usePlanDrag.ts          // Drag union, pointer handlers, capture, slop, rAF commit, cancel-on-Esc, holdUndo
  usePlanKeys.ts          // onKey + keyBelongsElsewhere + nudge/copy/paste/group
  usePlanMenu.ts          // context menu items per hit
  usePlanTools.ts         // tool, draft, calib, measure, placing, hover
  layers/Rooms.tsx, Walls.tsx, Openings.tsx, Fixtures.tsx, Canopies.tsx, Overlays.tsx (guides, marquee, measure, clearances)
  chrome/PlanStatus.tsx, PlanZoom.tsx, ImageOptions.tsx
```
SiteEditor.tsx (957 lines) has the same shape: `updateSite` on every move (SiteEditor.tsx:337-363). It should share `usePlanDrag` and `usePlanCamera`.

---

## 7. React code quality

- **No error boundaries anywhere** (grep: no `componentDidCatch` or `getDerivedStateFromError`). **High / S**.
  - A throw in House, Roof, Site or any lib (for example a degenerate polygon reaching `ShapeGeometry`, or `mergeGeometries` with mismatched attributes) unmounts the root, and the user sees a blank page.
  - So does a missing WebGL context: R3F throws "Error creating WebGL context".
  - Fix: an `ErrorBoundary` around each `<Canvas>` with a reset key based on the model plus a "Reload 3D view" button, a boundary around the lazy editors (App.tsx:258-270), and a root boundary that offers to export the project JSON.
- **Unchecked hook dependencies**: there are about 22 `eslint-disable-next-line react-hooks/exhaustive-deps` comments across the area (House.tsx 9, Viewer 3, Site 2, and others), but ESLint is not a dependency (`node_modules/.bin` has no eslint) and there is no lint script. The signature-keyed memos (`useMemo(..., [shellLooks(floor)])`, `[sig]`, `[structure]`) are a reasonable pattern, but every one is a hand-checked contract.
  - Example to verify: `Stairs` memoises on `[f]` but reads `floor` through `boxedPart(floor, f)` (House.tsx:541-567). It relies on `flightStructure` covering everything `boxedPart` reads.
  - **Medium / S**: add `eslint` + `eslint-plugin-react-hooks` (v5 also has the React Compiler rules) to `npm run check`. Replace the disables with a tiny `useKeyedMemo(fn, key)` helper, so the intent is explicit and greppable.
- **Viewer memo is defeated** by its own store subscriptions (see §6), and `Viewer`'s comparator also re-renders on *every* parent render while active. `levels` and `visibleLevels` are rebuilt on each render (Viewer.tsx:82-83). Harmless today, because House filters them and FloorGroup does not receive them.
- **App.tsx** subscribes to 16 store fields. Every selection or variant change re-renders TopBar, Dock, InspectorCard, all dialogs and the Viewer, because they are not memoised. Most read their own state from the store anyway. **Low / S**: `memo` the static siblings, or move the subscriptions down.
- Callbacks: `onSelectRoom` and `onPickWall` are `useCallback`'d, and the per-variant `pickIn` and wipe handlers are memoised (App.tsx:95-141, WipeCompare.tsx:55-61), as are Viewer's room menu (through a `live` ref) and Orbit (`latest` ref). This was done carefully. The inline closures in `FloorShell` (`onSelect={() => ...}`, House.tsx:328-329) are fine, because `RoomFloor` is not memoised and its geometry is.
- Keys: rooms, fixtures and walls are keyed by id. `key={i}` is used for compare-overlay wall boxes (House.tsx:195, 214) and canopies (`"c" + i`, PlanEditor.tsx:1227). Canopies are selected by index, so undo can leave a stale selection, and there is an effect that patches this (PlanEditor.tsx:313-315). **Low / M**: give canopies ids.
- Effects that should be event handlers or derived values:
  - `useEffect(() => { if (selectedRoomId) setSelectedCanopy(null) }, [selectedRoomId])` (PlanEditor.tsx:420). Selection state is split between the store (`selectedRoomId`) and local state (opening, wall, fixtures, canopy, corner), so effects keep the two in sync. That is derived-state-in-state; a single selection union in the store (or one reducer) would remove these.
  - App.tsx:90-92 sets `editFloorId` in an effect after render. It could be done in `setMode("plot")`.
  - `if (show3d && !opened3d) setOpened3d(true)` during render (App.tsx:146) is the legal "adjust state while rendering" pattern. Fine.
- Suspense and lazy: Viewer, WipeCompare, PlanEditor, SiteEditor and Effects are all lazy, with Loader fallbacks and labels. Good. drei `<Image>` sits in per-pin Suspense (House.tsx:593), so pins pop in individually without blocking the scene.
- StrictMode is on (main.tsx:17). Effects are idempotent: PMREM is created and disposed, listeners are added and removed, and `holdUndo(false)` runs on unmount. I saw no double-effect bugs.
- `House.tsx:658` has `import { useStore }` at the *bottom* of the file. It works because of hoisting, but it is surprising. **Low**.
- `onPointerMissed={() => {}}` on the Canvas (Viewer.tsx:165) is a no-op. Remove it or comment why.

### Z-index bug: photo pins above modals (26-shortcuts.png, 23-photos-loaded.png)
- **Cause:** the photo-count badge is a drei `<Html>` with no `zIndexRange` (House.tsx:605-607). drei's default range is `[16777271, 0]`, and each overlay gets an inline z-index scaled by camera distance. I measured inline z-indices of **15,636,680 to 15,792,100** on 9 badges (18 in wipe).
- `.viewer` is `position: relative` with no z-index (styles.css:119), so it does not form a stacking context. The badges therefore compete in the app's root stacking context and beat `.modal-backdrop` (`--z-modal: 80`, Modal.css:2), the shortcut sheet and the photos dialog. `RoomLabels` already passes `zIndexRange={[10, 0]}` (RoomLabels.tsx:72), which is why only the badges leak.
- **Fix (both, S):**
  1. Add `zIndexRange={[10, 0]}` to the badge `Html` (House.tsx:605).
  2. Add `isolation: isolate` to `.viewer` (styles.css:119), so nothing a canvas overlay does can escape the viewer. ViewCube (z 12) and SunControls (z 12) live inside `.viewer` and stay above the labels.
  3. Optionally render Modal, Dialogs and Lightbox through `createPortal(document.body)` like ContextMenu already is, so their z-order never depends on DOM position.
- Related: badges are drawn for every floor, not just the top visible floor that `RoomLabels` limits itself to (House.tsx:227-229 vs 102). So badges for ground-floor rooms float through the first floor and roof, which is what the screenshot shows. Apply the same `labelLevel` / `roofOver` gating, or occlude them with `occlude`. **Low / S**.

---

## 8. CSS and layout

- 1,087 lines of CSS across 17 files. Tokens are defined in styles.css:1-30 (fonts, colours, `--z-*`).
- Raw hex outside styles.css: **75 in CSS** (SiteEditor.css 15, PlanningPanel.css 11, ReportPanel.css 10, PlanEditor.css 6, and others) and **113 in editor/component TSX** (PlanEditor.tsx 54, SiteEditor.tsx 14, OpeningSymbol.tsx 8, FixtureSymbol.tsx 6, Inspectors.tsx 5). Many are plan-drawing colours (SVG fill and stroke) that the brand doc says should come from `brand.ts` or tokens. **Low / M**: introduce `--plan-*` tokens, and a `planColours` object in brand.ts for SVG attributes.
- Hard-coded z-indices that bypass the scale: SunControls.css:2 and ViewCube.css:3 use `12`, Wipe.css:13/30 uses `11`, CommandPalette.css:4 uses `1000` (above `--z-modal: 80`), styles.css:123 uses `2`. **Low / S**: map them onto the `--z-*` scale (CommandPalette should be `calc(var(--z-modal) + 1)`).
- `!important`: 7 uses. Two are justified:
  - styles.css:121 `touch-action: none !important` against OrbitControls' inline style (commented);
  - styles.css:57-58, reduced-motion overrides for Loader.

  The other three (PlanningPanel.css:45, ReviewPage.css:56-57) are specificity hacks. **Low**.
- 32 inline `style={{}}` objects in TSX. Most set dynamic values; fine.
- **`.view3d[hidden] { display:none }`** (styles.css:115) keeps the Canvas mounted. With `frameloop="never"` while hidden (Viewer.tsx:94), the hidden canvas does **not** render: 0 frames measured on the plan tab.
  - R3F's resize observer reports 0×0 when it is hidden. R3F then sets the drawing buffer to 0×0 and re-allocates on return (the drawing buffer, plus composer targets on high). That is a one-off cost of about one frame.
  - The hidden view still holds its whole GPU footprint (textures, 64 MB shadow map on high), which is the intended trade-off.
  - `visibility:hidden` plus `position:absolute` would keep the size and avoid the realloc, but it costs nothing measurable today. Leave it.
- Layout thrash: there are no forced-layout loops.
  - WipeCompare's `getBoundingClientRect` runs per pointermove (WipeCompare.tsx:49), and the result is written to a CSS variable without a React render. Fine.
  - usePlanCamera reads `getBoundingClientRect` per wheel event (usePlanCamera.ts:63). Fine.
- Fonts: @fontsource with `font-display: swap`. Plex Sans 400/500/600 and Mono 400/500 are latin-only. Bricolage Grotesque variable ships latin, latin-ext and vietnamese as `unicode-range` subsets, so only latin downloads (41 kB).
  - `.woff` fallbacks are emitted (6 files, about 136 kB) but never fetched by modern browsers. They cost disk space only.
  - The Bricolage woff2 is also inlined as a 55 kB JS chunk for report export (ReportPanel.tsx:315). It is lazy. Fine.

---

## 9. Accessibility in code

- **Good:**
  - Dock is `role="toolbar"`, with `role="group"` segments and a `radiogroup` for compare (Dock.tsx:40-72).
  - ToolRail is a `nav` with `aria-pressed` toggles.
  - Section and InspectorCard use `aria-expanded` and `aria-controls`; `inert` is set on the inspector while peeking (InspectorCard.tsx:25).
  - The Wipe divider is a proper `role="slider"` with arrow, Home and End keys (WipeCompare.tsx:118-157).
  - ContextMenu is `role="menu"` with arrow keys and focuses its first item.
  - `prefers-reduced-motion` is honoured in CSS (Loader, ViewCube, Wipe) and for camera glides (Viewer.tsx:219, 326).
  - The plan-editor zoom group is labelled, and `role="status"` is used for hints and loaders.
- **Modal** (Modal.tsx): it has `role="dialog"`, `aria-modal`, `aria-label` and initial focus on the panel. It lacks:
  - a **focus trap** (Tab walks into the page behind it);
  - **focus return** to the opener on close;
  - an **inert background**;
  - a portal.

  Esc handling uses a `document.querySelector(".dialog-backdrop, .lightbox")` check to avoid double-closing (Modal.tsx:12). **Medium / S**: a `useFocusTrap(panelRef)` (or the native `<dialog>` with `showModal()`, which gives inert, top layer and Esc for free and also fixes the z-index class of bugs), plus saving `document.activeElement` on open and restoring it on close.
- **ShortcutSheet** and **CommandPalette** are separate dialog implementations: three different patterns. CommandPalette has `role="dialog"` with a listbox but no `aria-activedescendant` and no `aria-controls` on its input. PhotoLightbox has labelled buttons but no `role="dialog"` and no `aria-modal`. **Low / M**: unify on one Modal primitive.
- **Popover** (ViewMenu.tsx:11-64): click-outside and Esc are handled, but:
  - focus does not move into the popover, and is not returned to the button on Esc;
  - `aria-haspopup="true"` means "menu", but the content is a mix of toggles and radios, not a menu;
  - there is no `aria-controls`;
  - every open popover's document-level Esc listener fires.

  **Low / S**: `aria-haspopup="dialog"` (or omit it), `aria-controls`, focus the first focusable on open, return focus on close.
- **Plan editor**: the SVG has no role or label, rooms, openings and fixtures cannot be focused, and selection needs a pointer. Once something is selected, arrows nudge and Delete removes it. **Medium / M**:
  - give the SVG `role="application"` with `aria-label` and a roving `tabIndex` over rooms and items (Tab/Shift+Tab to cycle, Enter to select);
  - announce the selection through the existing `role="status"`.
- **3D view**: orbiting is pointer-only, because OrbitControls' `listenToKeyEvents` is not used. The ViewCube buttons and saved views give a keyboard path to preset views, and rooms can be selected from lists. Acceptable. Add `aria-label` / `role="img"` with a description on the canvas host.
- **Colour-only signalling**: the overlay compare draws removed walls in red and added walls in green (House.tsx:196, 215). The title text says "red = removed, green = new" (App.tsx:237), which is red/green, the classic colour-vision pair. **Medium / S**:
  - use a blue/orange pair, or red plus hatch/opacity difference (removed is already transparent at 0.28 vs 0.55, which helps a little);
  - add a legend with shapes.

  Fixture clashes and the planning panel's pass/fail should be checked the same way.

---

## 10. Bundle

`npm run build` (Vite 8 / rolldown) produces 80 assets, 6.2 MB in total, 3.74 MB of which is the 37 listing photos (fetched on demand).

| chunk | min | gzip | loads |
|---|---|---|---|
| capture-*.js (three's WebGLRenderer + R3F + zustand + suspend-react; the name comes from capture.ts being the first importer) | **512 kB** | 138 kB | with the 3D view |
| three.core-*.js | 374 kB | 100 kB | with the 3D view |
| Effects-*.js (postprocessing + N8AO) | 227 kB | 101 kB | only on "high" |
| index-*.js (app shell, panels, libs) | 212 kB | 70 kB | initial |
| react-*.js | 190 kB | 60 kB | initial (own cached chunk) |
| Viewer-*.js (scene code: textures, roof, openings, drei OrbitControls/Html/Billboard/Image, Sky) | 185 kB | 65 kB | with the 3D view |
| ReviewDocument | 84 kB | 28 kB | lazy |
| PlanEditor | 70 kB | 23 kB | lazy |
| store | 59 kB | 21 kB | initial |
| bricolage inline font | 55 kB | 42 kB | report export only |
| sun | 50 kB | 19 kB | initial (modulepreload) |
| GLTFExporter | 37 kB | 11 kB | lazy |
| SiteEditor | 27 kB | 9 kB | lazy |
| index CSS | 36 kB | 8 kB | initial |

- **Initial shell**: about 525 kB minified (about 180 kB gzip) of JS plus 36 kB of CSS. **Opening the 3D view** adds about 1.07 MB minified (about 303 kB gzip). **High quality** adds 227 kB more.
- Tree-shaking works: there is no drei barrel bloat and no loaders.
- The 512 kB chunk trips Vite's warning. **Low / S**: add `codeSplitting` groups for `three` (three.core + three.module) and `r3f` (@react-three/fiber, its-fine, suspend-react, zustand/traditional), next to the existing `react` group. That gives stable chunk names for caching and an honest name in the build output. It does not reduce bytes.
- `sun-*.js` (50 kB) and `report-*.js` are modulepreloaded into the shell. Check whether the sun maths is needed before the 3D view or SunlightSection opens. **Low**.
- Listing photos: JPEG 1024×768, 65-182 kB each (3.74 MB in total). They load only on request, but they are then **re-encoded as base64 data URLs in the store** (4.76 MB of strings, +27%), which are also persisted to IndexedDB (Elton's area).
  - For rendering: keep `Blob`s or object URLs, and generate 256 px thumbnails for pins (§2).
  - WebP or AVIF at quality 75 would roughly halve the photo bytes (the floorplan is already WebP).
- The lazy-load plan is already good: Effects only on high, plus the editors, review and GLTF exporter. A remaining candidate is the Site scene and textures (siteTextures.ts, Site.tsx), which could load only when `showSite`. That would save perhaps 15-20 kB, so it is not worth it now.

---

## 11. Code health

- **Files over about 600 lines (my area):**

  | file | lines | note |
  |---|---|---|
  | src/editor/PlanEditor.tsx | 2,075 | split in §6 |
  | src/three/textures.ts | 1,704 | split into `textures/canvas.ts` (rng, canvas, grain, blotches), `textures/walls.ts`, `textures/floors.ts`, `textures/covers.ts`, `textures/materials.ts` (MatSpec, matKey, caches, eviction, glass) |
  | src/lib/roof.ts | 1,416 | pure; split planning by roof type (`roof/gable.ts`, `hip.ts`, `leanTo.ts`, `flat.ts`) |
  | src/lib/openings.ts | 1,040 | pure |
  | src/editor/Inspectors.tsx | 1,025 | already one export per inspector; move each into `inspectors/*.tsx` |
  | src/editor/SiteEditor.tsx | 957 | share the plan drag and camera hooks |
  | src/three/Fixtures.tsx | 799 | about 650 lines are the `fixtureParts` catalogue geometry; move it to `lib/fixtureParts.ts` with tests |
  | src/lib/roofParts.ts | 740 | |
  | src/three/Site.tsx | 723 | |
  | src/three/House.tsx | 661 | split FloorShell, Stairs and Pins into files |
  | src/three/wallTextures.ts | 638 | |
- **Duplication**:
  - Two LRU material caches with near-identical eviction (textures.ts:1674-1704 and Fixtures.tsx:96-121). Extract `boundedCache(limit, isLive)`.
  - WipeCompare's single-layout fallback (WipeCompare.tsx:63-89) repeats the Viewer prop list that App also spells out three times (App.tsx:185-253). Build a `viewerProps` object once in App.
  - The "find the `.wipe` or `.viewer` host and write a CSS variable from useFrame" pattern appears in Orbit (Viewer.tsx:441-486) and CompassBridge (Lighting.tsx:355-373). Make it one `useCssVarFromCamera` hook.
  - Three dialog implementations (§9).
- **Dead or stale code**:
  - `onPointerMissed={() => {}}` (Viewer.tsx:165);
  - `export { WALL_T, roomColor }` re-exports from House.tsx:36 (check importers);
  - scripts/screenshots.mjs has outdated selectors (per the brief).
  - TODO/FIXME/HACK count in src: **0**.
- Naming is consistent and comments are unusually good: most non-obvious choices are explained in place, which made this review fast.

---

## 12. Prioritised recommendations

### Quick wins (S)
1. **Error boundaries** around each Canvas, the lazy editors and the root, plus a WebGL-unavailable message. Files: new `components/ErrorBoundary.tsx`, Viewer.tsx, App.tsx. **High**.
2. **Z-index fix**: `zIndexRange={[10,0]}` on the badge Html (House.tsx:605), `isolation:isolate` on `.viewer` (styles.css:119), and limit badges to the label level (House.tsx:227). **High**.
3. **Hidden Viewer re-renders**: gate the `variants`/`sites` selectors on `active` (Viewer.tsx:67-68) and drop SiteScene's active-variant subscription (Site.tsx:32). This halves commits on plan drags (measured 18 of 39 commits came from R3F). **High**.
4. **rAF-coalesce plan and site drag writes** (PlanEditor.tsx:479-600, SiteEditor.tsx:337-363). **Medium**.
5. **Context loss handling**: `webglcontextlost` / `webglcontextrestored` in Viewer, with a remount key and a Loader label. **Medium**.
6. **Pin thumbnails**: 256 px textures for drei `<Image>` pins instead of 1024×768 photos (House.tsx:594, 641). This saves about 90 MB of VRAM per context. **Medium**.
7. **Glass on high**: drop `transmission` (textures.ts:1516) or limit it. It doubles draw calls (181 to 353). Also pass `antialias:false` when the composer is on. **Medium**.
8. **Modal focus trap, focus return and inert background**, or move to the native `<dialog>` (Modal.tsx). **Medium**.
9. **Accessible compare colours**: change the red/green overlay to a colour-blind-safe pair plus a legend (House.tsx:196, 215; App.tsx:237). **Medium**.
10. **Add ESLint with react-hooks** to `npm run check`, and replace the about 22 blind `exhaustive-deps` disables with a `useKeyedMemo` helper. **Medium**.

### Bigger moves (M/L)
11. **Split PlanEditor.tsx** into hooks and memoised layers (§6 plan). Draw the dragged element from a ref during gestures and use a transform for pan. **M-L**.
12. **One WebGL renderer for every compare mode** (drei `<View>` or a scissor loop). As a first step, keep the canvases mounted across side-by-side and wipe switches. This stops the 6-contexts-per-session churn and halves the pixels drawn in wipe. **L**.
13. **Tint-based procedural textures**: draw each pattern once in greys and tint by `material.color` plus a grout mask. This removes the 70-110 ms re-draw per colour-picker step for terrazzo and herringbone, and the per-colour texture cache. Debounce pickers meanwhile. **M**.
14. **Split textures.ts and Inspectors.tsx** and move the fixture catalogue geometry into lib with tests (§11). Unify the two LRU caches. **M**.
15. **Keyboard access to the plan** (roving focus over rooms and items) and a single key-scope mechanism to replace `keyBelongsElsewhere`'s global `[role=dialog]` check. Brand tokens for the 54 plan colours. **M**.
