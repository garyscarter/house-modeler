# Studio redesign (phase 2): implementation plan (Lady Gaga)

Status: owner-approved picks from the design review (1A Studio layout, 2A light studio look, 2C Glass look toggle, 3A, 4A/4B/4C, 5A, 6A/6C/6D, 7, 8A–8C, 9A, 10A, 11A/11B, 12A/12B/12E, palette matching). Builds on docs/modes-plan.md, which has landed. **Desktop only**: mouse and keyboard, 1440×900 and up. Privacy: the house is "listing 91770873" and nothing else.

The work splits into **Chunk 0 (Kylie)**, which lands first and is small, then **Chunks A (Madonna), B (Prince) and C (Dua Lipa)** in parallel worktrees.

| Chunk | Owns | Depends on | Model |
|---|---|---|---|
| **0 Kylie: foundation** | package.json/lock (fonts), `main.tsx`, `store.ts`, `lib/studio.ts`, `lib/commands.ts`, `lib/shortcuts.ts`, `panelPrefs.ts`, the `:root` tokens and primitives in `styles.css`, new `InspectorCard`, `ContextMenu`, `Info`, `icons`, a **stub** `three/WipeCompare.tsx`, one-line hooks in `CommandPalette.tsx` and `ShortcutSheet.tsx` | nothing: **lands first** | Sonnet medium |
| **A Madonna: shell and look** | `App.tsx`, the rest of `styles.css`, the top bar, house menu, dock, Glass look, global keys, Review page, every other `src/components/*` file except the ones Kylie and Dua Lipa own | Kylie | Sonnet medium. **Opus review** of the diff (largest one; key handling and layout) |
| **B Prince: plan canvas** | `editor/*` (PlanEditor, PlanEditor.css, SiteEditor(+css), Inspectors, ModeSummaries, DecoratePanel, FeatureWalls, AddItem, usePlanCamera), new `editor/ToolRail.tsx`, `editor/planTool.ts`, `lib/planKeys.ts`, `lib/planHit.ts` (+tests) | Kylie | Sonnet medium |
| **C Dua Lipa: 3D** | `three/*` (Viewer, House, ViewCube(+css), WipeCompare (replaces the stub), new `cameraLink.ts`, `cameraPose.ts`, `Wipe.css`), `lib/cameraViews.ts` (+test), `components/SunControls.tsx/.css` | Kylie | Sonnet medium; **Opus (high) review** of the wipe and the camera link |

**Merge order:** Kylie, then A, B and C in any order. The only shared file after Kylie is `styles.css`, which belongs to A. B and C style their own work in their own CSS files.

---

## 1. Decisions made here (agents: don't reopen these)

1. **Accent colours per mode are dropped.** There is one accent, `--accent`. Delete the five `.app[data-mode=…] { --accent }` rules. `data-mode` stays on `.app` for tests and styling hooks.
2. **Fonts are bundled with @fontsource.** Checked: `@fontsource-variable/bricolage-grotesque@5.3.0`, `@fontsource/ibm-plex-sans@5.3.0` and `@fontsource/ibm-plex-mono@5.3.0` install through the proxy.
   - Vite emits the woff2/woff files into `assets/`, and the CSS is rewritten relative to `assets/`. `build-hosted.mjs` already publishes every file under `assets/`, so no change is needed there. Fonts are standard web media types.
   - Import only the subsets in use: `@fontsource-variable/bricolage-grotesque/wght.css`, `@fontsource/ibm-plex-sans/latin-400.css`, `latin-500.css`, `latin-600.css`, `@fontsource/ibm-plex-mono/latin-400.css`, `latin-500.css`.
   - Fallback stacks are in the tokens, so a failed font load still looks right.
3. **Wipe compare (4A)** uses **two Canvases stacked in one box**. The top one shows Proposed with `clip-path: inset(0 0 0 X%)`, and the cameras are linked. Reasons for picking it over scissor viewports:
   - Each Viewer keeps its own `ViewedVariant`, `Lighting`, `SiteScene` and postprocessing `Effects`, which scissor viewports would break.
   - Chromium honours `clip-path` for hit-testing, so a drag left of the divider orbits the As listed canvas and a drag right of it orbits the Proposed canvas, and the link keeps them together.
   - Side by side already runs two contexts, so this is a known cost.
4. **Linked cameras (4C, and the wipe)** go through a tiny module-level pose bus (`three/cameraLink.ts`). Every Viewer publishes on OrbitControls `change` and applies poses from the others. The same bus remembers the last pose, so going from Plan to 3D (Tab) brings back the camera you left instead of the home view.
5. **One sun.** Sun state is already global (`store.sun`). The sun panel is opened from the dock (`panelPrefs.sunOpen`). Side by side and wipe show exactly one panel.
6. **Home framing (7).** The opening view frames the **union of both layouts' floors and both plots**. As listed and Proposed then open on the same camera, which the wipe and peek need anyway. This also fixes "Proposed looked tighter". The first home jump also waits for a non-zero canvas size.
7. **Peek (4B)** swaps `activeVariant` while Space is held (store `peek`). It is symmetric: on As listed it shows Proposed. It is ignored in side by side and wipe, and when only one layout exists. While peeking, the plan ignores pointer input. The plan camera is keyed by floor id only, so it doesn't jump.
8. **Review (5A).** `mode === "review"` is the open state of the full-screen `ReviewPage`, which sits **below the top bar**, so the mode bar stays usable.
   - Close (× or Esc) returns to `modeBeforeReview` (default `"build"`).
   - Clicking another mode also leaves Review.
   - `ReviewPanel.tsx` is deleted. Its Compare control moves to the dock.
9. **Floors (dock and keys)**, with one rule set, in `lib/studio.ts`:
   - Picking floor F sets `editFloorId = F.id`. In 3D it also sets `maxLevel = F.level`.
   - "All" appears in 3D only and sets `maxLevel = null`.
   - The 3D dock lights "All" when `maxLevel === null`, else the floor at `maxLevel`. The plan dock lights the edit floor.
   - Tab from Plan to 3D: if `maxLevel !== null`, set `maxLevel` to the edit floor's level, so a cut follows the floor you were on.
   - Keys `1`–`9` pick the nth floor by level; `0` is All (3D only).
10. **Single-key clashes (6A).**
    - `R` turns furniture when an item is selected or being placed. Otherwise, if Rectangle is available in the mode, it picks Rectangle. `Shift+R` only turns furniture.
    - `C`, `D` and `V` with Ctrl/⌘ keep copy, duplicate and paste. Without a modifier they are tools.
    - `A` opens Add in Furnish. `I` toggles the image. `F` fits the rooms. `+`/`=` and `-` zoom.
    - Keys are ignored when there is a modifier other than Shift, or when `keyBelongsElsewhere(e.target, document)` is true.
11. **Calibrate** leaves the rail. It becomes a "Calibrate from two points…" button in Floor settings, which opens the plan on that floor with the calibrate tool armed (`requestPlanTool`).
12. **Floor display names (11A)** are mapped at display time only (`floorDisplayName`). The preset data stays "Ground Floor"/"First Floor": photos are matched by floor name, and layoutMerge/startupPrompt compare presets, so renaming the data would trigger update prompts and break photo matching. The Floor name field still edits the raw name.
13. **Hover cross-highlighting (6D)** sources:
    - plan rooms
    - 3D room floors
    - the selected-room header in the inspector
    - the knock-through neighbour list

    Report rows are **not** a source: Review is full-screen (5A), so nothing they lit would be visible.
