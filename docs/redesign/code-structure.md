# Code structure: lint, rule tables, editor and fixture splits, chrome tokens

Status: proposal, not started. Written 31 Oct 2026. Source findings: CODE2, CODE7, CODE8, CODE13, CODE1 (phone review: "Phone chrome offsets duplicated as magic numbers") and the verifier's CSS sprawl note on that finding (203 chassis/touch lines in 29 files). Related quick wins it builds on: CODE1 (NumberField), CODE3 (canEdit), CODE5 (Glass removed), CODE6, CODE11, CODE12, CODE14.

Author: Bruno Mars; checked by Debbie Harry against HEAD `2816051` (the review commit `8df6020` plus the merged Dua Lipa and Robbie Williams quick wins). House: listing 91770873 (no address, postcode or names in this file).

## Why (the problem, with numbers and evidence)

Numbers are from the review at `8df6020` unless marked "HEAD", which means `2816051`.

| Problem | Evidence at HEAD | Cost today |
|---|---|---|
| Nothing lints | no `eslint.config.*`, no eslint in `package.json`; 42 `eslint-disable-next-line react-hooks/exhaustive-deps` comments in `src` (13 in `src/three/House.tsx`, 5 in `walk/WalkControls.tsx`, 3 each in `Viewer.tsx` and `Site.tsx`) plus 1 `eslint-disable-line @typescript-eslint/no-explicit-any` (`lib/sync.ts:86`): 43 in all, same at HEAD | The disables check nothing. CODE10 (stale `placing.rot` in `useTools.ts`) is exactly the bug lint would have caught. |
| JS outside `src` is never typechecked | `tsconfig.json` `include: ["src"]`; `server/*.mjs` (`auth`, `houses`, `page`, `project`, `server`, plus `auth.test.mjs`, `project.test.mjs`), `scripts/**/*.{mjs,cjs}` and `vite.config.ts` are unchecked: about 6,080 lines. No `@types/node` in `node_modules/@types`. 14 scripts load Playwright from the container path `/opt/node22/lib/node_modules/playwright`, which does not exist on GitHub runners. | A typo in `server/auth.mjs` ships to Render. |
| No unused-code check | CODE11 found 1 dead file and about 21 dead or test-only exports by hand. | It grows back. |
| `planningCheck` is one function | `src/lib/planning.ts:363-856`, 494 of 1,295 lines; Class A alone runs 559-782 inside an extension loop. `porchRules`, `hardSurfaceRule`, `boundaryRules`, `fortyFive`, `partyWall` are already split out. | Any rule change means reading 494 lines and 30-odd shared locals (`g`, `cur`, `pro`, `orig`, `added`, `fresh`, `ext0`, `footExt`, ...). |
| `SiteEditor.tsx` is 927 lines (HEAD 952) | HEAD: `SitePlan` from 71; inline `useEditorKeys` handler 274-347 (view-only branch first via `canEditNow`: Esc, F, + -; then garden Ctrl/Cmd D/C/V; arrows; Esc; polygon Enter/Backspace; V R C P A B Q E F + -; Delete/Backspace); plot `Inspector` from 533 plus `OpeningWidth`, `EmptyInspector`, `Clearances`, `ScreenBlocks`, `FOLLOW_LABEL`, `FollowGround` to 952; its own scale bar (`NICE` at 41, `scaleLen` at 380, markup at 449). | The plan side has the pure, tested `lib/planKeys.ts` (46 lines + test); the site side has none. |
| Fixture catalogue lives in a 3D file | `fixtureParts` in `src/three/Fixtures.tsx:370-1678` plus `lightFittingParts` 1679-1772 (called only from inside `fixtureParts`, line 896); no `THREE.` use in that range; 15 positional args; one caller at line 181: `fixtureParts(item.symbol, b.w, b.d, b.h, colour, f.worktop ?? WORKTOP, b.z0, j, f.seat, f.front, cornerEnds(...), f.frame, !!pat, drop, lamp ? lampGrid(f, item) : undefined)`. File is 1,772 lines. Part type is a local `interface Part` (line 330) with `g: keyof typeof GEOMETRY \| "soft"`; `type Finish` at 273. | No per-symbol tests; the garden equivalent (`lib/gardenParts.ts` `partBounds`, `lib/plantForms.ts`) has them. |
| Phone offsets are magic sums | HEAD: `useCameraInsets.ts` `DOCK_CLEAR = 12 + 44 + 12`, `PHONE_LEFT_INSET = 12 + 54 + 12` (fallback only: `phoneLeftInset()` now measures `.tool-rail`); CSS `calc(var(--sheet-peek) + 12px + 44px + 8px)` 3 times (`PlanEditor.css:121`, `SunControls.css:41`, `SiteEditor.css:71`), `+ 52px + 8px` for the same sun panel in `mobile.css:64` (wins on specificity, so `SunControls.css:41` is dead), `+ 44px` again at `SiteEditor.css:73`, `--tabbar-h + --sheet-peek + 12px + 44px + 12px` at `PlanEditor.css:124`, `bottom: 76px` in `SunControls.css:2`, `+ 332px` / `+ 312px` in `SiteEditor.css:45,68` (inspector card 320 / 300 plus the gap). The phone dock is `height: 52px` (`Dock.css:25`): the CSS `44px + 8px` happens to equal it (status floats sit flush on the dock), but `DOCK_CLEAR` counts 44, so the phone plan fit leaves 8 px less clearance than its comment says. The `Measure.css` sums the review cited are gone at HEAD. | Every shell change has to find and re-add each sum; they have already drifted (44 vs 52). |
| CSS chassis sprawl | 203 `[data-chassis]`/`[data-touch]` lines over 29 files at review (HEAD: 207 over 29): phone 106, touch 70, desktop 18, tablet 17. Top: `styles.css` 31, `ReviewPage.css` 24, `walk.css` 21, `PlanEditor.css` 19. No `@layer` anywhere. Partial token use exists: `styles.css:15` defines `--topbar-h`, `--island-h`, `--tabbar-h`, `--sheet-peek`, `--float-gap`, `--float-top`, `--inset-l/r`, `--card-clear`, and `mobile.css:67` sets `--sheet-peek: 0px` under `.app[data-sheet="hidden"]`. | Hard to see what the phone looks like from code; specificity creep (`.app[data-chassis="phone"] main .x` beats `.app[data-chassis="phone"] .x`). |

## Goal and non-goals

