# Onboarding a second house: implementation plan ("The Eras Tour")


> **Update (2026-10-28):** the hosted Claude artifact and `npm run build:hosted` were dropped. Render deploys main and is the only hosted copy; read the artifact parts below as history.

Status: approved brief (docs/onboarding-brief.md) with every open decision settled: one live deployment, **one passcode per house** on the server, the owner's hosted artifact carries **the owner's house only**, the fidelity tier is picked **after the basic 3D**, the theme stays in the **playbook** (the app stays Storey, docs/brand.md).

Lead: **Taylor Swift** (Opus) runs the show: lands Chunk 0 through a builder, launches the builders in parallel worktrees, merges, checks, reports. Builders are Sonnet (medium) unless noted. The lead session (Fable) pushes and republishes.

| Chunk | Agent | Owns | Depends on |
|---|---|---|---|
| **0 Foundation** | Sabrina Carpenter | `src/houses/**` (new), `vite.config.ts`, `src/globals.d.ts`, `src/lib/house.ts` (new), the `git mv` of the listing | none; lands first |
| **A App wiring** | Gracie Abrams | every file in §3 that is not in another chunk: `src/App.tsx`, `src/main.tsx`, `src/store.ts`, `src/lib/presetActions.ts`, `sitePreset.ts`, `startupPrompt.ts`, `migrate.ts`, `siteMerge.ts`, `studio.ts`, `brand.ts`, `reviewSummary.ts`, `wiringGuide.ts`, `sync.ts`, `persist.ts`, `src/components/{Welcome,HouseMenu,ImportPanel,PhotosPanel,SitePanel,ListingUpdatesDialog,SettingsPanel}.tsx`, `src/editor/SiteEditor.tsx`, new `src/components/HousePicker.tsx` (+css) | 0 |
| **B Server** | Phoebe Bridgers | `server/**`, `render.yaml`, README "Hosting on Render" and "Keeping one project on every device" | 0 (reads `src/houses/index.ts` only for the house id format) |
| **C Tooling** | HAIM | `scripts/build-hosted.mjs`, new `scripts/house/*.mjs`, `src/houses/_template/**` (after 0 creates the folder), `src/houses/lint.ts` (+test), `package.json` scripts | 0 |
| **D The playbook** | Ed Sheeran (the support act) | `.claude/skills/eras-tour/**`, `reference/_template/**`, `CLAUDE.md`, README "Adding your own house" | 0 for names only; writes against this plan |
| **Review** | Paramore (Opus, medium) | reads the merged diff, returns findings for the lead to fix | A–D merged |

Merge order: 0, then A, B, C, D in any order (no shared files after 0). Each builder: worktree under `.claude/worktrees/<name>`, node_modules symlinked from the main checkout, `npm run check` and `npm run build` green before reporting, one commit per logical change, trailer `Co-Authored-By: Claude <noreply@anthropic.com>` plus the session line the lead gives it.

---

## 1. Decisions made here (agents: don't reopen these)