14. **Touch code (10A).** Remove the drawer, `pointer: coarse` rules, phone breakpoints, `useMediaQuery`, `useCoarsePointer` (use the fine-pointer sizes) and "tap/pinch" wording. Two-pointer pinch handling in PlanEditor and SiteEditor stays: it is harmless and covers trackpads that report touches.
15. **Looks (2A and 2C).** `data-look="studio" | "glass"` on `.app`, from `panelPrefs.look` (default `"studio"`). It is per browser, not synced and adds no undo step. The same components serve both looks; only tokens and a few `[data-look="glass"]` layout rules differ (§3.3).

---

## 2. Chunk 0, Kylie: foundation (lands first)

### 2.1 Fonts
- Install the three font packages (`npm install …`; if npm 10 fails with "edgesOut", run `npx -y npm@11.6.2 install …`). Commit `package.json` and `package-lock.json`.
- `src/main.tsx`: import the six CSS files listed in §1.2, before `./styles.css`.

### 2.2 Tokens and primitives in `src/styles.css`
Replace `:root` with:
```css
:root {
  --bg: #eef0ec; --panel: #fff; --surface-2: #f4f5f2; --surface-3: #e7eae5;
  --line: #dde1dc; --text: #1d2422; --muted: #6a736f;
  --accent: #0f6e66; --accent-soft: #e2efed; --accent-ink: #fff;
  --danger: #b42318; --warn: #b45309; --hover-room: #0f6e66;
  --font-ui: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-display: "Bricolage Grotesque Variable", "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  --radius-s: 6px; --radius: 10px; --radius-l: 14px; --pill: 999px;
  --shadow-card: 0 1px 2px rgba(29,36,34,.06), 0 8px 24px rgba(29,36,34,.10);
  --shadow-pop: 0 2px 4px rgba(29,36,34,.08), 0 16px 40px rgba(29,36,34,.18);
  /* Floating cards (Glass overrides these) */
  --card-bg: var(--panel); --card-border: 1px solid var(--line); --card-blur: none; --card-radius: var(--radius-l);
  --topbar-h: 48px; --float-gap: 12px; --float-top: var(--float-gap); --card-clear: 96px;
  --z-float: 20; --z-pop: 30; --z-menu: 40; --z-review: 45; --z-top: 50; --z-modal: 80;
  font-family: var(--font-ui); font-size: 14px; color: var(--text);
}
.app[data-look="glass"] {
  --card-bg: rgba(255,255,255,.62); --card-border: 1px solid rgba(255,255,255,.7); --card-blur: blur(16px) saturate(1.2);
  --accent: #1d2422; --accent-soft: rgba(29,36,34,.08); --float-top: calc(var(--topbar-h) + 2 * var(--float-gap));
}
```
**Primitives**, through tokens, without touching the header/aside/drawer/media blocks (Madonna owns those):
- `button`: `border: 1px solid transparent`, `background: var(--surface-2)`, `border-radius: var(--radius-s)`. Hover `background: var(--surface-3)`. `button.primary` uses `--accent`. `button.danger` is `--danger` text.
- `.seg`: a pill track (`background: var(--surface-2); border: 0; border-radius: var(--pill); padding: 2px; gap: 2px`). Its buttons are `border-radius: var(--pill)` with no borders. `.active` is `background: var(--panel); color: var(--accent); font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,.08)`.
- Inputs and selects: `border: 1px solid var(--line); border-radius: var(--radius-s)`, focus `outline: 2px solid var(--accent-soft); border-color: var(--accent)`. `input[type=number]` and `.num` use `font-family: var(--font-mono)`.
- `h1, h2, h3, .summary-line, .display` use `font-family: var(--font-display)`.
- `.sect-chev` uses `--muted`. `.note` gets a warm tone: `#fbf6e6` with border `#efe2b8`.
- Delete the five per-mode accent rules.
- **Append the shared floating classes**, used by every chunk:
  - `.float-card` (background `var(--card-bg)`, border, `backdrop-filter: var(--card-blur)`, radius, `--shadow-card`)
  - `.inspector-card` (see §2.5)
  - `.popover` (`.float-card` + `--shadow-pop`, `z-index: var(--z-pop)`, padding 8px)
  - `.ctx-menu`
  - `.info`, `.info-btn`, `.info-pop`
  - `.icon-btn` (32×32, transparent, radius 8, `.active` = `--accent-soft` bg and `--accent` icon)
  - `kbd.keycap` (mono, 11px)

### 2.3 Store (`src/store.ts`)
| Field / action | Type | Default | Persisted | Undo |
|---|---|---|---|---|
| `ViewMode` | add `"wipe"` | | | |
| `tab`, `editFloorId`, `viewMode` | existing | | **Yes**, added to `Persisted` / `partialize` (12E) | No |
| `hoveredRoomId` | `string \| null` | `null` | No | No; add to the `setUi` Pick |
| `peek` / `peekReturn` | `boolean` / `VariantKey \| null` | `false` / `null` | No | No |
| `setPeek(on: boolean)` | action | | | `rawSet(peekPatch(get(), on))` |
| `modeBeforeReview` | `Mode \| null` | `null` | Yes | No |
| `setMode(m)` | existing | | | Also sets `modeBeforeReview: st.mode` when entering review from another mode |
| `leaveReview()` | action | | | `setMode(get().modeBeforeReview ?? "build")`, then `modeBeforeReview: null` |
| `planImage` default | | `{ show: true, opacity: 0.3 }` (8B) | already | |

- **`merge`**:
  - `viewMode` not in `["single","side-by-side","overlay","wipe"]` → `"single"`.
  - `tab` not `"3d"`/`"plan"` → `"3d"`.
  - `editFloorId === "site"` while `mode !== "plot"` → `null`.
  - `modeBeforeReview` that is not a mode, or is `"review"` → `null`.
- `reset`, `undo` and `redo` also clear `hoveredRoomId`.
- Leave `PERSIST_VERSION` alone.