Goals
- Every hook dependency, every JS file and every unused export is checked by `npm run check` and CI.
- Each refactor is behaviour-identical and proven so by a golden test or a measured screenshot/rect diff.
- Big files shrink: `planningCheck` under 120 lines; `SiteEditor.tsx` about 350; `Fixtures.tsx` about 470.
- Phone chrome geometry has one source: CSS tokens; TS measures the real dock and rail instead of re-adding numbers.

Non-goals
- No new features, no visual change on phone or desktop (iPad may move by up to 2 px, per decision 2). One named exception: the phone plan fit's bottom inset grows by 8 px because `DOCK_CLEAR` counts a 44 px dock that is really 52 px (bug fix; Chunk E reports the delta).
- No desktop feature lost: every desktop shortcut, inspector field and scale bar stays.
- No change to `store.ts`, persistence or saved data shape.
- No Stylelint, Prettier or formatter churn.

## Decisions already made (by the owner; do not reopen)

1. Phone: showing, walking, measuring, light Decorate and Furnish. Build, Electrics, Garden, Plot are view-only on phones.
2. Devices that matter: iPhone 390x844, desktop 1440x900 and 1920x1080. iPad keeps working, not optimised.
3. Look: full-bleed canvas, floating chrome everywhere, brand per docs/brand.md, no Glass.
4. Quick wins are being built now; this is a spec for later.
5. Standing rules from CLAUDE.md: finished work goes to `main` after `npm run check` and `npm run build`; pure logic in `src/lib` with tests; CSS tokens only.
6. Small screens may lose features (owner goal), but this spec removes none.
7. Following from 2: iPad may move by up to 2 px in the CSS rewrite; phone and desktop stay pixel-identical (the spec's reading of decision 2, so it is not asked again).

## Assumptions (including which quick wins have landed)

All quick wins of 31 Oct 2026 have landed on `main` before any chunk here starts. Already on HEAD `2816051` (checked):
- Glass removed (CODE5): floating islands on every chassis; `--float-top` sits under the islands; one As listed | Proposed | Compare switch (Dua Lipa merge).
- Phone shell: Measure moved into the dock (`Measure.css` has no phone offsets left); 44 px targets inside a 52 px phone dock (`Dock.css:25`); sheet has a `hidden` detent, `BottomSheet.tsx` sets `data-sheet` on `.app`, and `mobile.css:67` zeroes `--sheet-peek` when hidden.
- `lib/chassis.ts` has `isCompact` and `canEdit(mode, compact)`; `components/useChassis.ts` wraps them as `canEditNow(mode)` and `useCanEdit()`; the SiteEditor key handler's first branch is `if (!canEditNow(...))` (Robbie Williams merge).
- Phone plan fit uses the real chrome: `phoneLeftInset()` measures `.tool-rail`, `phoneBottomInset()` drops the sheet term when hidden; `fitSuffix` adds `-view` in view-only modes.

Still to land (on `qw/*` branches at writing; assumed merged):
- Raw number inputs are `NumberField` (CODE1); the local `num` helpers and `type="number"` inputs in `SiteEditor.tsx` (lines 599, 691, 706, 872, 876 at HEAD) are gone.
- `Inspectors.tsx` is split by subject (CODE14) into `src/editor/inspectors/`.
- Dead code removed (CODE11; `TAB_BAR_PX` leaves `sheet.ts`); hex colours on tokens (CODE12).
- `.github/workflows/check.yml` (on `qw/harry-styles`): one `check` job, Node 22, `cache: npm`, `npm ci || npx -y npm@11.6.2 ci`, `npm run check`, `npm run build`, on push and PR.
- Clearances inside the edge inspector removed (CODE6); `SiteFigures` stays.
- Render quality `auto`, three.js chunk, home camera, Capture popover: no effect on this spec except that `scripts/perf-render.cjs` baselines must be taken after they land.
- Line numbers here are HEAD `2816051` unless marked otherwise; the remaining quick wins will move them. Builders find code by function name, not line.
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
| Phone portrait (390x844) and landscape (844x390, still the phone chassis) | magic-sum offsets | same pixels; offsets from tokens; the plan fit reads the dock's real top (8 px more clearance, see Non-goals) |
| Phone states | sheet hidden / peek / half / full; Walk (`walk.css:89` moves the dock); Compare wipe segment; gesture fade | each state's rects identical; Walk and Compare are in the rect script |
| Desktop (1440x900, 1920x1080) | unchanged | unchanged, proven by rect and screenshot diffs; every key shortcut still works (siteKeys tests + `regress:editors`) |
| iPad | unchanged | may differ by up to 2 px where a tablet rule used a different sum (decision 7); must still load and edit |
| Keyboard, touch, reduced motion, undo | unchanged | same key precedence (siteKeys tests); touch paths (`test-touch-plan.cjs`); the `prefers-reduced-motion` blocks in `Dock.css:37`, `mobile.css:41`, `walk.css:53` kept; every store edit still undoable (no store change) |
| CI on GitHub | check + build | check (now including tsc node, lint, knip) + build; annotations on the PR |

States (the tooling, since there is no UI):
- Empty: a clean tree passes all checks in under 60 s locally (target; the review measured `npm run check` at 34 s).
- Busy: CI shows one job, "check"; caches `~/.npm`.
- Error: lint errors fail CI; lint warnings are printed but pass until Stage 3; knip failures name the file and export.

Chrome tokens on the phone (what Chunk E builds), sketched:

```
before                                   after
.plan-status { bottom: calc(             .app[data-chassis=phone] {
  var(--sheet-peek)+12px+44px+8px) }       --dock-h: 52px;
                                           --sheet-cover: var(--sheet-peek);   (0px when data-sheet=hidden)
DOCK_CLEAR = 12 + 44 + 12                  --dock-top: calc(var(--sheet-cover) + var(--float-gap) + var(--dock-h)); }
                                         .plan-status { bottom: var(--dock-top); }       (same px as today)
                                         phoneBottomInset(): measures .dock's top, like phoneLeftInset() does the rail
```

## Technical design (files and functions, type and store changes, persisted-state migration, tests to add, performance and accessibility notes)

No store or type changes to persisted data; no migration needed in any part (checked: no chunk touches `store.ts`, `lib/persist.ts` or `lib/migrate.ts`; `SiteTool` is a type move only).

Accessibility: unchanged by design. `ScaleBar` keeps its visible text label ("5 m"); every keyboard shortcut keeps its key and precedence; the `prefers-reduced-motion` rules stay; the F chunk must not turn a `useEffect` that manages focus (dialogs, palette) into one that re-runs on every render.

### (a) Lint, typecheck for JS, knip, CI

Files: `eslint.config.js` (new), `tsconfig.node.json` (new), `knip.json` (new), `package.json` (scripts, devDependencies), `.github/workflows/check.yml` (grows).

`eslint.config.js` (flat config):
- `typescript-eslint` `configs.recommended` (not type-checked: keeps it fast) on `src/**/*.{ts,tsx}`.
- `eslint-plugin-react-hooks`: only `rules-of-hooks: error` and `exhaustive-deps: warn` in Stage 1. Do not enable the v7 React Compiler rules (`set-state-in-effect`, `refs`, `purity`, ...) in this work; list them in Out of scope.
- `reportUnusedDisableDirectives: "error"` from Stage 2, so stale `eslint-disable` comments fail.
- `server/**`, `scripts/**/*.mjs`, `vite.config.ts`: `js.configs.recommended` with Node globals, `sourceType: "module"`; `scripts/**/*.cjs`: same with `sourceType: "commonjs"`; Playwright scripts' `page.evaluate` callbacks also need browser globals (`window`, `document`).
- Ignore `dist/`, `node_modules/`, `reference/`, `public/`, `.claude/`.
- Relax: `@typescript-eslint/no-explicit-any` warn (the one `any` in `lib/sync.ts:86` keeps its line disable, which F gives a `--` reason), `no-unused-vars` off for TS (tsc's `noUnusedLocals` owns it).

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
  "include": ["server/**/*.mjs", "scripts/house/**/*.mjs", "scripts/*.mjs", "vite.config.ts"] }
```
- Start with `strict: false` (`server/` has 1 `@param` in total); turn on `strictNullChecks` for `server/` only once it is clean (later, optional).
- `vite.config.ts` builds the `virtual:houses` registry and has `/// <reference types="vitest/config" />`; it imports no app code, so no `src` files are needed.
- The root `scripts/*.cjs` Playwright checks are out of Stage 1 (they `require` Playwright from `/opt/node22/...`, which CI does not have); a follow-up may switch them to the `playwright-core` devDependency and include them. `scripts/editor-regression.mjs` and `make-icons.mjs` load it the same way through `createRequire`: if they error, type the required module as `any` with JSDoc, not `// @ts-ignore`.
- Errors that are only JS inference noise get a JSDoc type. Budget: if Stage 1 shows over 60 errors in `scripts/`, drop `scripts/*.mjs` from `include` and file it as a follow-up; `server/` and `scripts/house/` must be in.
- Add `@types/node@22` to devDependencies.

`knip.json`:
- entry: `src/main.tsx`, `server/server.mjs`, `scripts/**/*.{mjs,cjs}`, `vite.config.ts`, `src/houses/*/index.ts` (the `virtual:houses` plugin in `vite.config.ts` writes `import()` calls at build time, so knip cannot see them), `src/test-setup.ts` (vitest `setupFiles`), `**/*.test.ts`, `server/**/*.test.mjs`.
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

`.github/workflows/check.yml` (as landed: one `check` job, Node 22, `cache: npm`, `npm ci || npx -y npm@11.6.2 ci`, `npm run check`, `npm run build`) grows to:
- the same job and install step;
- `npm run check` split into named steps so failures read clearly: Typecheck app (`tsc --noEmit`), Typecheck node (`tsc -p tsconfig.node.json`), Lint (`npm run lint`), Knip (`npm run knip`), Tests (`npx vitest run`), then Build;
- no Playwright in CI (needs SwiftShader and a dev server; slow); see Open question Q1.

Performance: `eslint .` without type info on about 470 files (`src`, `server`, `scripts`) is about 5-15 s; knip about 5 s; tsc node about 3 s. Target `npm run check` under 60 s (measure today's time in A step 1 and record it).

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
type RuleSet = (ctx: PlanCtx) => PlanningRule[];

const RULE_SETS: RuleSet[] = [
  extensionRules,     // Class A: "A-none" when no extension, else per extension: front, side, rear, eaves, height, pitch, side windows
  coverageRule,       // "A-coverage"
  materialsRule,      // "A-materials"
  porchSet,           // wraps porchRules (Class D)
  hardSurfaceSet,     // wraps hardSurfaceRule (Class F)
  boundarySet,        // wraps boundaryRules(...).rules (Part 2 Class A)
  fortyFiveSet,       // wraps fortyFive
];

export function planningCheck(current, proposed, sites = {}, opts = {}): PlanningCheck {
  const ctx = buildCtx(current, proposed, sites, opts);      // lines 363-~545 today
  const rules = RULE_SETS.flatMap((r) => r(ctx));
  return verdictOf(ctx, rules, consentsOf(ctx));             // 815-848 today
}
```
- `consentsOf(ctx)` keeps today's consent order exactly: building-regs (from `diffModels`), then `partyWall`, then the kerb consent from `boundaryRules(...).kerb`. Rule sets return rules only, so moving `boundarySet` cannot reorder consents (a draft that let each set return its own consents would have put the kerb before the party wall). `boundaryRules` is called twice (once per use) or memoised on `ctx`; it is pure and cheap, either is fine.
- `buildCtx` contains the grid, masks, the "original house" (1948 wing) logic and part detection (components, porch classification). If it exceeds about 150 lines, split `originalHouse(ctx0)` and `findParts(ctx0)`.
- Order of `RULE_SETS` must equal today's push order, because the output array order is user-visible in `PlanningPanel` (the only caller) and in the Review summary (`lib/reviewSummary.ts` reads the result).
- Public API also includes the `ExtensionPart` type (imported by `PlanningPanel.tsx`).
- `push` closures and `let` accumulators inside today's Class A loop become locals of `extensionRules`. Shared message helpers (`m`, `m2`, `deg`, `fromBoundary`) stay module-level.
- Public API unchanged: `planningCheck`, `PlanningCheck`, `PlanningRule`, `Consent`, `CAVEATS`, `STATUS_LABEL`.

Proof of no change:
1. First commit (before any refactor): `planning.golden.test.ts` that runs `planningCheck` over every input model used in `planning.test.ts` (move its model builders into a shared `src/lib/planningFixtures.ts` test helper that both test files import; knip must treat it as a test file) plus the built-in house's As listed vs Proposed (from `src/houses/default.ts`, which serves tests), with and without `wingAfter1948`, with and without sites, and serialises the full result (rules and consents, in order) with `toMatchSnapshot()`. Commit the `.snap`.
2. Refactor. The snapshot and all 26 existing tests must pass unchanged; the `.snap` file must have no diff (`git diff --exit-code src/lib/__snapshots__`). Run vitest without `-u` throughout.
3. Timing: no bench needed; the context is built once, as today. `PlanningPanel.tsx:35` (the only caller) memoises the call, so nothing else changes.

### (c) Split `SiteEditor.tsx`

Mirror of docs/editor-core-plan.md (PlanEditor is now 437 lines at HEAD, with `plan/use*.ts`, `plan/chrome/*`, `lib/planKeys.ts`).

New and changed files:

| File | Content |
|---|---|
| `src/lib/siteKeys.ts` (+ `siteKeys.test.ts`) | pure `siteKeyAction(e: PlanKeyEvent, ctx: SiteKeyContext): { action: SiteKeyAction; prevent: boolean }` |
| `src/editor/site/useSiteKeys.ts` | the `useEditorKeys` call that maps actions to store calls (HEAD 274-347) |
| `src/editor/site/types.ts` | `Tool` moves to `lib/siteKeys.ts` as `SiteTool` and is re-exported here as `Tool` (lib must not import from `editor/`) |
| `src/editor/site/PlotInspectors.tsx` | `PlotInspector` (today `Inspector`), `OpeningWidth`, `EmptyInspector`, `ScreenBlocks`, `FollowGround`, `FOLLOW_LABEL`, `EDGE_LABEL`, `EDGE_DEFAULT_HEIGHT`, and `Clearances` if CODE6 left any use of it |
| `src/editor/site/SiteChrome.tsx` (optional) | the rail items (`toolItem`), zoom, north arrow, status, if `SitePlan` is still over 350 lines |
| `src/editor/core/components.tsx` | `ScaleBar({ px, className })`; exported through `core/index.ts` |
| `src/lib/editorCore.ts` (+ test) | pure `niceScale(px: number, minPx = 70): number` using today's `NICE` list; tests: 0.5..100 picks, fallback 100 |
| `src/editor/SiteEditor.tsx` | `SiteEditor`, `NoSite`, `SitePlan` composition only |

Types:
```ts
export interface SiteKeyContext {
  canEdit: boolean;                                                             // canEditNow(mode)
  garden: boolean; tool: SiteTool; itemsSelected: number; plotSelected: boolean;  // psel
  selected: boolean;                                                            // sel (any)
  polyPoints: number; clipboard: number;
}
export type SiteKeyAction =
  | { clip: "duplicate" | "copy" | "paste" } | { nudge: { x: number; y: number }; target: "items" | "plot" }
  | { escape: "view" | "full" } | { finishPoly: true } | { undoPoint: true } | { tool: SiteTool } | { toggleAdd: true }
  | { rotate: 15 | -15 } | { fit: true } | { zoom: 1 | -1 } | { delete: true } | { swallow: true } | null;
/** With the action, whether the hook calls preventDefault (see the table below). */
export function siteKeyAction(e: PlanKeyEvent, ctx: SiteKeyContext): { action: SiteKeyAction; prevent: boolean };
```
- Re-use `PlanKeyEvent` (already exported from `lib/planKeys.ts`) and `arrowDelta` from `lib/nudge.ts`.
- Keep today's precedence exactly (HEAD 274-347):

| # | Branch | Today's behaviour | preventDefault today |
|---|---|---|---|
| 1 | `!canEdit` | Ctrl/Cmd/Alt: nothing; Esc clears the selection only (`escape: "view"`, no disarm, no tool change); F fit; + = - _ zoom; everything else, arrows included, does nothing | no |
| 2 | garden and Ctrl/Cmd (no Alt) | D duplicate / C copy only with items picked; V paste only with a clipboard; any other Ctrl key, Ctrl+Z included, returns with no action (`swallow`; undo is handled globally) | only when it acts |
| 3 | arrows (no modifiers) | items picked and Select tool: move items; else plot selection and Select tool: `nudge()`; always returns | items: yes; plot: only if `nudge()` returns true, so the hook decides after the store call |
| 4 | Esc | clear selection, disarm, Select tool (`escape: "full"`) | no |
| 5 | garden, Polygon tool | Enter finishes; Backspace with points removes the last point and returns (never deletes the selection) | yes |
| 6 | letters (no modifiers) | V; garden R C P A; plot B; garden Q/E rotate with items picked; F; + = - _ | only A (so the search box does not take the letter) |
| 7 | Delete/Backspace with a selection | reached after 6 (no early return): deletes items, else the vertex, else the plot item. Quirk: on Plot, Ctrl+Backspace / Cmd+Delete also delete (no modifier check). Keep and test it | yes |

- `canEdit` false (phone, view-only modes): row 1 only; tested, including that arrows and Delete do nothing.
- The hook reads `nudge()`'s return for row 3 before calling `preventDefault`.
- `.site-scale` class name kept so no CSS moves in this chunk.

Proof of no change:
- `siteKeys.test.ts`: one test per branch and per row's sub-case (about 30 cases), including the quirks above and Ctrl+Z returning no site action.
- `npm run regress:editors -- --port <n> --only site` green before and after, and `scripts/test-garden.cjs`, `scripts/test-touch-plan.cjs` green.
- Screenshots `plan-plot`, `plan-garden`, `plan-garden-item` at 390x844, 1440x900, 1920x1080 diff below 0.1% of pixels (see Acceptance).

### (d) `fixtureParts` into `src/lib/fixtureParts.ts`

New `src/lib/fixtureParts.ts` (+ `fixtureParts.test.ts`); `src/three/Fixtures.tsx` keeps meshes, materials, `GEOMETRY`, `softGeometry`, `setLampGlow`, `buildFixtureMeshes`.

Types (`Finish` and `interface Part` move from Fixtures.tsx, lines 273 and 330; `PartShape` is new, replacing `keyof typeof GEOMETRY | "soft"`):
```ts
export type PartShape = "box" | "cyl" | "quarter" | "shell" | "wedge" | "blob" | "ball" | "soft";
export type Finish = "matt" | "satin" | "gloss" | "metal" | "glass" | "mirror" | "glow" | "lamp" | "shade";
type Vec3 = [number, number, number];
export interface FixturePart { g: PartShape; p: Vec3; s: Vec3; c: string; f: Finish; glow?: GlowRole; tint?: true; axis?: "x" | "z"; tilt?: number; rotY?: number; rotZ?: number; }  // keep the doc comments
export interface FixtureShape {
  symbol: Symbol; w: number; d: number; h: number; color: string;
  worktop?: string; mount?: number; joinery?: Joinery; seat?: number; front?: "flat" | "curved";
  ends?: { endBack: number; endSide: number }; frame?: PictureFrame; patterned?: boolean;
  drop?: number; grid?: GridLayout;
}
export function fixtureParts(o: FixtureShape): FixturePart[];
function lightFittingParts(o: FixtureShape): FixturePart[];   // was positional (symbol, w, d, h, color, drop, grid); stays private, called only from fixtureParts
```
- `cornerEnds` (`lib/catalogue.ts`) and `lampGrid` (`lib/lights.ts`) are already in lib; the caller keeps calling them.
- `PartShape` is a string union in lib; `Fixtures.tsx` keeps `GEOMETRY` keyed by it and a compile-time check `satisfies Record<Exclude<PartShape,"soft">, THREE.BufferGeometry>`.
- Colour constants (`WHITE`, `CHROME`, `STEEL`, `KNOB`, `PLINTH`, `DARK`, `GLASS`, `MARBLE`, `BRASS`, `MIRROR`, `BULB_OFF`) move with it. `WORKTOP = DEFAULT_WORKTOP` comes from where it does today.
- Defaults inside `fixtureParts` match today's parameter defaults exactly (`worktop = WORKTOP`, `mount = 0`, `ends = {0,0}`, `patterned = false`, `drop = 0`, `grid = { pitch: 1.2 }`).
- Splitting by catalogue group (kitchen, bath, seating, lights) is not in this chunk (verifier: can wait).

Proof of no change:
1. First commit: `src/lib/fixtureParts.golden.test.ts` (its final home, so the `.snap` path never moves) that imports a temporary export `__fixturePartsForTest` from `../three/Fixtures` and snapshots its output for every symbol in `CATALOGUE` (`lib/catalogue.ts:185`) at the item's default size, plus variants: joinery on, `seat` set, `front: "curved"`, a corner `ends`, each `PictureFrame`, `patterned`, `drop > 0`, a lamp grid. Commit the `.snap`. If the `.snap` passes 2 MB, snapshot a per-symbol hash (`JSON.stringify` then a simple FNV hash) plus part counts instead.
2. Move to lib with the options object; switch the golden test's import to `./fixtureParts` and map the same inputs to the options object; delete `__fixturePartsForTest`. The `.snap` must not change.
3. New `fixtureParts.test.ts` like `gardenParts.test.ts`: for every symbol, every part's `partBounds`-style box lies within the footprint `[-w/2, w/2] x [-d/2, d/2]` plus a 5 cm tolerance and y within `[-mount, h + drop]`; sizes are finite and positive; at least one part per symbol. Generalise `partBounds` from `lib/gardenParts.ts` to accept a `FixturePart` (same fields) or add a twin.
4. `src/three/Fixtures.test.ts` (it tests `buildFixtureMeshes` and `softGeometry`, which stay) passes unchanged; `scripts/shoot-chassis.cjs` `3d-build-room` and `3d-decorate-room` shots unchanged; the existing "whatever is on, dimmed or warmed" test in `Fixtures.test.ts` covers lit lamps.
5. Performance: `buildFixtureMeshes` allocates one options object per fixture instead of 15 args; negligible, but `scripts/perf-render.cjs` before/after stays within 5%.

### (e) CSS: chrome tokens and chassis rules

Decision (mine, technical): no cascade layers, no one-file-per-chassis.
- Cascade layers: every unlayered rule (fontsource, any leftover) beats every layered rule, so adopting `@layer` is all-or-nothing across 29+ files plus imports. The one real specificity fight found (`mobile.css:64` silently beating `SunControls.css:41`) is fixed by deleting the dead rule, not by layers. Not worth it.
- One file per chassis: splits each component's rules across 3-4 files; the review will grow harder, not easier. No.
- Instead: (1) one token block per chassis, (2) chassis rules stay next to their component but may only set tokens or layout switches, never pixel sums, (3) a guard test enforces it.

Token block: extend the existing one at `styles.css:15` (it already has `--topbar-h`, `--island-h`, `--tabbar-h`, `--sheet-peek`, `--float-gap`, `--float-top`, `--inset-l/r`, `--card-clear`); phone overrides in one `.app[data-chassis="phone"]` block in `mobile.css`. Reuse existing names; add only these:

| Token (new) | Default (desktop/tablet) | Phone | Meaning |
|---|---|---|---|
| `--dock-h` | the desktop dock's computed height (measure; `.dock` sets no height, so it is 32 px buttons + 2 x 6 px padding) | 52px (`Dock.css:25`) | dock island height |
| `--sheet-cover` | 0px | `var(--sheet-peek)`; 0px under `.app[data-sheet="hidden"]` | sheet height under the dock (replaces today's trick of redefining `--sheet-peek` itself at `mobile.css:67`, which also feeds `.sheet[data-detent="peek"]`) |
| `--dock-top` | `calc(16px + var(--dock-h))` (`.dock { bottom: 16px }`) | `calc(var(--sheet-cover) + var(--float-gap) + var(--dock-h))` | dock's top edge above the canvas bottom |
| `--card-w` | 320px; tablet 300px (`styles.css:225,263`) | n/a (sheet) | inspector card width |

At half and full detent the phone dock is hidden (`Dock.css:34`), so `--dock-top` there is not used by the dock; floats that sit on the dock already hide or fade with it.

Rewrites (full list from the grep in Acceptance; numbers are HEAD):
- `.plan-status` (`PlanEditor.css:121`), `.site-status` (`SiteEditor.css:71`): `bottom: var(--dock-top)` (sheet + 12 + 44 + 8 = sheet + 12 + 52: identical px; today they sit flush on the dock, which this keeps; a gap is a later visual tweak).
- `.sun-panel`: delete the dead phone `bottom` in `SunControls.css:41` (beaten by `mobile.css:64`); `mobile.css:64` becomes `calc(var(--dock-top) + 8px)`.
- `.site-scale` (`SiteEditor.css:73`): `calc(var(--dock-top) + 44px)` with the 44 px named `--status-h`.
- `.add-pop` (`PlanEditor.css:124`, `position: fixed`, so viewport-relative): `calc(var(--tabbar-h) + var(--dock-top) + var(--float-gap))`. Check whether `env(safe-area-inset-bottom)` should be in it (the tab bar has it, `mobile.css:7`); if the rects at 390x844 differ, keep today's px.
- `.site-north` (`SiteEditor.css:45,68`): `right: calc(var(--float-gap) + var(--card-w))`.
- Desktop `.sun-panel { bottom: 76px }` (`SunControls.css:2`) and `.viewer-busy` (`styles.css:140`, `--float-gap + 64px`): rewrite to `--dock-top` only if the computed px is identical at 1440x900 and 1920x1080; else leave and allow-list.
- Every `var(--sheet-peek)` used as "what the sheet covers" (`Dock.css:25`, `PlanEditor.css:115` for phone landscape at max-height 500 px, and the sums above) switches to `--sheet-cover`; `.sheet[data-detent="peek"]` keeps `--sheet-peek`; then `mobile.css:67` sets `--sheet-cover: 0px` instead.
- Walk (`walk.css:89` moves the phone dock to `12px + env(safe-area-inset-bottom)` while walking): leave the rule; check its rects in the walking state.

TS side (simplest form, matching the pattern `phoneLeftInset()` already uses at HEAD):
- `src/editor/core/useCameraInsets.ts`: `phoneBottomInset()` measures `.app[data-chassis='phone'] .dock`'s top relative to the canvas (`rail.parentElement` equivalent) plus a 12 px breathing space; it falls back to the token sum only when the dock is not laid out. This removes `DOCK_CLEAR` and the 44-vs-52 drift (the named 8 px exception in Non-goals). Keep `PHONE_LEFT_INSET` as `phoneLeftInset()`'s not-laid-out fallback, rewritten as `12 + 54 + 12` with a comment pointing at the rail CSS, or measured the same way.
- No probe element and no `App.tsx` change: the draft's hidden `.chrome-probe` div is not needed because the real dock and rail can be measured. Never read `getComputedStyle(...).getPropertyValue("--dock-top")`: an unregistered custom property returns the unresolved `calc(...)` string.
- Refit on detent change already works through `sheetGone()` and `fitSuffix`; do not add a `ResizeObserver`.
- Desktop: keeps returning `{ fitSuffix }` only.
- `src/components/mobile/sheet.ts`: keep `SHEET_PEEK_PX` (BottomSheet's `detentHeights` needs a number).

Guard test `src/lib/cssGuard.test.ts` (vitest runs in `environment: "node"`, so it can `fs.readFileSync` the CSS under `src/`):
- no `calc(` containing two or more raw `px` terms in a `top`/`bottom`/`left`/`right` declaration of any rule whose selector has `data-chassis` or `data-touch` (allow-list file plus selector, each with a reason; not line numbers, which move);
- `--sheet-peek` in `styles.css` equals `SHEET_PEEK_PX`;
- no `44px`, `52px`, `54px`, `64px` inside a `calc(` in a `top`/`bottom`/`left`/`right` value outside the token block (plain `width: 44px` on a button is fine and is not checked).
- Count report: prints the `[data-chassis]`/`[data-touch]` line count; target at least 25% fewer than 207 (from deleting rules made redundant by tokens), not enforced.

Proof of no change, (e) only:
- New `scripts/chrome-rects.cjs`: for each size (390x844, 844x390, 820x1180, 1180x820, 1440x900, 1920x1080; phone and tablet with touch, desktop without) and view (3d-build, plan-build, plan-furnish, plan-garden, plan-garden-item, plan-plot; on the phone with sheet hidden, peek and half; plus Walk on and Compare wipe on, on phone and 1440x900) dump `getBoundingClientRect()` of `.dock, .tool-rail, .plan-status, .site-status, .site-scale, .site-north, .sun-panel, .add-pop, .sheet, .inspector-card, .viewer-busy` (whichever exist) and the plan editor's SVG transform (the fit) to JSON. Run on `main` before, and on the branch after; compare: phone and desktop rects equal within 0.5 px (except the plan fit's named 8 px bottom change); tablet within 2 px.
- `scripts/shoot-chassis.cjs` `SIZES` env and `scripts/diff-shots.cjs` come from Chunk A (see Build plan).

## Build plan (chunks for parallel Sonnet builders in separate worktrees: for each chunk the files it owns, the files it must stay out of, the steps, and how to verify; note the order and dependencies)

Order: A first, alone (half a day to a day; gives every other chunk `npm run lint`, the `SIZES` screenshot env and `diff-shots.cjs`). Then B, C, D, E in parallel. F last, after A-E are on `main`. Agent names avoid the quick-win agents' names (Dua Lipa, Harry Styles, Robbie Williams, Charli XCX, Lady Gaga) so branches and reports do not collide. Every chunk: worktree per CLAUDE.md (symlink `node_modules` unless `package-lock.json` differs; A changes it, so chunks started after A merges re-symlink from the updated main checkout), commit trailer from the session's attribution reminder, `npm run check` and `npm run build` pass, merger fast-forwards to `main`.

| Chunk | Name | Model | Owns | Stays out of | Depends on |
|---|---|---|---|---|---|
| A | Lorde: tooling stage 1 | Sonnet medium | `eslint.config.js`, `tsconfig.node.json`, `knip.json`, `package.json`, `package-lock.json`, `.github/workflows/check.yml`, JSDoc-only edits in `server/`, `scripts/`, `vite.config.ts`; `scripts/shoot-chassis.cjs` (`SIZES` env; desktop sizes get `isMobile: false, hasTouch: false`), new `scripts/diff-shots.cjs`; trivial lint-error fixes anywhere in `src/` (no logic change; it runs alone) | `react-hooks` warnings (F's) | quick wins merged |
| B | Taylor Swift: planning rules | Sonnet medium; Opus medium review of diff | `src/lib/planning.ts`, `src/lib/planning.test.ts`, new `src/lib/planningFixtures.ts`, new `src/lib/planning.golden.test.ts` and its `__snapshots__` | all else | A (for lint; can start without it) |
| C | Shakira: site editor split | Sonnet medium; Opus medium review of `siteKeys` | `src/editor/SiteEditor.tsx`, new `src/editor/site/{PlotInspectors.tsx,useSiteKeys.ts,SiteChrome.tsx}`, new `src/lib/siteKeys.ts` (+test), `src/editor/site/types.ts` (`Tool` re-export only), `src/lib/editorCore.ts` (+test, `niceScale` only), `src/editor/core/components.tsx`, `src/editor/core/index.ts` (add `ScaleBar` only), site section of `scripts/editor-regression.mjs` | all `.css`; `useCameraInsets.ts`; `PlanEditor.tsx`; `src/components/SitePanel.tsx`; `GardenInspectors.tsx` | A |
| D | Kylie: fixture catalogue | Sonnet medium | `src/three/Fixtures.tsx`, `src/three/Fixtures.test.ts`, new `src/lib/fixtureParts.ts` (+test), new `src/lib/fixtureParts.golden.test.ts` and its `__snapshots__`, `src/lib/gardenParts.ts` (generalise `partBounds` only) | everything else | A |
| E | Rihanna: chrome tokens | Sonnet medium; Opus medium review | all `src/**/*.css`, `src/editor/core/useCameraInsets.ts`, `src/components/mobile/sheet.ts`, `src/components/mobile/BottomSheet.tsx` (read only unless needed), new `src/lib/cssGuard.test.ts`, new `scripts/chrome-rects.cjs` | `SiteEditor.tsx`, `PlanEditor.tsx`, `src/editor/core/index.ts`, `src/App.tsx`, all `src/lib` except the guard test, `src/three/*.tsx`, `scripts/shoot-chassis.cjs` | A |
| F | Adele: lint to zero | Sonnet medium; Opus medium review of every deps change | the 42 disable sites (`House.tsx`, `WalkControls.tsx`, `Viewer.tsx`, `Site.tsx`, `Fixtures.tsx`, `DoorLeaves.tsx`, `plan/useGeometry.ts`, `WalkExposure.tsx`, `useSunlight.ts`, `frameLoop.tsx`, ...), knip findings, `eslint.config.js` (stage 2-3), `knip.json`, `package.json` scripts | nothing big in flight | A-E merged |

Shared-file notes
- `SiteEditor.css`: E only. C keeps class names (`site-scale`, `site-status`, `site-north`) so no CSS edit is needed.
- `scripts/editor-regression.mjs`: C edits only its `site` section.
- `package.json`: A only, then F. Others must not add scripts; new scripts run as `node scripts/...`.
- `src/lib/__snapshots__/`: B and D each add their own `.snap` file (different names); no shared file.
- `src/editor/core/index.ts`: C only (E removes no export from `useCameraInsets.ts` that the index re-exports by name; it uses `export *`).

Steps per chunk

A (Lorde)
1. Install exact versions: `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `globals`, `knip`, `@types/node@22`.
2. Write the three configs as above. Run `npx eslint .`: fix only errors that are not hook warnings and are trivial (no logic change); record the warning count N.
3. `npx tsc -p tsconfig.node.json`: fix with JSDoc; drop `scripts/*.mjs` if over budget (note it).
4. `npx knip --no-exit-code > /dev/null` must run; paste the summary counts into the report (not a file).
5. Add `SIZES` to `shoot-chassis.cjs` (default: today's three, so existing use is unchanged) and write `diff-shots.cjs` (compares two folders in headless Chromium via canvas `getImageData`, no new npm dependency; prints changed-pixel % per image; exit 1 over a threshold flag).
6. Update scripts and the workflow; push a branch and confirm the workflow passes on GitHub (`gh run list --branch <branch>`).
Verify: `npm run check`, `npm run build`, CI green, `server/*.test.mjs` still run in vitest (`npx vitest run server`); `SIZES=phone PORT=<n> OUT=<dir> node scripts/shoot-chassis.cjs` gives the same 13 files as before.

B (Taylor Swift)
1. Golden test and snapshot; commit alone.
2. Extract `buildCtx`, `verdictOf`; commit; tests green.
3. Extract rule sets one at a time in `RULE_SETS` order, a commit each; tests and snapshot green after each.
Verify: `npx vitest run src/lib/planning`, `git diff --exit-code -- src/lib/__snapshots__/`, `planningCheck` body under 120 lines (`awk` range count in the report), Review screenshot at 1440x900 unchanged.

C (Shakira)
1. `niceScale` + test; `ScaleBar` in core; SiteEditor uses it.
2. Move plot inspectors to `PlotInspectors.tsx` (pure move; imports only).
3. `siteKeys.ts` + tests written against today's handler (read it branch by branch); then `useSiteKeys.ts`; delete the inline handler.
4. If `SitePlan` still over 350 lines, move rail and chrome to `SiteChrome.tsx`.
Verify: vitest; on desktop by hand in the regress run: every row of the key table (V R C P A B Q E F + - arrows Esc Enter Backspace Delete, Ctrl D/C/V) still acts; `npx vite --port 5231` then `npm run regress:editors -- --port 5231 --only site`; `PORT=5231 node scripts/test-garden.cjs`; `PORT=5231 node scripts/test-touch-plan.cjs`; screenshots as in Acceptance.

D (Kylie)
1. Golden test of current `fixtureParts` over the whole catalogue and variants; commit alone.
2. Move to lib with `FixtureShape`; update the single caller in `buildFixtureMeshes` and the one internal `lightFittingParts` call; snapshot unchanged.
3. Bounds tests per symbol; fix nothing in geometry: if a symbol breaks bounds, allow-list it in the test with a comment and list it in the report.
Verify: vitest; `wc -l src/three/Fixtures.tsx` about 470; `3d-decorate-room` and `3d-build-room` shots unchanged at 390x844 and 1440x900.

E (Rihanna)
1. Write `chrome-rects.cjs`; capture rects and `SIZES=phone,desktop,desktop-wide` shots from `main` into the scratchpad (not the repo).
2. Add the token block; rewrite one file at a time; rerun rects after each file.
3. Rewrite `phoneBottomInset()` to measure the dock; delete `DOCK_CLEAR`.
4. Add `cssGuard.test.ts`; delete chassis rules made redundant.
Verify: rects within tolerance; shot diffs; `scripts/test-touch-plan.cjs`, `scripts/test-garden.cjs`, `npm run regress:editors`; phone plan fit: the house outline's bounding box sits above the dock's top and right of the rail with sheet hidden and peek, at 390x844 and 844x390; desktop fit transform identical.

F (Adele)
0. Re-take `scripts/perf-render.cjs` baselines on `main` first (the render-quality quick win changes them).
1. For each disable: delete it, read the warning, then (i) add the dep, (ii) use a ref / functional update, or (iii) keep the disable with a `--` reason. One commit per file.
2. Turn on `reportUnusedDisableDirectives` and ratchet `--max-warnings` to 0; set `exhaustive-deps` to error.
3. Clear knip: delete dead code (per Q3 for test-only exports); switch knip to gating.
Verify per file changed: `House.tsx` and `Viewer.tsx`: `scripts/shoot-chassis.cjs` 3D shots and `scripts/perf-render.cjs` frame times within 5%; `WalkControls.tsx`, `WalkExposure.tsx`: `scripts/test-walk-a.cjs`, `-c`, `-d`, `-e` (there is no `-b`) and `shoot-walk.cjs`; `Site.tsx`, `useSunlight.ts`: `scripts/test-garden.cjs`; `plan/useGeometry.ts`: `npm run regress:editors`; `DoorLeaves.tsx`: `3d-build-room` shot; electrics-affecting files: `scripts/test-electrics.cjs`.

## Acceptance checks (runnable: npm run check and build, which Playwright scripts or new checks, which screenshots at which sizes, and measurable targets)

Always
- `npm run check` and `npm run build` pass; GitHub `check` workflow green on the merge commit.
- `npm run check` wall time under 60 s on the container (the review measured 34 s).

| Part | Check | Target |
|---|---|---|
| a | `npx eslint . --max-warnings=0` (after F) | 0 errors, 0 warnings |
| a | `grep -rn "eslint-disable" src \| grep -v -- " -- "` | 0 lines (every disable carries a reason) |
| a | `grep -rn "eslint-disable" src \| wc -l` | target under 15 (from 43); not a gate: a kept disable with a reason is fine |
| a | `npx tsc -p tsconfig.node.json` | 0 errors over `server/`, `scripts/house/`, `vite.config.ts` |
| a | `npx knip` | exit 0 |
| b | `planning.golden.test.ts`, `planning.test.ts` | pass; snapshot unchanged; 26 existing tests unchanged |
| b | length of `planningCheck` | under 120 lines; no rule set over 150 |
| c | `siteKeys.test.ts` | about 30 cases, every row of the key table |
| c | `npm run regress:editors -- --port <n>` (plan and site) | green |
| c | `scripts/test-garden.cjs`, `scripts/test-touch-plan.cjs` | green |
| c | `wc -l src/editor/SiteEditor.tsx` | at most 400 |
| d | golden snapshot | unchanged |
| d | bounds test | every catalogue symbol covered |
| d | `wc -l src/three/Fixtures.tsx` | at most 500 |
| e | `scripts/chrome-rects.cjs` before vs after | phone (portrait, landscape, Walk, Compare, each sheet detent) and desktop within 0.5 px, except the named 8 px plan-fit change; tablet within 2 px |
| e | `cssGuard.test.ts` | pass |
| e | `grep -rnE "calc\([^)]*[0-9]+px[^)]*\+[^)]*[0-9]+px" src --include=*.css` | only the allow-listed selectors (today's hits include `walk.css:89` and `Dialogs.css:21`, which use `env()` and may stay) |
| e | magic constants | `grep -n "DOCK_CLEAR" src/editor/core/useCameraInsets.ts` empty; `SunControls.css` has no phone `bottom` |
| all UI | `SIZES=phone,tablet-portrait,desktop,desktop-wide PORT=<n> OUT=<dir> node scripts/shoot-chassis.cjs` on `main` and on the branch, then `node scripts/diff-shots.cjs <before> <after>` | views welcome, 3d-build, 3d-build-room, 3d-decorate-room, plan-build, plan-furnish, plan-electrics, plan-garden, plan-garden-item, 3d-garden, plan-plot, review, housemenu: under 0.1% changed pixels on 2D views; 3D views under 0.5% (SwiftShader noise) |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A hook-deps "fix" re-runs an effect every frame (House.tsx has 13) and tanks frame rate or loops | Opus review of every deps change; `scripts/perf-render.cjs` before/after; prefer refs over new deps in r3f frame code; keep a disable with a reason when the effect is intentionally once-only |
| Lint stage 1 floods with warnings and nobody ratchets | `--max-warnings=N` set to today's count from day one, so the number can only fall |
| checkJs over untyped `.mjs` produces noise | `strict: false`, JSDoc fixes only, `.cjs` Playwright scripts excluded if over budget |
| knip false positives from `virtual:houses` and dynamic imports | houses' `index.ts` as entries; knip report-only until F |
| eslint 10 peer mismatch with typescript-eslint or the hooks plugin | fall back to eslint 9 in A; note versions in the report |
| planning refactor reorders rules or consents (user-visible in the Planning panel and Review) | snapshot of the full ordered output; `RULE_SETS` order equals today's push order; consents built in one place in today's order |
| siteKeys changes precedence (Backspace with polygon vs delete; Ctrl keys on Plot) | tests written from the old handler before deleting it; regress script |
| fixture move changes a default (e.g. `ends`, `grid.pitch`) | golden snapshot over every symbol and the variants |
| CSS token rewrite moves a float by a pixel on phone | rect diff at 0.5 px and screenshot diff per view, in every sheet detent, Walk and Compare |
| Measuring the dock on fit reads layout | one `getBoundingClientRect` per fit, as `phoneLeftInset()` already does; not per frame |
| Quick wins land differently from this spec's assumptions | each chunk starts by re-reading its files at `main`, adjusting names, and listing differences in its report |
| Parallel chunks collide | file ownership table; C and E split by `.tsx` vs `.css`; B and D write different `.snap` files; A runs alone first |
| Quick-win branches still open when this starts (`qw/*`) | Assumptions list what must be on `main`; Chunk A does not start until `.github/workflows/check.yml` and the NumberField change are on `main` |
| Golden snapshots get blindly updated with `-u` | builders never pass `-u`; verify step runs `git diff --exit-code` on the `.snap` |

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
3. Code used only by tests (the review's CODE11 list, e.g. `sunlightFor`, `fitDistance`; knip `--production` gives the full list after the quick wins):
   - (a) Delete the function and its test.
   - (b) Keep it, tagged `/** @public test helper */` so knip ignores it.
   - Recommendation: (a), unless the function is a planned feature you want kept; F lists each one in its report before deleting.
4. Should the plan editor gain the shared scale bar too (a small visible change on Build, Furnish, Electrics)?
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
- Playwright in CI (unless Q1 says otherwise); typechecking the root `scripts/*.cjs` Playwright checks (they need Playwright from the container path).
- Visual tweaks the tokens make easy (an 8 px gap between the phone status floats and the dock; the plan editor's scale bar, Q4): later one-line changes.

## Effort (S/M/L per chunk and in total)

| Chunk | Effort | Notes |
|---|---|---|
| A Lorde: tooling stage 1 | M | mostly config; checkJs fixes may surprise; plus `SIZES` and `diff-shots.cjs` |
| B Taylor Swift: planning rules | M | mechanical with golden guard |
| C Shakira: site editor split | M | siteKeys tests are the work |
| D Kylie: fixture catalogue | M | 1,300 lines moved; golden guard |
| E Rihanna: chrome tokens | M | about 10 sums in 7 files to rewrite, the rect script, redundant-rule pruning across 29 files |
| F Adele: lint to zero | M | 43 disables, each reviewed; perf checks |
| Total | L | about 6 builder-days; A first, B-E in parallel, F last |