1. **A house is a folder.** `src/houses/<id>/` with `index.ts` (default export: `HouseDef`), `house.ts` (the tracing), `assets.ts`, `assets/` (the floorplan; photos stay in `reference/<id>/photos/`), `NOTES.md`, `house.test.ts`. The id is the folder name, a slug, never an address: `listing-91770873` is the first.
2. **The registry is a virtual module.** `virtual:houses` (a tiny plugin in `vite.config.ts`) lists the folders under `src/houses/` at build time and emits `export const HOUSES = { "<id>": { id, name, load: () => import("/src/houses/<id>/index.ts") } }`. Folders whose names start with `_` are skipped unless named in `VITE_HOUSES`. When `VITE_HOUSES` (comma-separated ids) is set, only those folders are emitted, so nothing else, photos included, enters that build. The display name comes from `src/houses/<id>/meta.json` (`{ "name": "Listing 91770873" }`), read by the plugin so the picker has names without loading a house. Vitest gets the same module through the plugin (vite.config.ts is shared).
3. **The active house is decided synchronously at startup**, in `src/lib/house.ts`: a `<meta name="storey-house" content="<id>">` injected by the server wins (and hides switching); else `localStorage["storey-house"]`; else the only house when there is one; else none, and `main.tsx` renders the picker before the app. The store module reads `activeHouseId()` at import time, so the picker must render before `App` is imported (`React.lazy` the app behind the choice). Picking writes localStorage and reloads; so does "Switch house…".
4. **Per-house browser storage.** Persist name stays `house-modeler` for `listing-91770873` (existing saves keep working) and becomes `house-modeler/<id>` for any other house; `IMG_KEY_PREFIX` likewise (`house-modeler/img/` vs `house-modeler/<id>/img/`); every other localStorage key the app writes (remembered startup answers, sync revision, panel prefs that hold project state) is suffixed `/<id>` for non-default houses. `WRITER_LOCK` is per house too.
5. **One passcode per house on the server.** `PASSCODES="listing-91770873=…,<id>=…"` (ids and codes may not contain `,` or `=`; whitespace trimmed). `PASSCODE` alone still works and means the house in `DEFAULT_HOUSE` (default `listing-91770873`). The session token becomes `<house>.<expiry>.<hmac>`, signed with a key derived per house from the secret and that house's passcode, so changing one passcode signs out only that house. The project file is `project.json` for the default house (the data already on the disk) and `project-<id>.json` for others. `/api/project` is scoped by the cookie's house. `/api/me` returns `{ "house": "<id>" }`. `index.html` is served with the meta tag from decision 3 injected after `<head>`.
6. **The hosted artifact is built for one house.** `npm run build:hosted` defaults to `VITE_HOUSES=listing-91770873`; `npm run build:hosted -- --house <id>` builds another. CLAUDE.md's republish rule stays as it is for the owner; a house folder may record its own artifact URL in `NOTES.md` and its owner republishes there.
7. **Strings.** No file outside `src/houses/` may contain `91770873`. The house's `name` replaces "Listing 91770873"; "the listing" in prose becomes "the built-in house" or the house name. Preset ids keep their values (saved projects carry them).
8. **The template is a working house.** `src/houses/_template/` is a small two-room, one-floor house with a plot, so the registry and picker can be tested with two houses (`VITE_HOUSES=listing-91770873,_template`) and `scripts/house/new.mjs` copies it.
9. **No in-app theme.** Welcome, picker and menus use plain Storey wording.

## 2. Chunk 0: foundation (Sabrina Carpenter)