### 2.4 `src/lib/studio.ts` (+ `studio.test.ts`), pure
```ts
export const OPEN_PALETTE = "house:open-palette";
export const OPEN_SHORTCUTS = "house:open-shortcuts";
export type Look = "studio" | "glass";
export function floorDisplayName(name: string): string;
//   /^(lower ground|ground|first|second|third|top) floor$/i → "Ground floor" style (first letter capital, rest lower); anything else unchanged
export function houseName(m: HouseModel | undefined): string;   // "Listing 91770873" when preset.id or basedOn.id starts with "listing-91770873", else "House"
export function floorsByLevel(floors: Floor[]): Floor[];
export interface FloorUi { tab: Tab; maxLevel: number | null; editFloorId: string | null }
export function dockFloorActive(ui: FloorUi, floors: Floor[]): string | "all";
export function dockFloorPick(ui: FloorUi, floors: Floor[], pick: string | "all"): Partial<FloorUi>;   // §1.9; "all" in plan → {}
export function floorForKey(floors: Floor[], key: string): string | "all" | null;                   // "1".."9" → nth by level, "0" → "all", else null
export function tabSwitchPatch(ui: FloorUi, floors: Floor[], next: Tab): Partial<FloorUi>;        // includes { tab: next }
export function peekPatch(s: { peek: boolean; peekReturn: VariantKey | null; activeVariant: VariantKey; viewMode: ViewMode; variants: Partial<Record<VariantKey, unknown>> }, on: boolean): Partial<…>;
//   on: only if !peek, viewMode is single|overlay and the other variant exists → { peek: true, peekReturn: active, activeVariant: other }
//   off: only if peek → { peek: false, peekReturn: null, activeVariant: peekReturn }
```
**Tests:**
- Name mapping for both preset names and a custom name.
- `dockFloorPick` in 3D and in plan, including All.
- `tabSwitchPatch` with a cut and without.
- `floorForKey` with "3" when there are 2 floors (null) and with "0".
- `peekPatch` on and off; it does nothing with one layout or in side by side.
- Store tests (new `src/storeStudio.test.ts`, following the `storeModes.test.ts` pattern):
  - review enter and leave
  - persisted merge fallbacks
  - `setPeek` adds no undo step

### 2.5 New shared components
- **`src/components/InspectorCard.tsx`**: `InspectorCard({ title?, className?, children })`.
  - Renders `null` when `children` is falsy.
  - Renders `<section className={"inspector-card float-card " + className} aria-label={title ?? MODE_LABEL[mode] + " inspector"}>`.
  - The header row `.inspector-card-head` shows the title (display font; default `MODE_LABEL[mode]`) and `button.inspector-card-toggle` (aria-expanded; chevron icon). The toggle flips `panelPrefs.inspectorCollapsed`.
  - The body `.inspector-card-body` scrolls (`overflow-y: auto; overscroll-behavior: contain`) and is not rendered when collapsed.
  - CSS: `position: absolute; top: var(--float-top); right: var(--float-gap); width: 320px; max-height: calc(100% - var(--float-top) - var(--card-clear)); display: flex; flex-direction: column; z-index: var(--z-float)`.
  - **No `role="dialog"`**: it would switch off the plan's keys.
- **`src/components/ContextMenu.tsx`**:
  ```ts
  export type MenuItem = { label: string; hint?: string; danger?: boolean; disabled?: boolean; run: () => void } | "sep";
  export interface MenuState { x: number; y: number; items: MenuItem[] }
  export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }): JSX.Element | null;
  ```
  - Renders `position: fixed` into `document.body` (portal). It is clamped to the viewport.
  - `role="menu"`, items are `role="menuitem"` buttons, and the first item is focused.
  - ↑/↓ move, Enter runs, and Esc, an outside pointerdown, wheel or window blur close it. Running an item closes it first.
- **`src/components/Info.tsx`**: `Info({ children, label = "More about this" })`.
  - A 18 px circular `button.info-btn` with "i", aria-label `label`.
  - It shows `.info-pop` (`role="tooltip"`, max-width 280 px, `.popover` look) on hover after 150 ms, on focus, or on click (which pins it). Esc or outside closes.
- **`src/components/icons.tsx`**: `Icon({ name, size = 18 })`, inline 24-viewBox stroke SVGs (`stroke="currentColor"`, width 1.75, round caps), `aria-hidden`.
  - `IconName` = select, rect, polygon, wall, canopy, door, window, gap, measure, image, walls, zoomIn, zoomOut, fit, fitImage, undo, redo, search, help, sun, eye, compare, chevronDown, chevronRight, close, plus, paste, house, layers, info, more.
  - Simple recognisable shapes; no external icon library.
- **`src/three/WipeCompare.tsx` (stub)**: the final props, plus a body that renders one `<Viewer variant="proposed" …>`. Dua Lipa replaces the body.
  ```ts
  export interface WipeCompareProps { photos: Photo[]; showLabels: boolean; showCeilings: boolean; doorsOpen: boolean; selectedRoomId: string | null;
    onSelectRoom: (floor: Floor, room: Room, variant: VariantKey) => void; maxLevel: number | null; showExterior: boolean }
  export function WipeCompare(p: WipeCompareProps): JSX.Element;
  ```

### 2.6 `panelPrefs.ts`
- Add `sunOpen: boolean` (false), `inspectorCollapsed: boolean` (false) and `look: Look` ("studio").
- Extend `setPrefs` and `partialize`. In `merge`, an unknown `look` → `"studio"`.

### 2.7 Palette and commands (`lib/commands.ts`, + test)
- **Matching.** In `wordScore`, the subsequence fallback applies only when `q.length >= 4` and scores **10**. Prefix scores stay at 80−i and exact at 100−i.
- **Tests:**
  - `rankCommands("bed", …)` on a context with a bedroom and both layouts includes "Go to Bedroom 1" and excludes "Render quality: Balanced" and "Compare: Side by side".
  - `"balan"` still finds Balanced.
  - `"kitc"` ranks the Kitchen above any subsequence hit.
- **`CommandContext` changes:**
  - Add `mode: Mode`, `setMode(m)`, `look: Look` and `setLook(l)`.
  - `viewMode` takes `"wipe"` too.
  - `dispatch` stays.
- **Command changes:**
  - Titles become "3D" (was "3D view") and "Plan" (was "Check plan"). Floor names go through `floorDisplayName`.
  - Add `Compare: Wipe`.
  - Add `Mode: Build` … `Mode: Review` (keywords "mode"), and `Look: Glass` / `Look: Studio` (whichever is not current).
  - `"plan:site"` becomes "Site plan (Plot)": `setMode("plot")` + `setUi({ tab: "plan" })` (12B).
  - The two review commands still dispatch `house:open-review`.
- **`CommandPalette.tsx`** (Kylie touches only this):
  - Listen for `OPEN_PALETTE` on `window` and open.
  - Pass `mode`, `setMode`, `look` (from `usePanelPrefs`) and `setLook` (→ `setPrefs({ look })`) into the context.
- **`ShortcutSheet.tsx`**: listen for `OPEN_SHORTCUTS` and open.

### 2.8 `lib/shortcuts.ts`
- Export `TOOL_LABEL: Record<Tool, string>`:
  - select "Select", rect "Rectangle room", room "Polygon room", wall "Wall", canopy "Canopy", door "Door", window "Window", gap "Gap", measure "Measure", calibrate "Calibrate", place "Place".
- Export `TOOL_KEY: Partial<Record<Tool, string>>`:
  - select V, rect R, room P, wall W, canopy C, door D, window N, gap G, measure M.
- Export `tip(label, key?)` → `"Rectangle room (R)"`.
- Rewrite `SHORTCUT_GROUPS`:
  - **App**: ⌘K, ?, undo, redo, Tab "Switch Plan / 3D", 1–9 "Floor 1–9", 0 "All floors (3D)", Space (hold) "Show the other layout".
  - **Plan tools**: each `TOOL_KEY`, plus A "Add furniture (Furnish)", I "Show or hide the floorplan image", F "Fit the rooms", +/− zoom.
  - **Plan editing**: the existing items, with R reworded "Turn furniture 90° (when an item is selected)". Add "right-click: Actions for what's under the pointer".
  - **3D**: the existing items + "right-click a room: actions".

