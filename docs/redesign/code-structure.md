# Code structure: lint, rule tables, editor and fixture splits, chrome tokens

Status: proposal, not started. Written 31 Oct 2026. Source findings: CODE2, CODE7, CODE8, CODE13, CODE1 (phone review: "Phone chrome offsets duplicated as magic numbers") and the verifier's CSS sprawl note on that finding (203 chassis/touch lines in 29 files). Related quick wins it builds on: CODE1 (NumberField), CODE3 (canEdit), CODE5 (Glass removed), CODE6, CODE11, CODE12, CODE14.

Author: Bruno Mars. House: listing 91770873 (no address, postcode or names in this file).

## Why (the problem, with numbers and evidence)

All numbers checked at HEAD `8df6020`.

| Problem | Evidence at HEAD | Cost today |
|---|---|---|
| Nothing lints | no `eslint.config.*`, no eslint in `package.json`; 42 `eslint-disable-next-line react-hooks/exhaustive-deps` comments in `src` (13 in `src/three/House.tsx`, 5 in `walk/WalkControls.tsx`, 3 each in `Viewer.tsx` and `Site.tsx`) | The disables check nothing. CODE10 (stale `placing.rot` in `useTools.ts`) is exactly the bug lint would have caught. |
| JS outside `src` is never typechecked | `tsconfig.json` `include: ["src"]`; `server/*.mjs` (auth, sync, houses), `scripts/**/*.{mjs,cjs}` and `vite.config.ts` are unchecked: about 6,080 lines. No `@types/node` installed. | A typo in `server/auth.mjs` ships to Render. |
| No unused-code check | CODE11 found 1 dead file and about 21 dead or test-only exports by hand. | It grows back. |
| `planningCheck` is one function | `src/lib/planning.ts:363-856`, 494 of 1,295 lines; Class A alone runs 559-782 inside an extension loop. `porchRules`, `hardSurfaceRule`, `boundaryRules`, `fortyFive`, `partyWall` are already split out. | Any rule change means reading 494 lines and 30-odd shared locals (`g`, `cur`, `pro`, `orig`, `added`, `fresh`, `ext0`, `footExt`, ...). |
| `SiteEditor.tsx` is 927 lines | `SitePlan` 70-508; inline key handler 270-340 (Ctrl D/C/V, arrows, Esc, Enter/Backspace, V R C P A B Q E F + -, Delete); plot `Inspector` 508-714 plus `OpeningWidth`, `EmptyInspector`, `Clearances`, `ScreenBlocks`, `FollowGround` to 927; its own scale bar (`NICE` at line 40, `scaleLen` at 357, markup at 426). | The plan side has the pure, tested `lib/planKeys.ts` (46 lines + test); the site side has none. |
| Fixture catalogue lives in a 3D file | `fixtureParts` in `src/three/Fixtures.tsx:370-1674` plus `lightFittingParts` from 1679; no `THREE.` use in that range; 15 positional args; one caller at line 181: `fixtureParts(item.symbol, b.w, b.d, b.h, colour, f.worktop ?? WORKTOP, b.z0, j, f.seat, f.front, cornerEnds(...), f.frame, !!pat, drop, lamp ? lampGrid(f, item) : undefined)`. File is 1,772 lines. | No per-symbol tests; the garden equivalent (`lib/gardenParts.ts` `partBounds`, `lib/plantForms.ts`) has them. |
| Phone offsets are magic sums | `useCameraInsets.ts:5,7` `SHEET_PEEK_PX + 12 + 44 + 12`, `12 + 54 + 12`; CSS `calc(var(--sheet-peek) + 12px + 44px + 8px)` 3 times (`PlanEditor.css:121`, `SunControls.css:41`, `SiteEditor.css:71`), plus `+ 44px` again at `SiteEditor.css:73`, `--tabbar-h + --sheet-peek + 12px + 44px + 12px` at `PlanEditor.css:124`, `76px + 108px + 8px` and `84px + 8px` in `Measure.css:5,29`, `bottom: 76px` in `SunControls.css:2`, `+ 332px` / `+ 312px` in `SiteEditor.css:45,68`. | Every shell change (the quick wins' hidden sheet detent, 44 px dock) has to find and re-add each sum. |
| CSS chassis sprawl | 203 `[data-chassis]`/`[data-touch]` lines over 29 files: phone 106, touch 70, desktop 18, tablet 17. Top: `styles.css` 31, `ReviewPage.css` 24, `walk.css` 21, `PlanEditor.css` 19. No `@layer` anywhere. | Hard to see what the phone looks like from code; specificity creep (`.app[data-chassis="phone"] .x` beats `.x`). |

## Goal and non-goals

Goals
- Every hook dependency, every JS file and every unused export is checked by `npm run check` and CI.
- Each refactor is behaviour-identical and proven so by a golden test or a measured screenshot/rect diff.
- Big files shrink: `planningCheck` under 120 lines; `SiteEditor.tsx` about 350; `Fixtures.tsx` about 470.
- Phone chrome geometry has one source: CSS tokens, read by TS through one probe.

Non-goals
- No new features, no visual change on phone or desktop (iPad may move by a pixel or two, see Open questions).
- No change to `store.ts`, persistence or saved data shape.
- No Stylelint, Prettier or formatter churn.

## Decisions already made (by the owner; do not reopen)

1. Phone: showing, walking, measuring, light Decorate and Furnish. Build, Electrics, Garden, Plot are view-only on phones.
2. Devices that matter: iPhone 390x844, desktop 1440x900 and 1920x1080. iPad keeps working, not optimised.
3. Look: full-bleed canvas, floating chrome everywhere, brand per docs/brand.md, no Glass.
4. Quick wins are being built now; this is a spec for later.
5. Standing rules from CLAUDE.md: finished work goes to `main` after `npm run check` and `npm run build`; pure logic in `src/lib` with tests; CSS tokens only.

## Assumptions (including which quick wins have landed)

All quick wins of 31 Oct 2026 have landed on `main` before any chunk here starts. In particular:
- Glass removed (CODE5): no `data-look`, no `Look` type; floating islands on every chassis; `--float-top` sits under the islands.
- Phone shell: top row mark | layout switch | undo redo; dock 44 px; Measure moved into the dock (so `.measure-btn` phone rules in `Measure.css` may be gone; Chunk E handles whatever is left); 44 px compass/home button; sheet has a `hidden` detent and `BottomSheet.tsx` still sets `data-sheet` on `.app`.
- `lib/chassis.ts` has `isCompact` and `canEdit(mode, compact)` (CODE3); the SiteEditor key handler already checks `canEdit`.
- Raw number inputs are `NumberField` (CODE1); the local `num` helpers in `SiteEditor.tsx` are gone.
- `Inspectors.tsx` is split by subject (CODE14) into `src/editor/inspectors/`.
- Dead code removed (CODE11); hex colours on tokens (CODE12).
- `.github/workflows/check.yml` exists and runs `npm ci && npm run check && npm run build` on push and PR.
- Clearances inside the edge inspector removed (CODE6); `SiteFigures` stays.
- Line numbers in this spec are HEAD `8df6020`; after the quick wins they will have moved. Builders find code by function name, not line.
- Node 22 locally and on Render; tooling versions at writing: eslint 10.14, typescript-eslint 8.72, eslint-plugin-react-hooks 7.1, knip 6.44, @types/node 22.x. Pin exact versions in `package-lock.json`; if eslint 10 and typescript-eslint disagree on peers, use eslint 9.

## Design (what the user sees and does, per chassis: phone, desktop; iPad notes; every state)

There is no user-visible change. This section says what the developer and the owner see.

Developer workflow, after:

```
npm run check     tsc (app) + tsc -p tsconfig.node.json + eslint . + knip + vitest
npm run lint      eslint . (with --fix)        npm run knip   knip
```

| Surface | Before | After |
|---|---|---|
| Phone (390x844) | magic-sum offsets; pixel-identical after | same pixels; offsets from tokens; the plan fit reads the real free area |
| Desktop (1440x900, 1920x1080) | unchanged | unchanged, proven by rect and screenshot diffs |
| iPad | unchanged | may differ by 1-2 px where a tablet rule used a different sum; accepted if the owner agrees (Q4) |
| CI on GitHub | check + build | check (now including tsc node, lint, knip) + build; annotations on the PR |

States (the tooling, since there is no UI):
- Empty: a clean tree passes all checks in under 60 s locally (target; check is 34 s today).
- Busy: CI shows one job, "check"; caches `~/.npm`.
- Error: lint errors fail CI; lint warnings are printed but pass until Stage 3; knip failures name the file and export.

Chrome tokens on the phone (what Chunk E builds), sketched:

```
before                                   after
.plan-status { bottom: calc(             .plan-status { bottom: var(--chrome-bottom); }
  var(--sheet-peek)+12px+44px+8px) }     .app[data-chassis=phone] {
useCameraInsets: 64+12+44+12               --dock-h: 44px; --rail-w: 54px; --gap: 12px;
                                           --sheet-now: var(--sheet-peek);          (set per data-sheet)
                                           --chrome-bottom: calc(--sheet-now + --gap + --dock-h + --gap);
                                           --chrome-left: calc(--gap + --rail-w + --gap); }
                                         <div class="chrome-probe"> sized by those tokens;
                                         useCameraInsets measures it
```

## Technical design (files and functions, type and store changes, persisted-state migration, tests to add, performance and accessibility notes)

No store or type changes to persisted data; no migration needed in any part.

### (a) Lint, typecheck for JS, knip, CI

Files: `eslint.config.js` (new), `tsconfig.node.json` (new), `knip.json` (new), `package.json` (scripts, devDependencies), `.github/workflows/check.yml` (grows).

`eslint.config.js` (flat config):
- `typescript-eslint` `configs.recommended` (not type-checked: keeps it fast) on `src/**/*.{ts,tsx}`.
- `eslint-plugin-react-hooks`: only `rules-of-hooks: error` and `exhaustive-deps: warn` in Stage 1. Do not enable the v7 React Compiler rules (`set-state-in-effect`, `refs`, `purity`, ...) in this work; list them in Out of scope.
- `reportUnusedDisableDirectives: "error"` from Stage 2, so stale `eslint-disable` comments fail.
- `server/**`, `scripts/**`, `vite.config.ts`: `js.configs.recommended` with Node globals.
- Ignore `dist/`, `node_modules/`, `reference/`, `public/`.
- Relax: `@typescript-eslint/no-explicit-any` warn (one known `any` in `lib/sync.ts:86` already has a line disable), `no-unused-vars` off for TS (tsc's `noUnusedLocals` owns it).

Stages:

| Stage | Rule state | CI | Exit |
|---|---|---|---|
| 1 | `exhaustive-deps` warn, everything else at recommended; `eslint . --max-warnings=<current count>` | runs lint; fails on errors and on new warnings | config merged, error count 0 |
| 2 | each of the 42 disable comments reviewed: delete the disable and fix, or keep it with a reason (`// eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount: <why>`); `reportUnusedDisableDirectives` on | ratchet `--max-warnings` down per merge | every remaining disable has a `--` reason |
| 3 | `exhaustive-deps` error; `--max-warnings=0` | lint gates | 0 warnings |

`tsconfig.node.json`:
```json
{ "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "allowJs": true, "checkJs": true, "noEmit": true, "strict": false, "noImplicitAny": false,
    "skipLibCheck": true, "types": ["node"] },
  "include": ["server/**/*.mjs", "scripts/**/*.mjs", "scripts/**/*.cjs", "vite.config.ts"] }
```
- Start with `strict: false` (no JSDoc exists in `server/`: 0 `@param`s); turn on `strictNullChecks` for `server/` only once it is clean (later, optional).
- `vite.config.ts` imports `virtual:houses` types? It does not; it builds the registry. If it pulls app types, add `src/globals.d.ts` to `files`.
- Errors that are only JS inference noise get a JSDoc type, not `// @ts-ignore`. Budget: if Stage 1 shows over 60 errors in `scripts/`, exclude `scripts/*.cjs` (the Playwright checks) first and file them as a follow-up.
- Add `@types/node@22` to devDependencies.

`knip.json`:
- entry: `src/main.tsx`, `server/server.mjs`, `scripts/**/*.{mjs,cjs}`, `vite.config.ts`, `src/houses/*/index.ts` (the `virtual:houses` registry imports them dynamically, so knip cannot see it), `**/*.test.ts`, `server/**/*.test.mjs`.
- `ignoreExportsUsedInFile: true`; `ignore: ["src/houses/_template/**"]`.
- Mode 1 report only (`knip --no-exit-code`); mode 2 gating once the first report is cleared.
- Test-only exports (the CODE11 list, for example `sunlightFor`, `fitDistance`) are reported by `knip --production`; handle per Q3.

`package.json` scripts:
```
"typecheck": "tsc --noEmit && tsc -p tsconfig.node.json",
"lint": "eslint . --max-warnings=<N>",
"knip": "knip",
"check": "npm run typecheck && npm run lint && npm run knip && vitest run",
"build": "tsc --noEmit && vite build"          (unchanged; build stays fast)
```

`.github/workflows/check.yml` grows to:
- one job, `ubuntu-latest`, Node 22, `actions/setup-node` with `cache: npm`;
- `npm ci` (fall back to `npx -y npm@11.6.2 ci` per CLAUDE.md if the edgesOut error shows);
- steps named separately so failures read clearly: Typecheck app, Typecheck node, Lint (default `stylish` formatter), Knip, Tests, Build;
- no Playwright in CI (needs SwiftShader and a dev server; slow); see Open question Q1.

Performance: `eslint .` without type info on about 300 files is about 5-10 s; knip about 5 s; tsc node about 3 s. Target `npm run check` under 60 s.

Proof of no change: (a) changes no runtime code except Stage 2 hook-deps fixes. Each Stage 2 fix that changes a deps array is a behaviour change by definition: it ships with either a unit test or a named Playwright script run (table in the build plan), and an Opus review of the diff.

### (b) `planningCheck` as a table of rules

File: `src/lib/planning.ts` only (+ `planning.test.ts`). Optional split into `src/lib/planning/` folder is not needed; keep one file, about 1,300 lines but in small functions.

Shape:
```ts
/** Everything the rules share, built once per check. */
interface PlanCtx {
  current: HouseModel; proposed: HouseModel; sites: { current?: Site; proposed?: Site }; opts: PlanningOptions;
  site?: Site; bEdges: BEdge[]; houseType: "detached" | "semi-detached" | "terraced"; attached: boolean;
  g: Grid; levels: number[]; ground: number;
  cur: Map<number, Uint8Array>; pro: Map<number, Uint8Array>; orig: Map<number, Uint8Array>;
  added: Map<number, Uint8Array>; fresh: Map<number, Uint8Array>;
  origFoot: Uint8Array; proFoot: Uint8Array; anyAdded: Uint8Array; anyFresh: Uint8Array;
  ext0: Map<number, Extents>; footExt: Extents; origTop: number; origWidth: number;
  curPlan: RoofPlan; proPlan: RoofPlan; existing: Heights; pExt: Exterior;
  parts: Part[]; porches: Part[]; extensions: Part[]; original: string;
}
type Part = ExtensionPart & { cells: number[] };
interface RuleOut { rules: PlanningRule[]; consents?: Consent[] }
type RuleSet = (ctx: PlanCtx) => RuleOut;

const RULE_SETS: RuleSet[] = [
  extensionRules,     // Class A, per extension: A.1(e) front, A.1(j) side, A.1(f)(g)(i) rear, A.1(ii) eaves, A.1(c)(d) height, A.3(c) pitch, A.3(b) side windows
  coverageRule,       // A.1(b)
  materialsRule,      // A.3(a)
  porchSet,           // wraps porchRules (Class D)
  hardSurfaceSet,     // wraps hardSurfaceRule (Class F)
  boundarySet,        // wraps boundaryRules (Part 2 Class A, kerb consent)
  fortyFiveSet,       // wraps fortyFive
  otherConsents,      // structural diff, partyWall
];

export function planningCheck(current, proposed, sites = {}, opts = {}): PlanningCheck {
  const ctx = buildCtx(current, proposed, sites, opts);      // lines 363-~545 today
  const outs = RULE_SETS.map((r) => r(ctx));
  return verdictOf(ctx, outs.flatMap((o) => o.rules), outs.flatMap((o) => o.consents ?? []));  // 815-848 today
}
```
- `buildCtx` contains the grid, masks, the "original house" (1948 wing) logic and part detection (components, porch classification). If it exceeds about 150 lines, split `originalHouse(ctx0)` and `findParts(ctx0)`.
- Order of `RULE_SETS` must equal today's push order, because the output array order is user-visible in `PlanningPanel` and the report.
- `push` closures and `let` accumulators inside today's Class A loop become locals of `extensionRules`. Shared message helpers (`m`, `m2`, `deg`, `fromBoundary`) stay module-level.
- Public API unchanged: `planningCheck`, `PlanningCheck`, `PlanningRule`, `Consent`, `CAVEATS`, `STATUS_LABEL`.

Proof of no change:
1. First commit (before any refactor): `planning.golden.test.ts` that runs `planningCheck` over every input model used in `planning.test.ts` (move its model builders into a shared `src/lib/planningFixtures.ts` test helper that both test files import) plus the built-in house's As listed vs Proposed, with and without `wingAfter1948`, and serialises the full result with `toMatchSnapshot()`. Commit the `.snap`.
2. Refactor. The snapshot and all 26 existing tests must pass unchanged; the `.snap` file must have no diff (`git diff --exit-code src/lib/__snapshots__`).
3. Timing: a vitest bench or a simple `performance.now()` assertion is not needed; the context is built once, as today.

### (c) Split `SiteEditor.tsx`

Mirror of docs/editor-core-plan.md (PlanEditor is now 416 lines with `plan/use*.ts`, `plan/chrome/*`, `lib/planKeys.ts`).

New and changed files:

| File | Content |
|---|---|
| `src/lib/siteKeys.ts` (+ `siteKeys.test.ts`) | pure `siteKeyAction(e: PlanKeyEvent, ctx: SiteKeyContext): SiteKeyAction` |
| `src/editor/site/useSiteKeys.ts` | the `useEditorKeys` call that maps actions to store calls (today's 270-340) |
| `src/editor/site/PlotInspectors.tsx` | `PlotInspector` (today `Inspector`), `OpeningWidth`, `EmptyInspector`, `ScreenBlocks`, `FollowGround`, `FOLLOW_LABEL`, `EDGE_LABEL`, `EDGE_DEFAULT_HEIGHT` |
| `src/editor/site/SiteChrome.tsx` (optional) | the rail items (`toolItem`), zoom, north arrow, status, if `SitePlan` is still over 350 lines |
| `src/editor/core/components.tsx` | `ScaleBar({ px, className })`; exported through `core/index.ts` |
| `src/lib/editorCore.ts` (+ test) | pure `niceScale(px: number, minPx = 70): number` using today's `NICE` list; tests: 0.5..100 picks, fallback 100 |
| `src/editor/SiteEditor.tsx` | `SiteEditor`, `NoSite`, `SitePlan` composition only |

Types:
```ts
export interface SiteKeyContext {
  garden: boolean; tool: Tool; itemsSelected: number; plotSelected: boolean;   // psel
  selected: boolean;                                                            // sel (any)
  polyPoints: number; clipboard: number; canEdit: boolean;
}
export type SiteKeyAction =
  | { clip: "duplicate" | "copy" | "paste" } | { nudge: { x: number; y: number }; target: "items" | "plot" }
  | { escape: true } | { finishPoly: true } | { undoPoint: true } | { tool: Tool } | { toggleAdd: true }
  | { rotate: 15 | -15 } | { fit: true } | { zoom: 1 | -1 } | { delete: true } | null;
```
- Re-use `PlanKeyEvent` from `lib/planKeys.ts` (export it if needed) and `arrowDelta` from `lib/nudge.ts`.
- Keep today's precedence exactly: Ctrl/Cmd clipboard (garden only) returns first; then arrows; Escape; polygon Enter/Backspace; letters; Delete/Backspace. Note the current quirk: Backspace with a polygon in progress removes a point and never deletes the selection. Keep it, and test it.
- `preventDefault` decisions move into the action (the hook calls it for every non-null action except `escape`, matching today: check each branch).
- `canEdit` false (phone, view-only modes): only `escape`, `fit`, `zoom` and arrows-with-nothing-selected survive; tested.
- `.site-scale` class name kept so no CSS moves in this chunk.

Proof of no change:
- `siteKeys.test.ts`: one test per branch (about 25 cases), including the precedence cases above.
- `npm run regress:editors -- --port <n> --only site` green before and after, and `scripts/test-garden.cjs` green.
- Screenshots `plan-plot`, `plan-garden`, `plan-garden-item` at 390x844, 1440x900, 1920x1080 diff below 0.1% of pixels (see Acceptance).

### (d) `fixtureParts` into `src/lib/fixtureParts.ts`

New `src/lib/fixtureParts.ts` (+ `fixtureParts.test.ts`); `src/three/Fixtures.tsx` keeps meshes, materials, `GEOMETRY`, `softGeometry`, `setLampGlow`, `buildFixtureMeshes`.

Types (move from Fixtures.tsx):
```ts
export type PartShape = "box" | "cyl" | "quarter" | "shell" | "wedge" | "blob" | "ball" | "soft";
export type Finish = "matt" | "satin" | "gloss" | "metal" | "glass" | "mirror" | "glow" | "lamp" | "shade";
export interface FixturePart { g: PartShape; p: Vec3; s: Vec3; c: string; f: Finish; glow?: GlowRole; tint?: true; axis?: "x" | "z"; tilt?: number; rotY?: number; rotZ?: number; }
export interface FixtureShape {
  symbol: Symbol; w: number; d: number; h: number; color: string;
  worktop?: string; mount?: number; joinery?: Joinery; seat?: number; front?: "flat" | "curved";
  ends?: { endBack: number; endSide: number }; frame?: PictureFrame; patterned?: boolean;
  drop?: number; grid?: GridLayout;
}
export function fixtureParts(o: FixtureShape): FixturePart[];
export function lightFittingParts(o: FixtureShape): FixturePart[];   // was positional (symbol, w, d, h, color, drop, grid)
```
- `PartShape` is a string union in lib; `Fixtures.tsx` keeps `GEOMETRY` keyed by it and a compile-time check `satisfies Record<Exclude<PartShape,"soft">, THREE.BufferGeometry>`.
- Colour constants (`WHITE`, `CHROME`, `STEEL`, `KNOB`, `PLINTH`, `DARK`, `GLASS`, `MARBLE`, `BRASS`, `MIRROR`, `BULB_OFF`) move with it. `WORKTOP = DEFAULT_WORKTOP` comes from where it does today.
- Defaults inside `fixtureParts` match today's parameter defaults exactly (`worktop = WORKTOP`, `mount = 0`, `ends = {0,0}`, `patterned = false`, `drop = 0`, `grid = { pitch: 1.2 }`).
- Splitting by catalogue group (kitchen, bath, seating, lights) is not in this chunk (verifier: can wait).

Proof of no change:
1. First commit: `src/three/fixtureParts.golden.test.ts` that exports `fixtureParts` temporarily (named `__fixturePartsForTest`) and snapshots its output for every symbol in `CATALOGUE` at the item's default size, plus variants: joinery on, `seat` set, `front: "curved"`, a corner `ends`, each `PictureFrame`, `patterned`, `drop > 0`, a lamp grid. Commit the `.snap`.
2. Move to lib with the options object; point the golden test at the lib function with the same inputs. The `.snap` must not change.
3. New `fixtureParts.test.ts` like `gardenParts.test.ts`: for every symbol, every part's `partBounds`-style box lies within the footprint `[-w/2, w/2] x [-d/2, d/2]` plus a 5 cm tolerance and y within `[-mount, h + drop]`; sizes are finite and positive; at least one part per symbol. Generalise `partBounds` from `lib/gardenParts.ts` to accept a `FixturePart` (same fields) or add a twin.
4. `src/three/Fixtures.test.ts` passes unchanged; `scripts/shoot-chassis.cjs` `3d-decorate-room` shots unchanged.

### (e) CSS: chrome tokens and chassis rules

Decision (mine, technical): no cascade layers, no one-file-per-chassis.
- Cascade layers: every unlayered rule (fontsource, any leftover) beats every layered rule, so adopting `@layer` is all-or-nothing across 29+ files plus imports. It fixes specificity we do not actually fight today. Not worth it.
- One file per chassis: splits each component's rules across 3-4 files; the review will grow harder, not easier. No.
- Instead: (1) one token block per chassis, (2) chassis rules stay next to their component but may only set tokens or layout switches, never pixel sums, (3) a guard test enforces it.

Token block, in `src/styles.css` next to `:root` (single home; `mobile.css` keeps phone-only components):

| Token | Default (desktop/tablet) | Phone | Meaning |
|---|---|---|---|
| `--gap` (alias of `--float-gap`) | 12px | 12px | island gap |
| `--dock-h` | measured dock height (set to its current value) | 44px | dock island height |
| `--rail-w` | 46px box today (check computed) | 54px | tool rail outer width |
| `--sheet-now` | 0px | `--sheet-peek` / 0 / 50% per `.app[data-sheet=...]` | covered by the sheet |
| `--chrome-top` | `var(--float-top)` | top row height + gap | free canvas top |
| `--chrome-bottom` | `calc(var(--gap) + var(--dock-h) + var(--gap))` | `calc(var(--sheet-now) + var(--gap) + var(--dock-h) + var(--gap))` | free canvas bottom |
| `--chrome-left` | `calc(var(--gap) + var(--rail-w) + var(--gap))` | same | free canvas left |
| `--side-w` | inspector card width (today 332 desktop, 312 tablet from `SiteEditor.css`) | 0 | right card |

Rewrites (examples; full list from `grep -rn "calc(.*px *+" src --include=*.css`):
- `PlanEditor.css` `.plan-status` phone `bottom` and `SunControls.css` `.sun-panel` and `SiteEditor.css` `.site-status` become `bottom: calc(var(--chrome-bottom) - var(--gap) + 8px)` (keep the exact pixel result; document the 8 px as `--status-gap`).
- `SiteEditor.css:73` `.site-scale` adds `+ 44px` (the status height): becomes `calc(var(--chrome-bottom) + var(--status-h))`.
- `PlanEditor.css:124` `.add-pop` (fixed, viewport-relative) uses `calc(var(--tabbar-h) + var(--chrome-bottom))`; if the quick wins removed the phone tab bar from the fixed stack, drop the term.
- `SiteEditor.css:45,68` `.site-north` uses `var(--side-w)`.
- `Measure.css`, `SunControls.css:2` desktop `76px` / `108px`: replace with `--dock-h`-based tokens, but only if the computed result is identical at 1440x900 and 1920x1080.

TS side:
- `src/editor/core/useCameraInsets.ts`: delete `PHONE_BOTTOM_INSET`, `PHONE_LEFT_INSET`. Render one `<div className="chrome-probe" aria-hidden>` inside `.app` (in `App.tsx`, `position:absolute; top:var(--chrome-top); bottom:var(--chrome-bottom); left:var(--chrome-left); right:var(--side-w); pointer-events:none; visibility:hidden`). `useCameraInsets` reads the probe's rect relative to the canvas element on each `insetBottom()`/`insetLeft()` call (cheap: `getBoundingClientRect`, called on fit only) and a `ResizeObserver` on the probe bumps `fitSuffix` so the camera refits when the sheet detent changes. Do not read `getComputedStyle(...).getPropertyValue("--chrome-bottom")`: an unregistered custom property returns the unresolved `calc(...)` string.
- Desktop: keep returning `{ fitSuffix }` only, unless the quick win "phone plan fits use the real chrome" already generalised it; then fold that code into the probe.
- `src/components/mobile/sheet.ts`: keep `SHEET_PEEK_PX` (BottomSheet's drag maths in `detentHeights` needs a number); delete `TAB_BAR_PX` if CODE11 did not.

Guard test `src/lib/cssGuard.test.ts` (vitest runs in `environment: "node"`, so it can `fs.readFileSync` the CSS):
- no `calc(` containing two or more raw `px` terms in any rule whose selector has `data-chassis` or `data-touch` (allow-list file:line for the few legitimate ones, each with a reason);
- `--sheet-peek` in `styles.css` equals `SHEET_PEEK_PX`;
- no `44px`, `54px`, `56px`, `64px` literals outside the token block (allow-list `ViewCube.css`/compass `translateY(-44px)`).
- Count report: prints the `[data-chassis]`/`[data-touch]` line count; target at least 25% fewer than 203 (from deleting rules made redundant by tokens), not enforced.

Proof of no change, (e) only:
- New `scripts/chrome-rects.cjs`: for each size (390x844, 820x1180, 1180x820, 1440x900, 1920x1080) and view (3d-build, plan-build, plan-furnish, plan-garden, plan-garden-item, plan-plot, with sheet hidden, peek and half on phone) dump `getBoundingClientRect()` of `.dock, .tool-rail, .plan-status, .site-status, .site-scale, .site-north, .sun-panel, .plan-zoom, .site-zoom, .add-pop, .sheet, .inspector-card` and the camera's `useStore`-visible fit (via `window.__houseStore` and the editor's transform attribute) to JSON. Run on `main` before, and on the branch after; compare: phone and desktop rects equal within 0.5 px; tablet within 2 px.
- `scripts/shoot-chassis.cjs` gains a `SIZES` env (default today's three; add `desktop`, `desktop-wide`); new `scripts/diff-shots.cjs` compares two folders in headless Chromium via canvas `getImageData` (no new npm dependency) and prints changed-pixel % per image.

## Build plan (chunks for parallel Sonnet builders in separate worktrees: for each chunk the files it owns, the files it must stay out of, the steps, and how to verify; note the order and dependencies)

Order: A first (small, half a day; gives every other chunk `npm run lint`). Then B, C, D, E in parallel. F last, after A-E are on `main`. Every chunk: worktree per CLAUDE.md (symlink `node_modules` unless `package-lock.json` differs; A changes it, so chunks started after A merges re-symlink from the updated main checkout), commit trailer from the session's attribution reminder, `npm run check` and `npm run build` pass, merger fast-forwards to `main`.

| Chunk | Name | Model | Owns | Stays out of | Depends on |
|---|---|---|---|---|---|
| A | Lorde: tooling stage 1 | Sonnet medium | `eslint.config.js`, `tsconfig.node.json`, `knip.json`, `package.json`, `package-lock.json`, `.github/workflows/check.yml`, JSDoc-only edits in `server/`, `scripts/`, `vite.config.ts` | everything under `src/` | quick wins merged |
| B | Taylor Swift: planning rules | Sonnet medium; Opus medium review of diff | `src/lib/planning.ts`, `src/lib/planning.test.ts`, new `src/lib/planningFixtures.ts`, new `src/lib/planning.golden.test.ts` and its `__snapshots__` | all else | none (A helpful) |
| C | Harry Styles: site editor split | Sonnet medium; Opus medium review of `siteKeys` | `src/editor/SiteEditor.tsx`, new `src/editor/site/{PlotInspectors.tsx,useSiteKeys.ts,SiteChrome.tsx}`, new `src/lib/siteKeys.ts` (+test), `src/lib/editorCore.ts` (+test, `niceScale` only), `src/editor/core/components.tsx`, `src/editor/core/index.ts`, `src/lib/planKeys.ts` (export `PlanKeyEvent` only), site section of `scripts/editor-regression.mjs` | all `.css`; `useCameraInsets.ts`; `PlanEditor.tsx`; `src/components/SitePanel.tsx` | none |
| D | Kylie: fixture catalogue | Sonnet medium | `src/three/Fixtures.tsx`, `src/three/Fixtures.test.ts`, new `src/lib/fixtureParts.ts` (+test, golden test, snapshots), `src/lib/gardenParts.ts` (generalise `partBounds` only) | everything else | none |
| E | Dua Lipa: chrome tokens | Sonnet medium; Opus medium review | all `src/**/*.css`, `src/editor/core/useCameraInsets.ts`, `src/components/mobile/sheet.ts`, `src/components/mobile/BottomSheet.tsx` (read only unless needed), `src/App.tsx` (probe div only), new `src/lib/cssGuard.test.ts`, new `scripts/chrome-rects.cjs`, `scripts/diff-shots.cjs`, `scripts/shoot-chassis.cjs` (`SIZES` env) | `SiteEditor.tsx`, `PlanEditor.tsx`, all `src/lib` except the guard test, `src/three/*.tsx` | quick wins merged (phone shell) |
| F | Adele: lint to zero | Sonnet medium; Opus medium review of every deps change | the 42 disable sites (`House.tsx`, `WalkControls.tsx`, `Viewer.tsx`, `Site.tsx`, `Fixtures.tsx`, `DoorLeaves.tsx`, `plan/useGeometry.ts`, `WalkExposure.tsx`, `useSunlight.ts`, `frameLoop.tsx`, ...), knip findings, `eslint.config.js` (stage 2-3), `knip.json`, `package.json` scripts | nothing big in flight | A-E merged |

Shared-file notes
- `SiteEditor.css`: E only. C keeps class names (`site-scale`, `site-status`, `site-north`) so no CSS edit is needed.
- `scripts/editor-regression.mjs`: C edits only its `site` section.
- `package.json`: A only, then F. Others must not add scripts; E's new scripts run as `node scripts/...`.

Steps per chunk

A (Lorde)
1. Install exact versions: `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `globals`, `knip`, `@types/node@22`.
2. Write the three configs as above. Run `npx eslint .`: fix only errors that are not hook warnings and are trivial (no logic change); record the warning count N.
3. `npx tsc -p tsconfig.node.json`: fix with JSDoc; exclude `scripts/*.cjs` if over budget (note it).
4. `npx knip --no-exit-code > /dev/null` must run; paste the summary counts into the report (not a file).
5. Update scripts and the workflow; push a branch and confirm the workflow passes on GitHub (`gh run list`).
Verify: `npm run check`, `npm run build`, CI green, `server/*.test.mjs` still run in vitest.

B (Taylor Swift)
1. Golden test and snapshot; commit alone.
2. Extract `buildCtx`, `verdictOf`; commit; tests green.
3. Extract rule sets one at a time in `RULE_SETS` order, a commit each; tests and snapshot green after each.
Verify: `npx vitest run src/lib/planning`, `git diff --exit-code -- src/lib/__snapshots__/`, `planningCheck` body under 120 lines (`awk` range count in the report), Review screenshot at 1440x900 unchanged.

C (Harry Styles)
1. `niceScale` + test; `ScaleBar` in core; SiteEditor uses it.
2. Move plot inspectors to `PlotInspectors.tsx` (pure move; imports only).
3. `siteKeys.ts` + tests written against today's handler (read it branch by branch); then `useSiteKeys.ts`; delete the inline handler.
4. If `SitePlan` still over 350 lines, move rail and chrome to `SiteChrome.tsx`.
Verify: vitest; `npx vite --port 5231` then `npm run regress:editors -- --port 5231 --only site`; `PORT=5231 node scripts/test-garden.cjs`; `PORT=5231 node scripts/test-touch-plan.cjs`; screenshots as in Acceptance.

D (Kylie)
1. Golden test of current `fixtureParts` over the whole catalogue and variants; commit alone.
2. Move to lib with `FixtureShape`; update the single caller in `buildFixtureMeshes` and `lightFittingParts`' callers; snapshot unchanged.
3. Bounds tests per symbol; fix nothing in geometry: if a symbol breaks bounds, allow-list it in the test with a comment and list it in the report.
Verify: vitest; `wc -l src/three/Fixtures.tsx` about 470; `3d-decorate-room` and `3d-build-room` shots unchanged at 390x844 and 1440x900.

E (Dua Lipa)
1. Write `chrome-rects.cjs`, `diff-shots.cjs`, `SIZES` in `shoot-chassis.cjs`; capture the baseline from `main` into the scratchpad (not the repo).
2. Add the token block; rewrite one file at a time; rerun rects after each file.
3. Add the probe and rewrite `useCameraInsets`; delete the magic constants.
4. Add `cssGuard.test.ts`; delete chassis rules made redundant.
Verify: rects within tolerance; shot diffs; `scripts/test-touch-plan.cjs`, `scripts/test-garden.cjs`, `npm run regress:editors`; phone plan fit: the house outline's bounding box sits inside the probe rect with sheet hidden, peek and half.

F (Adele)
1. For each disable: delete it, read the warning, then (i) add the dep, (ii) use a ref / functional update, or (iii) keep the disable with a `--` reason. One commit per file.
2. Turn on `reportUnusedDisableDirectives` and ratchet `--max-warnings` to 0; set `exhaustive-deps` to error.
3. Clear knip: delete dead code (per Q3 for test-only exports); switch knip to gating.
Verify per file changed: `House.tsx` and `Viewer.tsx`: `scripts/shoot-chassis.cjs` 3D shots and `scripts/perf-render.cjs` frame times within 5%; `WalkControls.tsx`, `WalkExposure.tsx`: `scripts/test-walk-a.cjs` .. `test-walk-e.cjs` and `shoot-walk.cjs`; `Site.tsx`, `useSunlight.ts`: `scripts/test-garden.cjs`; `plan/useGeometry.ts`: `npm run regress:editors`; `DoorLeaves.tsx`: `3d-build-room` shot; electrics-affecting files: `scripts/test-electrics.cjs`.

## Acceptance checks (runnable: npm run check and build, which Playwright scripts or new checks, which screenshots at which sizes, and measurable targets)

Always
- `npm run check` and `npm run build` pass; GitHub `check` workflow green on the merge commit.
- `npm run check` wall time under 60 s on the container (34 s today).

| Part | Check | Target |
|---|---|---|
| a | `npx eslint . --max-warnings=0` (after F) | 0 errors, 0 warnings |
| a | `grep -rn "eslint-disable" src \| grep -v -- " -- "` | 0 lines (every disable carries a reason) |
| a | `grep -c "eslint-disable" -r src` | under 15 (from 42) |
| a | `npx tsc -p tsconfig.node.json` | 0 errors over `server/`, `scripts/house/`, `vite.config.ts` |
| a | `npx knip` | exit 0 |
| b | `planning.golden.test.ts`, `planning.test.ts` | pass; snapshot unchanged; 26 existing tests unchanged |
| b | length of `planningCheck` | under 120 lines; no rule set over 150 |
| c | `siteKeys.test.ts` | about 25 cases, every branch |
| c | `npm run regress:editors -- --port <n>` (plan and site) | green |
| c | `scripts/test-garden.cjs`, `scripts/test-touch-plan.cjs` | green |
| c | `wc -l src/editor/SiteEditor.tsx` | at most 400 |
| d | golden snapshot | unchanged |
| d | bounds test | every catalogue symbol covered |
| d | `wc -l src/three/Fixtures.tsx` | at most 500 |
| e | `scripts/chrome-rects.cjs` before vs after | phone and desktop within 0.5 px; tablet within 2 px |
| e | `cssGuard.test.ts` | pass |
| e | `grep -rnE "calc\([^)]*[0-9]+px[^)]*\+[^)]*[0-9]+px" src --include=*.css` | only allow-listed lines |
| e | magic constants | `PHONE_BOTTOM_INSET`, `PHONE_LEFT_INSET` gone |
| all UI | `SIZES=phone,desktop,desktop-wide PORT=<n> OUT=<dir> node scripts/shoot-chassis.cjs` then `node scripts/diff-shots.cjs <before> <after>` | views welcome, 3d-build, 3d-build-room, 3d-decorate-room, plan-build, plan-furnish, plan-electrics, plan-garden, plan-garden-item, 3d-garden, plan-plot, review, housemenu: under 0.1% changed pixels on 2D views; 3D views under 0.5% (SwiftShader noise) |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A hook-deps "fix" re-runs an effect every frame (House.tsx has 13) and tanks frame rate or loops | Opus review of every deps change; `scripts/perf-render.cjs` before/after; prefer refs over new deps in r3f frame code; keep a disable with a reason when the effect is intentionally once-only |
| Lint stage 1 floods with warnings and nobody ratchets | `--max-warnings=N` set to today's count from day one, so the number can only fall |
| checkJs over untyped `.mjs` produces noise | `strict: false`, JSDoc fixes only, `.cjs` Playwright scripts excluded if over budget |
| knip false positives from `virtual:houses` and dynamic imports | houses' `index.ts` as entries; knip report-only until F |
| eslint 10 peer mismatch with typescript-eslint or the hooks plugin | fall back to eslint 9 in A; note versions in the report |
| planning refactor reorders rules (user-visible order in Planning panel and report) | snapshot of the full ordered output; `RULE_SETS` order equals today's push order |
| siteKeys changes precedence (Backspace with polygon vs delete; Ctrl keys on Plot) | tests written from the old handler before deleting it; regress script |
| fixture move changes a default (e.g. `ends`, `grid.pitch`) | golden snapshot over every symbol and the variants |
| CSS token rewrite moves a float by a pixel on phone | rect diff at 0.5 px and screenshot diff per view; the probe is checked against the plan fit |
| Probe adds layout work | absolute, no content, `visibility:hidden`; read only on fit and on ResizeObserver |
| Quick wins land differently from this spec's assumptions | each chunk starts by re-reading its files at `main`, adjusting names, and listing differences in its report |
| Parallel chunks collide | file ownership table; C and E split by `.tsx` vs `.css` |

## Open questions for the owner (each with options and a recommendation; only real decisions, not things the code can answer)

1. CI scope: should the GitHub check also run the Playwright scripts (slower, about 5-10 min, needs SwiftShader)?
   - (a) No, keep CI to check + build; builders run Playwright locally (today's practice).
   - (b) Yes, a nightly job only.
   - (c) Yes, on every push.
   - Recommendation: (a) now, (b) later if regressions slip through.
2. Should a red CI block pushes to `main` (branch protection)?
   - (a) No: CI is a signal; the standing permission to push to `main` stays as is.
   - (b) Yes: require the check to pass, which means builders push a branch, wait, then merge.
   - Recommendation: (a). Branch protection would slow every agent merge and the same checks run locally first.
3. Code used only by tests (knip `--production` finds about 10, e.g. `sunlightFor`, `fitDistance`, `lookSweep`):
   - (a) Delete the function and its test.
   - (b) Keep it, tagged `/** @public test helper */` so knip ignores it.
   - Recommendation: (a), unless the function is a planned feature you want kept; F lists each one in its report before deleting.
4. iPad drift from the CSS token rewrite:
   - (a) Accept up to 2 px movement on iPad (phone and desktop stay pixel-identical).
   - (b) Require pixel-identical on iPad too (more tablet-only rules kept).
   - Recommendation: (a), per decision 2.
5. Should the plan editor gain the shared scale bar too (a small visible change on Build, Furnish, Electrics)?
   - (a) No, the site editor only; this spec stays behaviour-neutral.
   - (b) Yes, on desktop only.
   - Recommendation: (a) here; (b) as a later one-line change once `ScaleBar` is in core.

## Out of scope

- React Compiler lint rules (`eslint-plugin-react-hooks` v7 `recommended-latest` extras); type-aware typescript-eslint rules.
- Stylelint, Prettier, formatting.
- Splitting `fixtureParts` by catalogue group; making `lib/planning.ts` a folder.
- Moving plot selection into the store (CODE6 adjusted note).
- Cascade layers; one CSS file per chassis.
- Any change to phone or desktop layout, features or the store; saved-data migrations.
- Playwright in CI (unless Q1 says otherwise).

## Effort (S/M/L per chunk and in total)

| Chunk | Effort | Notes |
|---|---|---|
| A Lorde: tooling stage 1 | M | mostly config; checkJs fixes may surprise |
| B Taylor Swift: planning rules | M | mechanical with golden guard |
| C Harry Styles: site editor split | M | siteKeys tests are the work |
| D Kylie: fixture catalogue | M | 1,300 lines moved; golden guard |
| E Dua Lipa: chrome tokens | M-L | 29 CSS files, new rect and diff scripts |
| F Adele: lint to zero | M | 42 disables, each reviewed; perf checks |
| Total | L | about 6 builder-days; A first, B-E in parallel, F last |