- `git mv src/lib/houses/listing91770873.ts src/houses/listing-91770873/house.ts`, `listingAssets.ts` → `assets.ts`, `listing91770873.test.ts` → `house.test.ts`, `src/assets/listing-91770873/` → `src/houses/listing-91770873/assets/`, `reference/listing-91770873/NOTES.md` → `src/houses/listing-91770873/NOTES.md` (leave `reference/listing-91770873/scripts/` where it is; update the NOTES path in CLAUDE.md's first paragraph and README). Fix the relative imports; keep every export.
- New `src/houses/types.ts`:
  ```ts
  export interface LayoutPreset { version: number; build: (image: string) => HouseModel }
  export interface SitePreset { version: number; build: () => Site }
  export interface WelcomeTile { preset: string; variant: VariantKey; title: string; caption: (areaM2: number) => string }
  export interface HouseDef {
    id: string; name: string;
    presets: Record<string, LayoutPreset>; sitePresets: Record<string, SitePreset>;
    main: string;            // As listed preset id
    proposed?: string;       // built-in Proposed preset id, if any
    site: string;            // main site preset id
    tiles: WelcomeTile[];
    floorplan: () => Promise<string>;                       // data URL
    placeholderImage: () => string;
  }
  ```
- `src/houses/listing-91770873/index.ts` builds the `HouseDef` from `house.ts` and `assets.ts` (tiles are the two from `Welcome.tsx`). `meta.json` holds the name.
- `src/houses/index.ts` re-exports `HOUSES` and `DEFAULT_HOUSE_ID = "listing-91770873"` from `virtual:houses`, with `HouseEntry = { id: string; name: string; load: () => Promise<{ default: HouseDef }> }`; `houseList()` sorted with the default first.
- `vite.config.ts`: the plugin from decision 2 (`resolveId`/`load` for `virtual:houses`, `fs.readdirSync`, `meta.json`, `VITE_HOUSES`, `_` rule); `src/globals.d.ts` declares the module.
- `src/lib/house.ts`: `activeHouseId(): string | null` (decision 3), `isHouseFixed(): boolean` (meta present), `chooseHouse(id)` (localStorage + reload), `loadHouse(id): Promise<HouseDef>` (memoised), `currentHouse(): HouseDef` (throws before load), `useHouse()` (a zustand store `{ house: HouseDef | null }` set by `loadHouse`), `storageSuffix(id)` ("" for the default, `/<id>` otherwise). Tests for `activeHouseId` given meta/localStorage/one-or-many houses, and `storageSuffix`.
- `src/houses/_template/`: `meta.json` ("Template house"), `house.ts` (two rooms, a door, two windows, stairs omitted, a rectangular plot with one neighbour, `TEMPLATE_PRESET` version 1), `index.ts`, `NOTES.md` (headings only), `house.test.ts` (calls `lintHouse` from chunk C: until C lands, a placeholder test that the def builds). Folder name starts with `_`, so it never ships unless listed.
- Compile and tests green with nothing else changed: the old import paths are gone, so chunk 0 fixes every importer to the new paths (`src/houses/listing-91770873/house` etc.) **without** otherwise changing behaviour. A follows and replaces those imports with the active house.

## 3. Chunk A: app wiring (Gracie Abrams)

Replace every direct use of the listing with the active house. Grep for `houses/listing-91770873`, `LISTING_`, `listing91770873`, `listingSite`, `91770873`, `Listing 91770873` outside `src/houses/`; the list at the time of writing:

| File | Change |
|---|---|
| `src/main.tsx` | If `activeHouseId()` is null, render `HousePicker` (reads `houseList()`, calls `chooseHouse`); else `loadHouse(id)` then lazy-import and render `App` with `<Loader kind="blueprint">` and the label "Opening <name>" meanwhile. |
| `src/store.ts` | `persist` name and the storage prefix from `storageSuffix(activeHouseId())`; pass the suffix into `imageAwareStorage`. |
| `src/lib/persist.ts` | `IMG_KEY_PREFIX` and `WRITER_LOCK` become functions of the suffix (keep the exported constants for the default house so existing tests pass). |
| `src/lib/sync.ts` | the remembered revision key takes the suffix. |
| `src/lib/presetActions.ts` | `loadListing` → `loadHouse(variant)` reading `currentHouse()`: `presets[main]`, `presets[proposed]`, `sitePresets[site]`, `floorplan()`, `placeholderImage()`. `PRESETS`/`SITE_PRESETS` references become the house's. `latestListing` keys on house id and version. Keep every exported function name except `loadListing` → `loadBuiltIn` (update callers). |
| `src/lib/sitePreset.ts` | `LISTING_LAYOUTS`, `LISTING_SITE_PRESET` become parameters with defaults from `currentHouse()`; the pure functions keep their `registry` parameter. |
| `src/lib/startupPrompt.ts` | messages take `houseName: string`; `App.tsx` passes `currentHouse().name` and `.main`. |
| `src/lib/migrate.ts` | the listing-only steps run when the active house id is `listing-91770873` and use `currentHouse()` (`sitePresets[site].build()` in place of `listingSite()`); the migration is otherwise unchanged. |
| `src/lib/siteMerge.ts` | the two messages take the house name. |
| `src/lib/studio.ts` | `houseName()` returns `currentHouse().name` when the model's preset or basedOn id belongs to it, else "House". |
| `src/lib/brand.ts` | unchanged; callers pass `currentHouse().id`. |
| `src/lib/reviewSummary.ts`, `wiringGuide.ts`, `export.ts` | the house name from the caller. |
| `src/components/Welcome.tsx` | title and tiles from `currentHouse()`; the tile loads `preset` into `variant`. |
| `src/components/HouseMenu.tsx` | "Switch house…" when `houseList().length > 1 && !isHouseFixed()`: opens `HousePicker` in a modal. |
| `src/components/HousePicker.tsx` | brand mark, "Which house?", one tile per house (name, id in mono), keyboard reachable, phone width. Uses `<Loader>` while reloading. |
| `src/components/{ImportPanel,SitePanel,ListingUpdatesDialog,SettingsPanel}.tsx`, `src/editor/SiteEditor.tsx` | names from the house. |
| `src/App.tsx` | `decideStartupPrompt(variants, house.presets, house.main, …)`. |

Tests: `src/lib/house.test.ts` (chunk 0) plus updates where signatures gained a parameter. `scripts/shoot-chassis.cjs` and `scripts/test-*.cjs` must still run (they open the default house; no picker appears because one house is built unless `VITE_HOUSES` lists two).

## 4. Chunk B: server (Phoebe Bridgers)

- `server/auth.mjs`: `parsePasscodes(env)` → `Map<houseId, passcode>` from `PASSCODES`, falling back to `PASSCODE` + `DEFAULT_HOUSE`; `deriveKey(secret, passcode, house)`; tokens `<house>.<expiry>.<hmac>` (`house` matched by `/^[a-z0-9-]{1,40}$/`); `verifySessionToken` returns the house or `null`; `houseForPasscode(input, map)` constant-time over every entry (no early exit). Tests in `auth.test.mjs`.
- `server/project.mjs`: `createProjectStores(dir, houses, defaultHouse)` → one store per house, file `project.json` for the default and `project-<id>.json` otherwise. Tests.
- `server/server.mjs`: login picks the house from the passcode; `/api/project` uses the cookie's house; `/api/me`; `index.html` served with `<meta name="storey-house" content="<id>">` inserted after `<head>` (only for authenticated requests; the login page is unchanged); refuse to start when neither `PASSCODES` nor `PASSCODE` is set, and warn per short passcode.
- `render.yaml`: add `PASSCODES` (`sync: false`) beside `PASSCODE`; comment which to set.
- README: the two sections, plus a line in "Keeping one project on every device" that each house has its own shared copy.

## 5. Chunk C: tooling (HAIM)

- `scripts/build-hosted.mjs`: `--house <id>` (default `listing-91770873`) sets `VITE_HOUSES` for the vite build; after the build, assert no file under `dist-hosted/assets` comes from another house (the plugin makes this true; the check guards it).
- `scripts/house/new.mjs <id> "<Name>"`: copies `_template` to `src/houses/<id>/`, writes `meta.json`, renames the preset ids to `<id>` and `<id>-site`, creates `reference/<id>/` from `reference/_template/` (chunk D's files; create the folder if they are not there yet). Refuses ids that are not slugs.
- `scripts/house/overlay-plan.mjs <id> [--floor n] [--out png]`: builds the house with `tsx`-free means (vitest `--run` a tiny script, or `vite-node`; pick what works without a new dependency) and screenshots, with the pre-installed Playwright, an HTML page that draws the floorplan image with the rooms (red), openings (by kind) and stairs over it, in image pixels. Replaces `reference/listing-91770873/scripts/overlay-plan.py`.
- `scripts/house/overlay-map.mjs <id> <map.png> --scale <px per m> --origin <x,y> [--bearing deg]`: the same for the plot: boundary, neighbours and house footprint over a north-up map, so a tracing of the map can be checked by eye.
- `src/houses/lint.ts` (+test): `lintHouse(def): string[]` — every preset builds; every opening sits on a room edge (reuse the check from the listing test); rooms are simple polygons with 3+ corners; each floor has `pxPerM > 0`; printed `dims` within 8% of the polygon's area where given; every photo place names an existing floor and room; the main site has a boundary of 3+ corners and `latitude`/`longitude`/`frontBearing` set; no string in the def's JSON matches a UK postcode or looks like a street address (`/\b\d{1,4}\s+[A-Z][a-z]+\s+(Road|Street|Lane|Avenue|Close|Drive|Way)\b/`). `_template/house.test.ts` and `listing-91770873/house.test.ts` call it.
- `package.json`: `"house:new"`, `"house:overlay"`, `"house:map"`.

## 6. Chunk D: the playbook (Ed Sheeran)

- `.claude/skills/eras-tour/SKILL.md` (front matter `name: eras-tour`, `description: Onboard a new house into Storey, era by era`). The body is the brief's "show", written as instructions Claude follows in the mate's session:
  - Support act (Ed Sheeran): check `reference/<id>/INTAKE.md` is filled and the files are there; if not, stop and list what is missing in Ed's song names.
  - Debut: `npm run house:new`, commit.
  - Fearless: read the floorplan image with the Read tool; write `house.ts` in image pixels using the `rect`/`poly`/`op` helpers; `npm run house:overlay`; compare areas with printed sizes; 3D screenshot via Playwright (`scripts/screenshots.mjs` pattern).
  - Speak Now: the one round of questions (AskUserQuestion when available), each with a recommendation.
  - Red, 1989: exterior and plot from the photos and map, `npm run house:map`; bump preset versions; commit each era.
  - Reputation: `npm run check`, screenshots sent, then the fidelity explanation copied from the brief and the choice (basic / Lover / Taylor's Version) via one question.
  - Lover, Folklore, Taylor's Version: scoped as in the brief; each a separate session is fine; every pass bumps the version so the update prompt offers it.
  - Encore: the house's passcode added to `PASSCODES` on Render by the owner (the skill tells the mate to ask), optional own artifact (`npm run build:hosted -- --house <id>`), and how updates reach a browser.
  - Rules: no address, postcode, title number or names anywhere; NOTES.md records every fact and its source; subagents named after the Eras Tour openers; report one line per era.
- `reference/_template/INTAKE.md`: the support-act table as a checklist with blanks (the ten questions under Thinking Out Loud), where to put files, and the slug rule.
- `reference/_template/NOTES.md`: the listing NOTES' headings with one line each on what goes there.
- `CLAUDE.md`: first paragraph becomes "for the houses in `src/houses/` (the owner's is `listing-91770873`)"; the privacy rule says "refer to a house by its folder id"; a "Houses" bullet in the code map; the republish rule unchanged; one line: "To add a house, run `/eras-tour`".
- README "Adding your own house": five lines and a pointer to the skill.

## 7. Acceptance checks (the lead runs these before reporting)

1. `npm run check` and `npm run build` pass; `grep -rn 91770873 src server scripts --include=*.ts --include=*.tsx --include=*.mjs | grep -v src/houses/listing-91770873` is empty except `rugTextures.ts`'s seed.
2. `npm run build:hosted` output's `assets/` holds no `_template` chunk or photo; `npm run build:hosted -- --house _template` holds no listing photo.
3. With `VITE_HOUSES=listing-91770873,_template npm run dev`, a fresh browser shows the picker; choosing the template opens it with its two rooms; "Switch house…" in the House menu goes back; the listing's saved project is untouched (Playwright script, `scripts/test-houses.cjs`, added by the lead or chunk A).
4. `PASSCODES="listing-91770873=abcdefghij,_template=klmnopqrst" npm start` after a build: the first code opens the listing with the meta tag set and no "Switch house…"; the second opens the template; `/api/project` PUT from one does not change the other's file; `/api/me` matches. Server tests cover the token format and `parsePasscodes`.
5. `scripts/shoot-chassis.cjs`, `test-touch-plan.cjs`, `test-garden.cjs`, `test-electrics.cjs` and `npm run regress:editors` still pass on the default house.
6. `npm run house:new demo-house "Demo house"` then `npm run check` passes with the new folder present, and `git clean` removes it.
7. `/eras-tour` loads (the skill is listed) and its SKILL.md front matter validates.