### 2.9 Kylie acceptance
- `npm run check` and `npm run build` pass.
- `npm run build:hosted` writes `dist-hosted/assets/*.woff2`, and the CSS references them as `url(./…woff2)` (grep).
- Playwright, 1440×900:
  - `getComputedStyle(document.body).fontFamily` contains "IBM Plex Sans".
  - `document.fonts.check('16px "Bricolage Grotesque Variable"')` is true after `document.fonts.ready`.
  - ⌘K, type "bed": no row reads "Render quality".

**Not changing:** layout, App.tsx, any editor or 3D file.

---

## 3. Chunk A, Madonna: shell and look

**Owns:**
- `src/App.tsx` and `src/styles.css` (everything but Kylie's `:root` tokens and primitives; Madonna may add tokens)
- `components/`: `ModeBar.tsx`, `ModePanel.tsx`, `ReviewPage.tsx/.css`, `ViewMenu.tsx/.css` (rewritten), `ImportPanel.tsx`, `PhotosPanel.tsx`, `SettingsPanel.tsx`, `ReportPanel.tsx/.css`, `PlanningPanel.tsx/.css`, `ExteriorPanel.tsx/.css`, `SitePanel.tsx/.css`, `PlotPanel.tsx`, `Dialogs.css`, `CommandPalette.css`, `ListingUpdatesDialog.css`, `PhotoLightbox.tsx`
- deletes `ReviewPanel.tsx` and `useMediaQuery.ts`
- new `TopBar.tsx`, `HouseMenu.tsx`, `Dock.tsx`, `Modal.tsx`, `useStudioKeys.ts`, `PhotosDialog.tsx`, `LayoutsDialog.tsx`

**Stay out of:** `editor/*`, `three/*`, `SunControls.*`, `lib/*`, `store.ts`, and Kylie's new components (use them; don't edit them).

### 3.1 Layout (`App.tsx`)
```
<div class="app" data-mode data-tab data-look>
  <TopBar/>                                  header.topbar
  <div class="narrow-note">House Modeler is designed for a desktop or laptop.</div>
  <main data-tab={tab}>
    canvas: Viewer (single / overlay) | .split two Viewers | <WipeCompare/> | <SiteEditor/> (mode === "plot") | <PlanEditor key=editFloor.id …/>
    {tab === "3d" && (model || mode === "plot") && <InspectorCard className="side"><ModePanel/></InspectorCard>}
    {model && <Dock/>}
    {peek && <div class="peek-badge">Showing {VARIANT_LABEL[activeVariant]} · release Space</div>}
  </main>
  overlays: PhotoLightbox, Dialogs, CommandPalette, ShortcutSheet, ReviewPage, ListingUpdatesDialog, LayoutsDialog, PhotosDialog
</div>
```
- **Remove:** `aside`, the `side` state, the drawer, `useMediaQuery`, `DRAWER_QUERY`/`INLINE_QUERY`, `ViewControls`/`PlanFloorSwitch` use and the `<ModeBar/>` row.
- `editingSite = mode === "plot"` (12B). When `mode !== "plot"` and `editFloorId === SITE_EDIT_ID`, use `floors[0]`.
- `effectiveViewMode = both ? viewMode : "single"`.
- Viewer gets no `title` in single view. In overlay the title stays.
- The side-by-side `onSelectRoom` stays as today. Wipe passes `(f, r, k) => { setUi({ activeVariant: k }); onSelectRoom(f, r); }`.
- **Empty state** (no model): "Load the listing" + a `button.primary` "Open layouts" that opens LayoutsDialog.
- **CSS:**
  - `.app` is a flex column. In Studio, `header.topbar` is 48 px, solid `--panel`, with a bottom line, and `main` takes the rest.
  - `main { position: relative; flex: 1; min-height: 0; display: flex }`. `main[data-tab="3d"] { --card-clear: 152px }` keeps the card clear of the view cube.
  - Delete the drawer block, the 759/599 px blocks, the `pointer: coarse` block, `.hdr-*`, `aside`, `.side-content`, `.drawer-*`, `nav.mode-bar` row styles and `.mode-panel` width rules. Also delete the plan-editor block (`.plan-editor`, `.toolbar*`, `.editor-body*`, `.inspector label`, `.palette*`) and `.site-editor-body > .site-side`: Prince re-creates what he needs in PlanEditor.css and SiteEditor.css.
- **Narrow note:** `.narrow-note { display: none }`. `@media (max-width: 1099px) { .narrow-note { display: block; … } }`: a 28 px muted bar under the top bar. The app still renders.

### 3.2 Top bar (`TopBar.tsx`)
`header.topbar` is a 3-column grid (`1fr auto 1fr`, align centre, padding 0 12px):
- **Left:** `<HouseMenu/>`, a button `.house-menu-btn` reading `houseName(model) ▾` (display font, 15px, 600).
- **Centre:** `<ModeBar/>`, restyled as a `.seg` pill (`nav.mode-bar`). Each button's title is "Build mode" etc.
- **Right** (justify end, gap 8):
  - `.seg[aria-label="Layout"]` with As listed / Proposed, disabled when missing; clicking clears the selection as today.
  - Undo and redo `.icon-btn`s, aria-labels "Undo"/"Redo", titles "Undo (⌘Z)" / "Redo (⌘⇧Z)" via `isMacPlatform`.
  - `button.icon-btn[aria-label="Command palette"]` (search icon + `kbd` ⌘K), which dispatches `OPEN_PALETTE`.
  - `button.icon-btn[aria-label="Keyboard shortcuts"]` "?", which dispatches `OPEN_SHORTCUTS`.

### 3.3 Glass look (2C)
- `.app` gets `data-look={usePanelPrefs(s => s.look)}`.
- `[data-look="glass"]` rules:
  - `.app` becomes `position: relative`.
  - `main` is `position: absolute; inset: 0`: the canvas runs full-bleed under the top bar.
  - `header.topbar` is `position: absolute; top: var(--float-gap); left: var(--float-gap); right: var(--float-gap); z-index: var(--z-top); height: var(--topbar-h)` and gets the `.float-card` look (radius `--pill`, `--card-bg`, `--card-blur`, `--card-border`, `--shadow-card`).
  - `.narrow-note` sits under the pill.
- Everything else (rail, inspector, dock, zoom, view cube, popovers, context menu) already uses `.float-card`/tokens, so Glass needs no other component changes. `--float-top` moves the rail and card below the pill.
- Blur is only on these small cards, never on `main` or a full-screen layer (frame-rate rule). Cards keep about 62% white plus blur; text on them uses `--text`, never `--muted` below 12 px.
- **Toggle:**
  - A `.seg[aria-label="Look"]` "Studio | Glass" in the house menu's Settings group, calling `setPrefs({ look })`.
  - Kylie's ⌘K commands "Look: Glass" / "Look: Studio".

### 3.4 House menu (9A, `HouseMenu.tsx`)
A `.popover` (width 340, max-height 80vh, scrolls) under the button. Outside click or Esc closes it, the same as today's `ViewMenu`. Groups, top to bottom:
1. **Layouts…** opens `LayoutsDialog`: a `Modal` "Layouts", 760 px wide, with both `ImportPanel`s side by side.
2. **Bring in updates…**, shown only when `isListingDesign(variants.proposed)`, calls `openListingReview("proposed")`. It shows the "N available" count the same way ImportPanel does: lift that `useMemo` into an exported `useListingUpdateCount(variant)` in ImportPanel.tsx.
3. **Photos (n)…** opens `PhotosDialog`: a `Modal` "Photos", `min(1100px, 92vw)` × 86vh. It holds `PhotosPanel`, with `.photo-grid` at `repeat(auto-fill, minmax(200px, 1fr))`.
4. **Settings**:
   - Render quality as a `.seg` High / Balanced / Low (from `SettingsPanel`, split into an exported `RenderQuality`).
   - Look as a `.seg` Studio / Glass.
5. **Project**: Export JSON, Import JSON…, Clear all… (split out of `SettingsPanel` as `ProjectActions`).
6. A footer with the sync status + "Sync now" (`SyncStatus`), only when sync is not off.

`Modal({ title, onClose, width?, children })`: fixed backdrop at `z-index: var(--z-modal)`, a `.float-card` panel, a close × and Esc to close, `role="dialog"`.

### 3.5 Dock (`Dock.tsx`)
`.dock.float-card` sits at `position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: var(--z-float)`, a flex row, gap 6, padding 6, radius `--pill`. Left to right:
1. `.seg[aria-label="Plan or 3D"]` with Plan / 3D, titles "Plan (Tab)" / "3D (Tab)". Clicking uses `setUi(tabSwitchPatch(…))`.
2. `.seg[aria-label="Floor"]`:
   - In 3D, "All" plus the floors; in plan, the floors only. Labels via `floorDisplayName`.
   - Uses `dockFloorActive` / `dockFloorPick`. Titles "Ground floor (1)" etc.
   - Hidden when `mode === "plot"` on the plan, or when there is one floor and we're on the plan.
3. **3D only:**
   - **Compare** `button.dock-compare` reads "Compare: Single ▾" and opens a `.popover` above with four radio rows (Single, Side by side, Overlay, Wipe) → `setUi({ viewMode })`. It is disabled unless both layouts exist.
   - **Sun** `button.icon-btn[aria-label="Sun study"]`, `.active` when `sunOpen`, toggles `panelPrefs.sunOpen`. Disabled with the title "Add a plot under Plot to use the sun study" when the site is missing.
   - **View** `button.dock-view` "View ▾" opens a `.popover` with checkboxes Labels, Ceilings, Doors open, Exterior, Site. Same bindings and titles as today's `ViewControls`, **without** compare, Show up to or Ceiling height.
- Popovers open upwards (`bottom: calc(100% + 8px)`).
- Rewrite `ViewMenu.tsx` as a generic `Popover({ label, className?, children })`, keeping the outside, Esc and `data-pick` behaviour, and the `ViewToggles` component. Delete `ViewControls` and `PlanFloorSwitch`.

### 3.6 Global keys (`useStudioKeys.ts`, used once in App)
`window` keydown/keyup. Skip when `keyBelongsElsewhere(e.target, document)`, `mode === "review"` or `!model`.
- **Tab** (no modifiers): `preventDefault`, then `setUi(tabSwitchPatch(…))`. The room selection is kept (it is global). Plan-only selections (opening, wall, fixture) are not kept.
- **`1`–`9`, `0`**: `floorForKey`, then `dockFloorPick`. `0` only in 3D.
- **Space**:
  - keydown (not `e.repeat`): `preventDefault`, `setPeek(true)`.
  - keyup: `preventDefault`, `setPeek(false)`.
  - On window `blur`: `setPeek(false)`.
  - If the target is a button, `preventDefault` on keyup stops it being clicked.
- Existing Ctrl/⌘Z/Y handling moves here from App.

### 3.7 Review (5A)
- `ReviewPage` opens when `mode === "review" && model`.
- `openReview(section)` keeps its name and signature. It now calls `useStore.getState().setMode("review")`, then records `section`/`nonce` for the scroll.
- `closeReview()` calls `leaveReview()`. Esc and × call it too.
- `.review-page` becomes `position: fixed; top: var(--topbar-h); inset-inline: 0; bottom: 0; z-index: var(--z-review)`. In Glass it is `top: calc(var(--topbar-h) + 2 * var(--float-gap))`.
- The top bar stays above it (`--z-top`), so mode buttons leave Review.
- Restyle through tokens: `--bg` page, white section cards with `--radius-l` and `--shadow-card`, display-font headings, mono numbers in `.rp-table td`.
- Delete its `max-width: 1100px` media block.
- `ModePanel`: the review case returns `null`. Remove the `ReviewPanel` import and the file.

### 3.8 Words (11A, 11B) in Madonna's files
- "Floorplans" → "Layouts".
- ImportPanel's `h3` becomes `VARIANT_LABEL[variant]`, with the intro paragraph as an `<Info>` beside it.
- "Check plan" → "Plan" in ImportPanel, ExteriorPanel and ReportPanel. "3D view" → "3D" in ReportPanel (lines 477, 491 and the snapshot caption).
- PlanningPanel/ReportPanel "(Floorplans)" → "(House menu → Layouts)".
- `floorDisplayName` for floor names shown in ReportPanel/ReviewPage tables, the ImportPanel summary and PhotosPanel option text (the option values stay raw).
- Intro paragraphs in PhotosPanel, SitePanel (≈line 295 and others) and ExteriorPanel become `<Info>`.
- "Low (fastest, for phones)" → "Low (fastest)".
- "Tap" → "Click" in these files.

### 3.9 Madonna acceptance
- `npm run check` and `npm run build` pass. Playwright, 1440×900, swiftshader flags, dev store `window.__houseStore`. Load: accept the startup prompt's load button, or House menu → Layouts… → "Load listing 91770873" and "Load listing 91770873 with two-storey extension".
1. No `aside` and no `.drawer-toggle`. `header.topbar` contains `.house-menu-btn` with text "Listing 91770873", `nav.mode-bar` with 5 buttons, and `[aria-label="Command palette"]`. `document.documentElement.scrollWidth <= 1440`.
2. 3D: `section.inspector-card` is visible at the right, and its bottom is ≤ the canvas height − 140. Click `.inspector-card-toggle`: the body is gone. Reload: still collapsed.
3. Dock: click "Plan" → `tab === "plan"`. Press Tab → `"3d"`. Press "2" → `editFloorId` is the first floor's id and `maxLevel === 1`. Press "0" → `maxLevel === null`. Compare → Wipe → `viewMode === "wipe"` and `.wipe` exists (the stub or the real one).
4. Space held on Proposed: `activeVariant === "current"` and `.peek-badge` is visible. Release: `"proposed"`. `past.length` is unchanged.
5. Click Review: `.review-page` is visible, its top is ≥ 48 px, and `nav.mode-bar` is still clickable. Esc → `mode === modeBeforeReview` (e.g. "decorate" if entered from Decorate).
6. House menu: shows Layouts…, Photos (n)…, Render quality, Look, Export JSON. Photos opens a dialog wider than 900 px.
7. Persistence: set Decorate + plan + the second floor + Side by side, then reload: all four restored.
8. Look: in the house menu choose Glass → `.app[data-look="glass"]`, and the top bar's computed `position` is `absolute` with `backdrop-filter` ≠ none. Reload: still glass. Back to Studio → attribute `studio`. ⌘K "Look: Glass" works too.
9. 1024×768: `.narrow-note` is visible and the canvas still renders.
10. Screenshots at 1440×900: Studio 3D, Studio plan, Glass 3D, Glass plan, Review page.

**Not changing:** report/planning/site/exterior *content*, sync, export/import format, the startup prompt flow.

---

## 4. Chunk B, Prince: plan canvas

**Owns:**
- `src/editor/*`: `PlanEditor.tsx`, `PlanEditor.css`, `SiteEditor.tsx/.css`, `Inspectors.tsx`, `ModeSummaries.tsx`, `DecoratePanel.tsx`, `FeatureWalls.tsx`, `AddItem.tsx`, `usePlanCamera.ts`
- new `editor/ToolRail.tsx`, `editor/planTool.ts`, `lib/planKeys.ts`, `lib/planHit.ts` (+ tests)

**Stay out of:** `App.tsx`, `styles.css`, `components/*` (use `InspectorCard`, `ContextMenu`, `Info`, `Icon`; don't edit them), `three/*`, `store.ts`, `lib/shortcuts.ts` (read `TOOL_KEY`/`TOOL_LABEL`).

### 4.1 Layout inside PlanEditor
- `.plan-editor` is `position: relative; flex: 1`, and its child `.plan-canvas` fills it (`position: absolute; inset: 0`).
- Delete the top `.toolbar` and the `.plan-hint` row.
- Overlays, all `position: absolute` in `.plan-editor`:
  - `nav.tool-rail.float-card` at `top: var(--float-top); left: var(--float-gap)`, a vertical column of 36 px `.icon-btn`s, with groups separated by 1 px `--line` dividers.
  - `.plan-zoom.float-card` at `left: var(--float-gap); bottom: 16px`, a row: zoom out, zoom in, Fit (rooms), Fit image. Icon buttons with titles "Zoom in (+)", "Zoom out (−)", "Fit the rooms (F)", "Show the whole floorplan image".
  - `.plan-status.float-card` centred at `bottom: 72px` (above the dock), 12px text. It shows **only while a tool other than `select` is active**, with today's per-tool hint text ("Click …"). It holds the "Finish room" button for the polygon tool.
  - `<InspectorCard className="side">…today's .side contents…</InspectorCard>`. In Review mode it renders nothing.
- Re-add to PlanEditor.css what the deleted `styles.css` block gave: `.inspector label` margins and `.side` field rules (they already live here). Delete the `@media (max-width: 700px)` and `pointer: coarse` blocks.
- The plan background stays white. The floorplan image now defaults to 30% opacity (store default, Kylie).

### 4.2 Tool rail (8A, `ToolRail.tsx`)
```ts
export interface RailItem { id: string; icon: IconName; label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void }
export function ToolRail({ groups, footer }: { groups: RailItem[][]; footer?: ReactNode }): JSX.Element;
// each button: className icon-btn (+active), data-tool={id}, aria-label={tip(label, shortcut)}, title={same}, aria-pressed for toggles
```
**Groups in PlanEditor**, each filtered by `PLAN_TOOLS[mode]` and dropping empty groups:
- **Furnish only:** `[Add (A, plus icon; opens the AddItem popover to the right of the rail), Paste (only with a clipboard item)]`
- `[select]`
- `[rect, room, wall, canopy]`
- `[door, window, gap]`
- `[measure]`
- **Always:**
  - `[image toggle (I) with a small chevron button beside it that opens a .popover holding today's opacity range, walls toggle]`
- Footer: an `<Info>` holding today's select-mode hint for the mode, in click/drag wording.

`AddItem.tsx`: its popover anchors to the rail button and opens to the right (`left: calc(100% + 8px)`). Keep its catalogue behaviour.

### 4.3 Keys (6A, 8B) via `lib/planKeys.ts` (+test)
```ts
export type PlanKeyAction = { tool: Tool } | { rotate: 90 | 15 } | { image: true } | { fit: true } | { zoom: 1 | -1 } | { add: true } | null;
export function planKeyAction(e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  ctx: { mode: Mode; fixtureSelected: boolean; placing: boolean }): PlanKeyAction;
```
- **Rules:** §1.10. A tool key returns `{tool}` only when `PLAN_TOOLS[mode]` includes it. Calibrate has no key.
- **Tests:**
  - R in Build with no fixture → rect. R in Furnish with a fixture → rotate 90. Shift+R → rotate 15.
  - Ctrl+D → null (left to the existing duplicate). D in Build → door; D in Decorate → null.
  - I → image. A outside Furnish → null.
- **Wiring:** PlanEditor's `onKey` calls `planKeyAction` **after** its existing modifier branches (copy, paste, duplicate, Esc, arrows) and before Delete. `{tool}` → `pick(tool)`. Rotate keeps today's code. Image toggles `planImage.show`. Zoom → `zoomBy(1.4 or 1/1.4)`. Fit → `fit()`. Add opens the picker.

### 4.4 Calibrate (8A) and ceiling height (12A)
- **`editor/planTool.ts`:** `requestPlanTool(tool: Tool)` stores a pending tool and dispatches `house:plan-tool`. `takePendingTool(): Tool | null`. PlanEditor takes it on mount and listens for the event; on either it calls `pick(tool)`.
- **`FloorSettings`:** beside Scale, add `button` "Calibrate from two points…" → `setUi({ tab: "plan", editFloorId: floor.id }); requestPlanTool("calibrate")`. Build only (`FloorSettings` is Build-only already).
- **`BuildSummary`:** a new `Section id="build.house" title="House" summary={`Ceiling ${h.toFixed(2)} m`}` above FloorSettings, holding "Ceiling height (m)" as a `NumberField` (step 0.05, min 2, max 4) → `updateModel(variant, { ceilingHeight })`. This is undoable through the store's `setState`.

### 4.5 Context menus (6C) via `lib/planHit.ts` (+test)
```ts
export type PlanTarget = { kind: "fixture"; id: string } | { kind: "opening"; id: string } | { kind: "wall"; id: string }
  | { kind: "room"; id: string; edge: number | null } | { kind: "empty" };
export function planTargetAt(floor: Floor, p: Pt, mode: Mode, tol: { hit: number; edge: number }, solids?: …): PlanTarget;
// order: fixture (furnish), opening (build, within hit of its centre line), free wall (build/decorate, within hit), room (last polygon containing p; edge = nearest edge within tol.edge), empty
```
- Add `onContextMenu` on the svg: `preventDefault()`, `planTargetAt`, then open `ContextMenu` with the menu below.
- Extract `placeOpeningAt(kind, raw)` from `onClickCanvas` so menu items reuse it.

| Target | Mode | Items |
|---|---|---|
| room | Build | Rename… (`askText` → `updateRoom` name) · Decorate this room (`setMode("decorate")`, select it) · Add door here / Add window here (only when `edge !== null`; `placeOpeningAt` at the nearest point on that edge) · Knock through into… (only when it has neighbours: `choose()` over `knockThroughNeighbours` names → `confirmKnockThrough`) · sep · Delete room (danger) |
| room | Decorate | Decorate the floor · Decorate this wall (when edge) · Edit shape in Build (`setMode("build")`, select) |
| opening | Build | Flip hinge · Flip swing (doors: the same patches as OpeningInspector's buttons) · Make it a door / window / gap (the two it isn't) · sep · Delete |
| wall | Build | Add door here · Add window here · sep · Delete wall |
| fixture | Furnish | Turn 90° · Duplicate · Copy · sep · Remove |
| empty | any | Paste here (Furnish-able clipboard: switch to Furnish if needed, paste at the point) · Fit the rooms · Show/Hide floorplan image |

Each item selects its target first.

### 4.6 Hover (6D) and peek
- Room polygons get `onPointerEnter` (set `hoveredRoomId`, unless dragging) and `onPointerLeave` (clear it if it is still this room).
- Draw the hovered room, when it is on this floor and is not the selected room: a polygon outline in `--hover-room` (`#0f6e66`), 2 px screen width, with an 8% fill, `pointerEvents: none`.
- In `BuildRoomPanel`/`DecoratePanel` the room-name header, and in the knock-through list each neighbour row, set and clear `hoveredRoomId` on mouseenter/mouseleave.
- **Peek:** when `useStore(s => s.peek)`, add class `peeking` to the svg (`pointer-events: none`) and hide the rail and status line.
- `usePlanCamera` `fitKey` becomes `floor.id` (no variant).

### 4.7 SiteEditor
- The same treatment: `.site-canvas` fills the editor.
- The `.toolbar` becomes a `ToolRail` with Select/move (select icon), Draw surface (rect icon; the surface-kind select moves into the status line while drawing), Draw building (house icon), and Fit in the zoom cluster.
- The hint becomes an `<Info>` in the rail footer.
- `.site-side` is wrapped in `InspectorCard className="side site-side"`.
- Delete its 700 px media block.

### 4.8 Removal and words
- Delete `useCoarsePointer` and use the fine values (`handleR` 6, `dotR` 3.6, `hitR` 8, `hitSmall` 6, `snapTol` 10, opening `hitT` 14).
- Remove "Scale N px/m" and the `calibrate` rail button. The `Tool` stays in `PLAN_TOOLS.build`, so `modes.test` still passes.
- 11B: the `<p className="muted small">` help lines in Inspectors.tsx (≈195, 198, 282, 298, 301, 365, 512, 556, 668, 789), FeatureWalls (171) and SiteEditor (803) become `<Info>` next to their field or heading. Short status lines (a single line about state, e.g. "Floor area …") stay.
- "Tap" → "Click" everywhere in `editor/*`, including SVG `<title>`s. Drop "pinch".
- `DecorateSummary` reads "Click a floor, or a wall near its edge, to decorate it."
- Plan text and edge labels (`.plan-text`, `.plan-edge-label`) use `font-family: var(--font-mono)`.

### 4.9 Prince acceptance
`npm run check` (with the new `planKeys` and `planHit` tests) and `npm run build` pass. Playwright, 1440×900, listing loaded, plan tab, Build:
1. `nav.tool-rail` has buttons with `data-tool` select, rect, room, wall, canopy, door, window, gap, measure, and none with calibrate. `[data-tool=rect]` has title "Rectangle room (R)". No `.toolbar`. No text "px/m" in the toolbar area.
2. Press R → rect active, and `.plan-status` is visible with "Click one corner…". Press V → `.plan-status` is gone. Press D → door. Press Esc then V.
3. Furnish: select an item, press R → its `rot` +90 and the tool is unchanged. Press A → the Add picker opens.
4. Press I → `planImage.show` toggles. A fresh profile has `planImage.opacity === 0.3`.
5. `.plan-zoom` is in the bottom-left quarter, and zoom in changes the svg viewBox.
6. Right-click a room's centre → `[role=menu]` contains "Rename…" and "Delete room". Choose "Decorate this room" → `mode === "decorate"` and the room is selected. Right-click a door → "Flip hinge".
7. Hover a room → `hoveredRoomId` is its id. Leave → null.
8. Build summary, nothing selected: "House" section → set the ceiling to 2.6 → `variants.current.ceilingHeight === 2.6`. Undo → it is back.
9. Floor settings → "Calibrate from two points…" from 3D → `tab === "plan"` and the calibrate tool is active (the `.plan-status` text contains "known distance").
10. Plot on the plan: the site editor shows a `nav.tool-rail` and `section.inspector-card`.
11. Screenshot plan Build, Decorate (room selected), Furnish (Add open).

**Not changing:** drawing, snapping, undo merging, the selection rules from modes-plan, catalogue contents, the Inspectors' field set (only help text placement and the two additions).

---

## 5. Chunk C, Dua Lipa: 3D

**Owns:**
- `src/three/Viewer.tsx`, `House.tsx`, `ViewCube.tsx/.css`, `WipeCompare.tsx` (replaces the stub, same props), new `Wipe.css`, `cameraLink.ts`, `cameraPose.ts`
- `src/lib/cameraViews.ts` (+test)
- `src/components/SunControls.tsx/.css`

**Stay out of:** App.tsx, styles.css, editor/*, store.ts.

### 5.1 Framing (7)
- `cameraViews.ts`: `export function frameFor(models: HouseModel[], boundaries: V2[][], roofAllowance = 3.5): FrameBox`. This moves Viewer's `frame` maths here (bounds of all floors, top level, ceiling and slab, roof allowance, plot points).
- Viewer calls it with **both** `variants.current` and `variants.proposed` (whichever exist) and both plots (`siteOf(sites, "current")`, `siteOf(sites, "proposed")`). The orbit `centre`/`size` use the same union.
- **Tests:**
  - The union contains each model's box.
  - `homeView(frameFor([A, B], …))` is identical whichever variant is active, by construction.
  - The listing's As listed and Proposed (`listing91770873` presets) give one pose.
- Orbit's first jump waits until `canvasSize.width > 0`.

### 5.2 Camera link and pose memory (4C, 12E)
- **`cameraLink.ts`:**
  ```ts
  export interface Pose { position: V3; target: V3 }
  export function publishPose(from: string, p: Pose): void;            // stores lastPose, notifies others
  export function subscribePose(fn: (from: string, p: Pose) => void): () => void;
  export function lastPose(): Pose | null;
  ```
  In DEV, `Object.assign(window, { __houseCamera: { lastPose } })`.
- **`cameraPose.ts`:** `loadCameraPose(): Pose | null` and `saveCameraPose(p)`, localStorage key `house-modeler-camera`, in try/catch, rejecting non-finite numbers. Add `isValidPose` to cameraViews with a test.
- **Orbit** (`linkId = captureId ?? "main"`):
  - First pose is `lastPose() ?? loadCameraPose() ?? home`.
  - On controls `change`, when not applying a remote pose and not gliding: `publishPose`.
  - Subscribed: apply other ids' poses (set the position and target, `update()`, behind an `applying` guard).
  - On controls `end` and at the end of a glide: `saveCameraPose` (debounced 300 ms) and publish.
- **Views:** move the `house:view` listener from ViewCube into Orbit. ViewCube's buttons call `requestView(side)`, so every linked view glides to the same pose.
- Set `--view-yaw` on `closest(".wipe") ?? closest(".viewer")`.

### 5.3 Wipe (4A, `WipeCompare.tsx` + `Wipe.css`)
- `div.wipe` (`position: relative; flex: 1`) holds:
  - the As listed `<Viewer chrome={false} captureId="wipe-current" variant="current">`
  - the Proposed viewer in `div.wipe-top`, `position: absolute; inset: 0; clip-path: inset(0 0 0 calc(var(--wipe) * 100%))`
  - `div.wipe-divider[role=slider][aria-label="Wipe position"][aria-valuenow]`, a 2 px white line with a 28 px round handle at `left: calc(var(--wipe) * 100%)`
  - labels `.wipe-label` "As listed" (top-left) and "Proposed" (top-right)
  - one `<ViewCube>` and one `<SunControls/>`
- `--wipe` comes from component state (default 0.5, clamped 0.05–0.95).
  - The divider drags with pointer capture. ←/→ move it 0.05.
  - Moving it needs no re-render of the canvases: write the CSS variable on `.wipe` through a ref during the drag, and commit to state on release.
- `onSelectRoom` from each viewer calls `props.onSelectRoom(f, r, k)`.
- `Viewer` gets `chrome?: boolean` (default true). False hides the title, ViewCube and SunControls; the Orbit still listens for views.

### 5.4 Sun panel (one sun)
- `SunControls` renders only when `panelPrefs.sunOpen` (drop `OPEN_KEY` and the `matchMedia` default). Its header ▸/▾ collapse becomes a × that sets `sunOpen` false.
- Position: `left: var(--float-gap); bottom: 72px`, as a `.float-card`.
- `.split .viewer + .viewer .sun-panel { display: none }` stays.
- The `sun-hint` paragraph becomes the toggle's `title`.

### 5.5 View cube restyle (7)
- 108×108 `.float-card`, at `right: var(--float-gap); bottom: 16px`.
- Compass marks N/E/S/W sit on an outer ring at radius 44 (9 px, muted; N in `--danger`). The sun dot is on the same ring.
- Faces are 22 px circles at radius 24, labelled **F, B, L, R** (titles "Look at the front", …). A face's outer edge is at 35 px, clear of the marks (≥ 37).
- "Top" is a 26 px centre button.
- Home ⌂ is a 24 px button in the card's top-left corner (inside it, `top: 6px; left: 6px`).
- Active hover uses `--accent`. Fonts come from tokens.

### 5.6 Hover and context menu in 3D (6C, 6D)
- `RoomFloor` gets:
  - `onPointerOver={e => { e.stopPropagation(); setUi({ hoveredRoomId: room.id }) }}`
  - `onPointerOut` (clear it if it is still this room)
  - `onPointerUp={e => e.button === 2 && e.delta < 4 && (e.stopPropagation(), onContext(e.nativeEvent.clientX, e.nativeEvent.clientY))}`
- Thread `onContextRoom?(floor, room, x, y)` House → FloorGroup → FloorShell → RoomFloor. Pass it only for a non-ghost House.
- **Highlight:** a new `RoomHover({ floor })` inside FloorShell subscribes to `hoveredRoomId` by itself, so FloorShell doesn't re-render. It draws the room's polygon at y = 0.02 as a `meshBasicMaterial` (`#0f6e66`, opacity 0.22, `depthWrite: false`) plus a `lineLoop` outline. Not drawn for the ghost house.
- **Viewer** keeps `menu` state and renders `<ContextMenu>` with five items:
  - **Select** (`onSelectRoom`)
  - **Edit on the plan**: if mode isn't build or decorate, `setMode("build")` first, then `setUi({ tab: "plan", editFloorId, selectedRoomId })`.
  - **Decorate this room**: `setMode("decorate")` + select.
  - **Show up to this floor**: `setUi({ maxLevel: floor.level, editFloorId: floor.id })`.
  - **Look from above**: `requestView("top")`.
- Words: "phones" in the `DPR` comment, and "tap" in comments and props docs → "click".

### 5.7 Dua Lipa acceptance
`npm run check` (cameraViews tests) and `npm run build` pass. Playwright, 1440×900, both layouts loaded:
1. Single 3D, As listed: read `__houseCamera.lastPose()`. Switch to Proposed, then press ⌂ on each: the poses are equal within 1e-6.
2. Orbit (mouse drag 200 px), then Tab to Plan and back to 3D: `lastPose` matches the pose before Tab within 1e-3. Reload: the same pose (from localStorage).
3. Side by side: drag in the left canvas, and the right viewer's camera (via `lastPose` + both canvases' screenshots differ from before) follows. There is exactly one `.sun-panel` when `sunOpen`.
4. `setUi({ viewMode: "wipe" })`: `.wipe` has 2 canvases. `.wipe-divider` at 50%. Drag it to 25% → `clip-path` on `.wipe-top` contains "25". A drag at x = 15% orbits both views. Screenshot.
5. View cube: no two of `.vc-mark`, `.vc-face` overlap (compare `getBoundingClientRect`s). Screenshot.
6. Hover the centre of a ground-floor room (front view, labels on) → `hoveredRoomId` is set. Right-click without moving → `[role=menu]` with "Edit on the plan". Choosing it → `tab === "plan"`. A right-drag (pan) opens no menu.
7. Screenshot single 3D in Studio and in Glass (`setPrefs({ look: "glass" })`).

**Not changing:** materials, textures, roof and site geometry, capture/export, the Decorate wall pick.

---

## 6. Risks
- **Two WebGL contexts for wipe and side by side** at "high" quality double GPU cost and may be slow in swiftshader. Checks should use `settings.quality = "low"`. Acceptable on desktop.
- **Glass blur cost and contrast.** `backdrop-filter` over a live WebGL canvas re-blurs every frame under each card. It is kept to the small floating cards (top bar pill, rail, card, dock, cube, popovers), never `main` or a full-screen layer. Worth a quick fps look (orbit for 5 s with and without Glass). Busy roofs behind 62%-white cards could drop contrast; raise `--card-bg` to .72 if the screenshots read poorly.
- **Tab is taken from focus navigation** outside fields and dialogs, so keyboard-only focus movement gets worse. Shift+Tab is left alone.
- **Peek swaps `activeVariant`.** Anything subscribed to it re-renders, and a long hold while clicking edits As listed: the plan is made inert during peek, but 3D clicks still select. Window blur ends the peek.
- **Camera link feedback loops** (OrbitControls damping emits `change` after release). The `applying` guard and "no publish while gliding" must both hold, or the views drift. This is the Opus review's main focus.
- **Persisted `tab: "plan"` with a missing floor or no model** falls back to `floors[0]` or the empty state. A persisted `viewMode` of side by side or wipe with one layout shows single.
- **`styles.css` is shared by Kylie (tokens) and Madonna (layout).** Kylie merges first. Prince must re-create the plan-editor rules Madonna deletes, or the plan loses styling until both merge; check the plan after the final merge.
- **Hover from report rows is dropped** (§1.13). If the owner wants it, it needs Review to be less than full-screen.
- **Font payload:** about 200–300 KB of woff2/woff added to the hosted build. Each font has a system fallback if a file fails.
