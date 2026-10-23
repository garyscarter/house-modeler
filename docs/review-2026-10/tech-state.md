# Storey: technical review, state, data, persistence, sync, server, tooling (Elton John)

Scope: architecture, store, data model, persistence, sync, Node server, build and tooling, tests, security and privacy. Rendering and the editors are left to the other reviewer, except where state flows into them. Read-only review at HEAD. I built once into the scratchpad, ran `npm outdated` and `npm audit`, and inspected the bundled photos.

Severity: **H** high, **M** medium, **L** low. Effort: **S** under half a day, **M** one to two days, **L** more than that.

---

## 1. Verdict

1. The code is unusually disciplined for a one-person app. Pure logic sits in `src/lib`, the tests check behaviour (71 files, no snapshots), the server uses only Node built-ins with careful auth helpers, the sync protocol never overwrites silently, and the comments explain *why*.
2. The weak spots are the failure paths, not the main path. Nothing catches a render error, a failed hydration leaves the app on its loading screen for good, and failed IndexedDB writes are only logged to the console.
3. Several cases can lose data quietly: two tabs share one IndexedDB key and garbage-collect each other's images; an undo after a server load can push old data back to the server; the server keeps no backups of `project.json`.
4. Sync is correct but heavy. Every save uploads the whole project with its photos embedded (MBs to 50 MB), and a fresh page load downloads it in full before it even knows whether anything changed.
5. Tooling is thin: no lint, no CI, `server/` and `scripts/` are not typechecked, and Render deploys `main` without running the tests.

**The five changes that matter most**
1. Make startup and render failures recoverable: an error boundary, an `onRehydrateStorage` error path, and a "start fresh / export raw data" screen (H, S).
2. Make IndexedDB single-writer across tabs and stop the image GC deleting images another tab uses (H, M).
3. Show save failures and request persistent storage: `navigator.storage.persist()` plus a "Couldn't save on this device" status (H, S).
4. Add a store transaction API, and clear or fence undo history when a server copy is applied (M, S–M).
5. Keep the last N server revisions as backups, and add CI with lint (M, S each).

---

## 2. Architecture

**Module boundaries.** Mostly clean: `src/lib/*` is pure and tested. The exceptions are known and small:
- `src/lib/sync.ts:2-3` imports the store and `choose` from `components/Dialogs`, so a lib module depends on UI. `src/lib/presetActions.ts:1` and `src/lib/clipboard.ts:1` (React `useSyncExternalStore`) are impure too. `src/lib/modes.ts:1` and `src/lib/studio.ts:2` import types from `../store`, which inverts the dependency. **L/S:** move `sync.ts` and `presetActions.ts` to `src/app/` (or `src/actions/`), and move `Tab` and `ViewMode` into `types.ts`.
- Logic leaking into components: project export is built in `src/components/SettingsPanel.tsx:42-51`, and the same project shape is built again in `src/lib/sync.ts:102-105`. **L/S:** add a single `projectOf(state)` in lib and use it in both places. `exportJson` also revokes the object URL right after `click()` (`SettingsPanel.tsx:50`), unlike `downloadBlob` (`export.ts:622-632`), which waits 30 s; use `downloadBlob`.

**types.ts (689 lines).** It is readable and well commented, but it is a flat bag of optional fields:
- `Opening` (`types.ts:166-205`) has 15 optional fields, each scoped by comment ("Windows:", "Doors:", "Front doors:", "Bays:"). A discriminated union on `kind` (door-like / window-like / bay / gap) would let the compiler stop, for example, `sidelight` on a window. **L, L:** worth doing only next time openings are reworked; the migration cost is real.
- `Floor` carries seven `stairs*` fields (`types.ts:340-353`), which also limits each floor to one flight. **L/M:** use `stairs?: { at, dir, len, width, turn, topTurn, topWinders }[]` with a migration.
- `Room` has 20+ cosmetic fields (`types.ts:7-50`). **L:** group them into `finish?: { floor…, walls… }`. `structure.ts:13,45` already keeps hand-written sets of "cosmetic" keys, which a nested object would make unnecessary.
- Coordinates are image pixels per floor (`Floor.pxPerM`, `origin`, `offset`). That is deliberate (tracing over the plan image) but couples the model to the image. It is fine as long as `geometry.ts` is the only converter.
- The `Site` and `Exterior` shapes are well done (`sites.ts` keeps plots beside the models so a plot edit doesn't rebuild the house; `store.ts:45-50`).

**Variants and sites.** `variants: {current?, proposed?}` plus `sites: {current?, proposed?: Site | null}` (Proposed borrows As listed's plot until edited) is a sound split. The "copy-on-write when Proposed edits" rule is in `updateSiteOf` and tested.

**Ids and references.**
- `uid()` (`types.ts:666`) is `Math.random().toString(36).slice(2,10)`: about 41 bits, sometimes shorter than 8 characters, and not crypto-strength. It is also the image key in persistence (`persist.ts:64`). `store.ts:376` hand-rolls a second copy. **L/S:** use `crypto.randomUUID().slice(0, 12)` in one helper.
- Photos are tied to rooms **by floor name plus room name** (`types.ts:638-649`), on purpose ("survives re-extraction"). The store has to rename photos on floor or room renames and avoid name clashes (`store.ts:318-323, 336-340, 353-363`). The rule only applies to the "photo source" variant (`store.ts:180`). It works and is tested, but it is the most fragile reference in the model: duplicate room names on a floor break it silently. **M/M:** store `roomId` beside the names and fall back to names only for imports.
- `Room.floorPhotoId` is left dangling when `removePhoto` runs (`store.ts:374`). It is harmless (`House.tsx:417` tolerates it) but should be tidied.
- `Room.wallFinishes` is keyed by polygon edge index; `featureWalls.ts:111-130` and `mergeRooms.ts:186` remap it correctly when corners change. Good.

**Built-in house.** `listing91770873.ts` (755 lines of hand-traced data-as-code, versions `LISTING_PRESET` 23, proposed 23, site 5, at `:82-85`) is **copied whole into the user's state** and then kept current through `startupPrompt.ts` (221), `layoutMerge.ts` (689), `siteMerge.ts`, `sitePreset.ts` and `presetActions.ts`. That is about 1,500 lines of update machinery driven by the copy-in design. It is well tested and done now, so I would not rewrite it. Two observations:
- `migrate.ts:155` imports the listing data, so the built-in house ships in the startup `store` chunk (59 kB).
- `latestListing()` caches a build with random uids (`presetActions.ts:72-80`), which is why change ids stay stable. That works but is subtle.

---

## 3. Store (`src/store.ts`)

**Undo design.**
- Full-object snapshots of `{variants, photos, sites, pieces}` (`store.ts:35-40, 188-201`), 60 deep (`:165`). Snapshots are taken by reference, and every update copies only the path it changes, so memory is cheap even with embedded images: data-URL strings are shared, not copied. Good choice.
  - Exception: `copyVariant` uses `structuredClone` (`:293`), which really duplicates the floorplan data URL in memory. That is small (about 70 kB).
- Coalescing works on wall-clock time (`COALESCE_MS` 700, `:167`) plus a module-level `held` flag (`:168-177`). Several actions *rely on* the coalescing to count as "one undo step":
  - `loadListing` makes two calls (`presetActions.ts:19,23`).
  - `applyListingReview` makes two (`presetActions.ts:128,131`).
  - `applyProject` makes four (`sync.ts:114-119`), and three of them use `useStore.setState`, which bypasses the undo wrapper entirely. Only `setVariant` records history.
  - If the user edited within 700 ms before, the action merges into that edit's step. **M/S:** add `transact(fn)` (push one snapshot, run the setters raw) and use it in these places.
- **Undo across a server load (M, S).** `loadServerCopy` → `applyProject` records an undo step (`sync.ts:116-117`). Pressing Ctrl+Z afterwards restores the pre-load project, `onChange` marks it dirty (`sync.ts:198-201, 216-223`), and 3 s later it is PUT with `baseRevision` = the server's latest revision. That **silently replaces the other device's work** with this browser's older state, with no conflict dialog because the revisions match. Fix: on `applyProject(…, true)` clear `past` and `future` (or record a barrier that undo will not cross).
- `reset()` (`store.ts:405`) clears `savedViews`, but `savedViews` is not part of the snapshot, so undo does not bring them back. The confirm text says "Undo can bring them back" (`SettingsPanel.tsx:91`). **L/S.**
- What isn't undoable (`settings`, `sun`, `costRates`, `savedViews`, UI) is documented in the types. Fine.

**`setUi` grab-bag** (`store.ts:136-159, 401-404`): 17 fields in one typed `Pick`. It is acceptable, and its one rule (a changed `selectedRoomId` clears `selectedEdge`) is in one place. Splitting it into a separate `useUi` store would remove UI churn from `persist.setItem`. Today `setItem` short-circuits unchanged saves (`persist.ts:129-134`), so this is **L**.

**Persisted vs transient.** `partialize` (`:411-428`) is explicit. Per-browser UI (`mode`, `tab`, `editFloorId`, `viewMode`, `planWalls`, `doorsOpen`, `planImage`) is persisted locally; sync sends only project data (`sync.ts:102-105`). `merge` (`:432-443`) validates the enum-like UI fields but **not** `variants`, `photos` or `sites`. A corrupt or old blob goes straight to the renderers (see the error-boundary finding below).

**PERSIST_VERSION and migrate.ts.**
- Version 6, with migrations for versions under 3, 4, 5 and 6 (`migrate.ts:228-250`), and tests for v4 → 5, v5 → 6, a "very old" save and the garage and roof fixes (`migrate.test.ts`).
- `version < 2 || version < 3` (`migrate.ts:230`) is just `< 3`.
- A save from a *newer* build (version > 6) passes through unchanged and is then rewritten as version 6. **L:** refuse or warn.
- Exports and server copies carry **no version**, so `parseProject` can only run the idempotent model, site and photo fixes (`syncLogic.ts:388-397`), not version-gated ones. **M/S:** add `{format: "storey-project", version: PERSIST_VERSION}` to exports and PUTs and route imports through `migratePersisted`.

**Hydration order.** It is correct: App waits for `onFinishHydration` before `startSync()` and the startup prompt (`App.tsx:55-72`). There is no race between local hydration and the server load.
- **H/S: if hydration rejects** (IndexedDB unavailable in some private modes, a `JSON.parse` throw on a corrupt blob in `persist.ts:47`, or a migration throwing), zustand never sets `hasHydrated` (`node_modules/zustand/esm/middleware.mjs:433-438` only calls `onRehydrateStorage`). No `onRehydrateStorage` is configured (`store.ts:408-444`), so **the app stays on "Opening your project" for good**.
- **H/S: there is no React error boundary anywhere** (no `componentDidCatch` in `src`). A throw in any panel, or in the 3D scene from a malformed imported or synced model, blanks the page. The bad state is already persisted, so the next reload blanks it again.
- Fix both with one recovery screen: show the error, offer "Download raw saved data" (read the IDB key directly) and "Start with an empty project".

**Selectors and re-render fan-out.** App subscribes to 15 fields (`App.tsx:38-54`), including the whole `variants` and `photos`, so every model edit re-renders App and the Viewer props. Callbacks are memoised (`:95-141`). This is the other reviewer's area for cost; architecturally I would move the 3D block into a `<ViewerHost>` that owns those selectors, so App is just layout. Only `CommandPalette` uses `useShallow`. **L/S.**

---

## 4. Persistence (`src/lib/persist.ts`)

Design: large data URLs (over 512 characters) are swapped for `@@img:<id>` references and stored once under their own keys (`persist.ts:15-48, 79-89`). The state JSON is written after its images, and stale images are GC'd afterwards (`:90-99`). Writes are debounced 400 ms with a 2 s cap (`:50, 136-138`) and flushed on `pagehide` and when the page is hidden (`:105-111`). Unchanged saves are skipped (`:131-133`). It is a clever, small design and the pure parts are tested (`persist.test.ts`).

Findings:
- **H/M: data loss across two tabs.**
  - Every tab writes the same `house-modeler` key with last-writer-wins, and nothing tells the other tab (no BroadcastChannel, `storage` event or Web Locks).
  - Worse, the GC deletes every image key not referenced by *this tab's* state (`:91-93`). The other tab's `written` cache (`:53, 87`) still believes those images exist, so it never rewrites them. Its next reload shows the 1×1 `MISSING_IMAGE` (`:21`).
  - Repro: tab B adds a photo; tab A (opened earlier) changes anything persisted, even the sun slider, since `sun` is persisted. Tab A's flush deletes B's photo blob.
  - Fix: take a Web Lock (`navigator.locks.request("storey-writer")`) and make other tabs read-only with a banner, or at least broadcast saves and re-hydrate. Also make the GC run only at startup, or only on ids this tab itself dereferenced.
- **H/S: failures are silent.** `flush` catches and `console.error`s (`:101`). A full quota (`QuotaExceededError`, likely with many phone photos), Safari's eviction, or a revoked IndexedDB leave the user thinking work is saved. Show a status (reuse the sync status line: "Couldn't save on this device") and retry.
- **M/S: no `navigator.storage.persist()`.** Without it, Safari can delete script-writable storage for a site that has not been used for 7 days (ITP), unless it is installed to the home screen. Chrome may evict under storage pressure. Call it once after the first save and show the result in Settings.
- **L:** `keys()` scans every key on every flush (`:91`). That is fine at this scale.
- **L:** the async flush on `pagehide` is best-effort; iOS can kill the page before IndexedDB commits. The 400 ms debounce bounds the loss.
- Images in the undo history stay referenced in memory but not on disk. Correct.
- **Corruption recovery:** none (see the hydration finding in section 3).
- **Export/import JSON:** a plain `{variants, photos, sites, costRates, pieces, savedViews}` (`SettingsPanel.tsx:44`) with no format tag or version (section 3). Import validation is shallow: `looksLikeModel` only checks `floors` is an array (`syncLogic.ts:372`). **M/M:** add a light runtime validator (a hand-written `isRoom` / `isFloor`, or valibot at about 1 kB) used by import, server load and hydration, which drops or repairs bad items rather than crashing.

---

## 5. Sync (`src/lib/sync.ts`, `syncLogic.ts`)

**Algorithm.**
- One server copy with an integer `revision` and `savedAt`.
- The client remembers `{revision, savedAt, dirty}` in localStorage (`sync.ts:24, 33-49, 73`).
- `decideSync` (`syncLogic.ts:296-303`) covers the four cases cleanly: none, load, upload or conflict. The server enforces `baseRevision === current` under a synchronous check-and-write (`project.mjs:211-221`).
- A 409 always becomes the user's choice (`sync.ts:171-178`).
- One `serial` queue (`:64-71`) avoids overlapping steps. Edits made during a PUT are caught by the `version` counter (`:153, 166-168`).
- 401 and 413 stop retrying (`:158-163`); otherwise there is a fixed 20 s retry (`:26, 126-130`), and resume is throttled to 10 s (`syncLogic.ts:306-316`).
- This is a sound, conservative design for one owner, and the pure decisions are well tested (`syncLogic.test.ts`).

Findings:
- **M/S: undo after a load overwrites the server** (section 3).
- **M/S: the first check always downloads the full project.** `since` is computed from `last` (`sync.ts:183`), but `last` is only read from localStorage *after* that first call (`:193-197`). So every page load GETs the whole project (photos included) just to read its revision. When the action is "load" it then GETs it **again** (`loadServerCopy`, `:133`). Fix: read memory before the first call, and pass `reply.json.data` to `applyProject` instead of re-fetching.
- **M/L: payload size.** Every save PUTs the entire project with base64 photos (`:156`). Built-in listing photos alone are 37 JPEGs at 3.7 MB, about 5 MB as base64, and both layouts embed the floorplan. An edit on an iPad on 4G uploads all of that 3 s after each pause.
  - Fix: mirror `persist.ts` on the wire. Add `PUT /api/images/<sha256>` (idempotent, content-addressed), and PUT a project JSON that only references images (`@@img:` already exists). The project JSON drops to tens of kB.
  - That also removes the 50 MB ceiling and the `tooLarge` dead end (`syncLogic.ts:361-362`).
- **L/S: two tabs.** Each tab syncs on its own and holds its own `last`, while both write one `house-modeler/sync` memory key (`sync.ts:73`). Tab A saving makes tab B's next save a 409 and the dialog appears. That is safe but confusing; the single-writer lock from section 4 fixes this too.
- **L: no backoff or jitter** on the 20 s retry. That is fine for one user.
- **L:** `conflict()` awaits the dialog *inside* the serial queue (`:173`). All sync work, including the retry timer's `check`, waits behind a dialog that might be left open on a backgrounded tab. That is acceptable, and `saving > 0` stops resume piling up (`:228`).
- **Offline:** edits stay local, `dirty` is remembered, and the reconnect goes through `check` → upload or conflict. Correct.
- **Partial failure:** the server write is atomic (tmp + rename), and the client only clears `dirty` on a 200 for the same `version`. Correct.
- `sync.ts:82` carries an `eslint-disable` comment, but there is no ESLint.

---

## 6. Server (`server/*.mjs`, `render.yaml`)

Strong points:
- The passcode is compared with `timingSafeEqual` over SHA-256 digests (`auth.mjs:15-18`).
- Tokens are HMAC-signed expiry values, with the key derived from secret and passcode, so changing either one logs everyone out (`auth.mjs:24-48`).
- The cookie is HttpOnly, SameSite=Lax and Secure behind HTTPS (`auth.mjs:67-72`).
- The open-redirect guard is strict (`auth.mjs:105-118`).
- Path traversal is blocked: any `..`, backslash or NUL is rejected before joining, and the root prefix is checked (`auth.mjs:79-98`).
- The API never falls through to static files (`server.mjs:381-390`), PUTs check Origin (`:195`), body limits apply both before and during reads (`:198-199`), and hashed assets are marked immutable while `index.html` is `no-cache` (`:286-289`).
- No secrets are logged, and the DATA_DIR warning is loud (`:64-68`).

Findings (defensive hardening for a small private deployment):
- **M/S: no server-side backups.** `save()` replaces `project.json` in place (`project.mjs:216-218`). "Keep mine and overwrite", a Reset that syncs an empty project (allowed: `syncLogic.ts:383-386`), or a client bug destroys the shared copy permanently. Keep the previous N files (`project.<rev>.json`, rotate about 20; the 1 GB disk has room) and add a read-only `GET /api/project/history`.
- **M/S: an unreadable `project.json` at start-up is ignored** (`project.mjs:192-199`). `meta` becomes null, so the first client gets a 404 → `upload` and overwrites it. Rename it to `project.corrupt-<ts>.json` first.
- **M/S: brute-force budget.** `MIN_PASSCODE_LENGTH = 4` (`auth.mjs:7`). At 60 global failures per hour (`server.mjs:74`), a 4-digit PIN falls in about 3–7 days of continuous guessing. The same global cap also lets anyone lock the owner out of *new* sign-ins for an hour (existing 30-day cookies still work). Raise the minimum to 10 (it is already the warning threshold, `server.mjs:45`), and consider exponential per-IP delays instead of the shared lockout.
- **M/M: memory per PUT.** `readBody` buffers up to 50 MB, then `toString` (another copy), `JSON.parse` (an object graph several times bigger), and a synchronous `JSON.stringify` and `writeFileSync` (`server.mjs:156-171, 199-208`; `project.mjs:217`). The peak is a few hundred MB, and the event loop blocks for hundreds of ms. Two concurrent saves could OOM a 512 MB starter instance. Options:
  - Stream the body to the tmp file and validate only the envelope, or reject a second concurrent PUT with 429.
  - The content-addressed images from section 5 remove the issue at the source.
- **L/S:** GET also reads the whole file synchronously (`project.mjs:205`, `server.mjs:191`), and JSON responses are not gzipped (`sendJson`, `:175-181`). Base64 only shrinks about 25% under gzip, so this matters less than image splitting.
- **L/S: no CSP or HSTS.** Suggested headers:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`. Verify the inline splash `<style>` and WebGL still work.
  - `Strict-Transport-Security: max-age=15552000` when `isSecure`.
  - Add them to `SECURITY_HEADERS` (`server.mjs:118-126`).
- **L/S:** logout is a GET (`server.mjs:375-378`), which allows logout CSRF, and it does not revoke the token (tokens are stateless; only rotating `SESSION_SECRET` or `PASSCODE` revokes). Make it POST. Optionally add a server "session epoch" stored in DATA_DIR so "sign out everywhere" exists.
- **L:** `isSecure` trusts `x-forwarded-proto` whatever `TRUSTED_PROXY_HOPS` says (`server.mjs:128-131`). That is harmless (it only adds `Secure`), but it is inconsistent.
- **L:** `server.close()` on SIGTERM (`:428-430`) waits for keep-alive sockets. Call `server.closeIdleConnections()` and set a hard timeout so Render deploys don't stall.
- **L:** `page.mjs:3` reads `../src/lib/wordmark.json` at runtime, so the server needs `src/` deployed. That is fine on Render, but brittle.
- **L:** `render.yaml:14` builds with `npm run build` only, so tests never gate a deploy of `main`. Use `npm ci … && npm run check && npm run build`.

---

## 7. Build and tooling

- **Vite 8 / rolldown config** (`vite.config.ts`): minimal and sensible. React has its own chunk (`:24-29`). The Viewer, WipeCompare, PlanEditor and SiteEditor are lazy (`App.tsx:31-35`), and capture, GLB export and the report document load on demand.
  - Measured build: the **initial JS** is `index` 212 kB + `react` 190 kB + `store` 59 kB + `sun` 50 kB + `report` 13 kB, about 525 kB minified (about 175 kB gzip).
  - The 3D view adds `capture` 512 kB (it holds r3f and drei, because rolldown names the shared chunk after its first importer), `three.core` 374 kB, `Effects` (postprocessing) 227 kB and `Viewer` 185 kB.
  - The chunk-size warning fires on `capture`. **L/S:** add groups for `three` and `@react-three` so cache-stable vendor chunks get honest names, and raise `chunkSizeWarningLimit` on purpose.
- **`__BUILD_DATE__`** (`vite.config.ts:19`) changes every day, so the entry chunk's hash changes daily even with no code change. That is a minor cache loss. **L:** use the commit date (`git log -1 --format=%cs`).
- **Hosted build** (`scripts/build-hosted.mjs`): it is **not single-file**. It writes a body fragment that links `assets/*` (80 files, 6.2 MB including 37 photos and fonts). The script is tiny and fine, but it parses Vite's `index.html` with regexes (`:15-20`). The splash SVG is copied three times (`index.html`, `build-hosted.mjs:34`, `page.mjs:303`), and brand colours are hard-coded in `page.mjs:18-19` and `build-hosted.mjs:29-32` despite the "colours from brand.ts" rule. **L/S:** generate them from `brand.ts`.
- **Fonts:** @fontsource CSS subsets are imported in `main.tsx:5-10`. Bricolage is also inlined as a 55 kB JS module for the report.
- **Typechecking gaps:** `tsconfig.json:19` includes only `src`, so `server/*.mjs`, `scripts/*.mjs` and `vite.config.ts` are never typechecked. **L/S:** add `tsconfig.node.json` with `allowJs`, `checkJs`, `types: ["node"]` and include `server`, `scripts` and `vite.config.ts`; run it in `check`.
- **No `engines` field.** Render pins Node 22 (`render.yaml:28`); add `"engines": {"node": ">=22"}`. The npm 10 "edgesOut" workaround appears in three places (`render.yaml:14`, the hook and CLAUDE.md). **L:** add `"packageManager": "npm@11.6.2"` and use Corepack.
- **The session hook** (`.claude/hooks/session-start.sh:4`) only checks that `node_modules` exists, not that it matches the lockfile. **L:** compare `node_modules/.package-lock.json` with `package-lock.json`.
- **Minimal lint, format and CI setup (M/S):**
  - `eslint.config.js`: `typescript-eslint` `recommendedTypeChecked` (or `strict`), `eslint-plugin-react-hooks` (`recommended-latest`; the `exhaustive-deps` rule alone will be worth it in the 2,075-line `PlanEditor`), and `eslint-plugin-react-refresh`. Ignore `dist*`.
  - Formatting: Prettier with `printWidth: 160` to match the current style (or Biome for lint and format in one fast binary). Run it once in a dedicated commit and add that commit to `.git-blame-ignore-revs`.
  - `.github/workflows/ci.yml`: Node 22, `npm ci`, `npm run check`, `npm run build`, `npm run build:hosted`, then a Playwright smoke job. That job uses `scripts/screenshots.mjs` against `vite preview` with the swiftshader flags from CLAUDE.md, loads the listing, switches to the Plan tab, and asserts no console errors.
  - Add Dependabot (or Renovate) weekly, grouped.

---

## 8. Tests

- **Quality:** good. The lib tests are behavioural and named as sentences ("moves the shared plot of a version 4 save onto both layouts"), with no snapshots (0 `toMatchSnapshot`). Server helpers have real tests (`auth.test.mjs` 177 lines, `project.test.mjs` 74). The store tests (`storeKnock`, `storeModes`, `storePieces`, `storeStudio`, `lib/storeSites`) cover actions, and fake timers are used for persistence (`persist.test.ts:36-70`).
- **Flaky risks:** low. A few tests mock `Date.now` (`storeSites.test.ts:47`). Undo coalescing depends on wall-clock time, so a store test that does two edits and expects two undo steps could flake on a slow CI box. Use `vi.useFakeTimers()` in store tests.
- **Gaps that matter:**
  1. **`sync.ts` orchestration**: none. It is all module-level `let` state (`sync.ts:52-64`). Refactor it into `createSync({fetch, store, storage, choose, timers})` and test it against an in-memory fake server. The cases: startup load vs dirty local, a 409 → each choice, edits during a PUT, 413, 401, offline → retry, and the undo-after-load case. **M/M.**
  2. **`imageAwareStorage` round-trip and GC**, with `fake-indexeddb`, including the two-instances case from section 4. **M/S.**
  3. **Hydration and merge**: rehydrating a v1…v5 fixture through the real store (`persist` + `merge`), and a corrupt blob. Currently `migratePersisted` is tested alone. **S.**
  4. **The HTTP server**: `server.mjs` starts listening and calls `process.exit` at import (`:32-38, 424`). Export `createServer(config)` and test the routes with `fetch`: login → cookie → PUT/GET, 409, 413, traversal, `/api` without a cookie, static caching headers. **M/S.**
  5. **Hosted build output**: a test that `house-modeler.html` references only files that exist in `dist-hosted/assets`. **S.**
  6. Untested lib files: `sync.ts`, `presetActions.ts`, `clipboard.ts`, `image.ts`, `fileNames.ts`, `shortcuts.ts`. Only the first two matter.
- **Components, editors, three and hooks have no tests.** This matters for `ModePanel`, `SettingsPanel` import/export, `Dialogs` (which `sync.ts` depends on) and the startup dialog. A cheap layer: a vitest `projects` entry with `environment: "jsdom"` for `src/components/**/*.test.tsx`, using `@testing-library/react`, for about 5 panel tests that render with a seeded store. Leave the 3D and editors to the Playwright smoke test.

---

## 9. Security and privacy

- **Privacy grep:**
  - UK-postcode regex over `src`, `reference`, `public`, `server`, `docs`, `scripts`, README and `index.html`: one hit, `F4F1EA` in `paintPalette.test.ts:23`, a hex colour (false positive).
  - Street-suffix grep (Road / Street / Avenue / Lane / Close / Drive / Crescent / Gardens / Way / Grove after a capitalised word): no hits.
  - No title number or owner names found. Git authors are all `Claude <noreply@anthropic.com>`.
- **Coordinates:** the built-in plot carries latitude and longitude to two decimal places (`listing91770873.ts:601-602`; default `site.ts:287-288`), about 1 km, city-level. Acceptable; keep it at two decimals.
- **De-anonymisation note (L, informational):**
  - `listing91770873.ts:5` and `:508` name the property portal alongside the listing id, and the placeholder image draws that text.
  - The listing id plus portal *is* a lookup key for the public listing, and through it the address.
  - The rule allows the id, but the owner should know that "listing 91770873" alone is not anonymous to anyone who can guess the portal.
  - Consider dropping the portal name and the floorplan provider's name from code and comments.
- **Photo metadata:** all 37 bundled JPEGs (`src/assets/listing-91770873/photos/`, 32–182 kB, 3.7 MB in total) and `floorplan.webp` (53 kB) carry **no EXIF, GPS or XMP**. I checked with ImageMagick (`identify -verbose` and `%[EXIF:*]`) and a byte scan; one "GPS" byte match in `galley-2.jpg` is compressed-data noise.
  - User-uploaded photos are re-encoded through canvas only where `resizeDataUrl` is used (`image.ts:22-33`), which strips EXIF. **L/S:** check that *every* upload path goes through it, or GPS from phone photos goes into IndexedDB and the server copy.
- **XSS:** no `dangerouslySetInnerHTML`, `innerHTML` or `eval` in `src`. The print report is built as a string and written into a same-origin `about:blank` window (`ReportPanel.tsx:379, 415`). I checked every interpolation in `printHtml` and `planSvg`: user text goes through `esc()` (`export.ts:31`; 18 call sites including room names, notes, floor names, view names and captions), and colours in the SVG are constants. `esc` doesn't escape `'`, but all attributes are double-quoted. CSV cells are protected against formula injection (`export.ts:440`). The login page escapes `next` and the error text (`page.mjs:9-16, 42, 60`). **Clean.** A CSP (section 6) would be defence in depth for an imported or synced malicious project.
- **Secrets:** none in the repo. `render.yaml` uses `sync: false` / `generateValue`. A retired Anthropic API key is scrubbed from old saves (`persist.ts:148-153`, migration v4).
- **CSRF:** PUT checks Origin (`project.mjs:47-54`); login uses a form POST with SameSite=Lax. Fine.

---

## 10. Dependencies

- **`npm audit --omit=dev`: 0 vulnerabilities.** The full audit reports 4, all dev-only: `vite` 8.2.0–8.2.2 (launch-editor advisories, high), `source-map-js` (high, DoS), and `@vitest/mocker` (moderate). Fix: `npm audit fix`, which takes vite to 8.3.5 and vitest to 4.1.12. **L/S.**
- **Outdated, same major:** drei 10.7.9, fiber 9.8.2, postprocessing 3.2.2, react 19.3.1, zustand 5.0.16, vite 8.3.5. **Majors available:** @vitejs/plugin-react 6, vitest 5, TypeScript 7 (the Go compiler), three 0.186. Take the minors now. Hold TS 7 and vitest 5 for a dedicated PR.
- **Weight:** drei is used for only `OrbitControls`, `Html`, `Billboard` and `Image` (4 imports). It tree-shakes, but it still pulls `three-stdlib` pieces into `capture`. Not worth replacing today. Postprocessing (`EffectComposer`, `N8AO`, `ToneMapping`) is 227 kB, already lazy and only for "high" quality. Fine.
- **idb-keyval** is enough for a single key-value store. If you add multi-tab locking and an images store with metadata (hash, size, last used), a 30-line raw IndexedDB wrapper or `idb` would give transactions. Not urgent.
- Caret ranges are used throughout, with a committed lockfile. Fine for an app; Dependabot would keep it honest.

---

## 11. Code health

- **TODO / FIXME / HACK: 0** in `src`, `server` and `scripts`. Comment quality is high and consistently explains intent. The user-facing text is UK English ("colour", "neighbour", "metres"); identifiers use `color` (DOM/three convention). Consistent enough.
- **Large files** (over 600 lines):
  - `PlanEditor.tsx` 2,075 (CLAUDE.md's code map says "about 1,400": stale)
  - `textures.ts` 1,704
  - `roof.ts` 1,416
  - `planning.ts` 1,294
  - `openings.ts` 1,040
  - `Inspectors.tsx` 1,025
  - `SiteEditor.tsx` 957
  - `Fixtures.tsx` 799
  - `listing91770873.ts` 755
  - `roofParts.ts` 740
  - `Site.tsx` 723
  - `layoutMerge.ts` 689
  - `types.ts` 689
  - `House.tsx` 661
  - `planMath.ts` 655
  - `report.ts` 645
  - `export.ts` 632
- **Split candidates in my half:**
  - `planning.ts`: `planningCheck` is one roughly 575-line function (`planning.ts:362-939`), followed by well-separated sections for Class D, Class F, Part 2 Class A, the 45° guideline and party walls (`:940-1294`). Split it into `planning/{limits,classA,classB…,classD,classF,part2,guideline}.ts` with one `rules: Rule[]` array. **L/M.**
  - `types.ts`: split into `types/{model,site,photo,labels}.ts` and move the `*_LABEL` maps out of the type module. **L/S.**
  - `export.ts`: split `planSvg` from `printHtml` and CSV. **L/S.**
- **Duplication:**
  - The project shape is built twice (section 2).
  - `["current", "proposed"] as VariantKey[]` appears 10 times. Export a `VARIANTS` constant.
  - Two id generators (section 2).
  - The splash SVG and brand colours are copied three times (section 7).
  - Two download helpers (section 2).
- **Dead code:** a grep for exports with no importers outside their own file mostly finds test-only exports, which is fine. A couple are used only inside their own module but are still exported (`layoutMerge.ts` `isFitting`, `geometry.ts` `median`, `brand.ts` `BRAND_BG`), and `applyListingUpdates` is used only by tests (the app uses `applyChanges`). That is cosmetic; ESLint plus `knip` would track it. **L/S.**

---

## 12. Prioritised recommendations

| # | What | Why | Sev | Effort | Files |
|---|---|---|---|---|---|
| 1 | Error boundary around the app and the 3D view, plus `onRehydrateStorage` error handling, leading to a recovery screen ("Download saved data", "Start empty") | Today one bad model or failed hydration bricks the app on every reload | H | S | `src/App.tsx:55-58,148`, `src/store.ts:408`, new `components/Recovery.tsx` |
| 2 | Single-writer across tabs (Web Locks + BroadcastChannel), and make the image GC safe (startup-only, or only ids this tab dereferenced) | Two tabs overwrite each other and delete each other's photos | H | M | `src/lib/persist.ts:52-111` |
| 3 | Show local save failures and call `navigator.storage.persist()` | Quota errors and eviction are silent today | H | S | `src/lib/persist.ts:101`, Settings status |
| 4 | Clear undo history (or add a barrier) when a server copy is applied; add `transact()` and use it for `applyProject`, `loadListing` and `applyListingReview` | Undo after a load silently overwrites the other device's save; "one undo step" relies on 700 ms timing | M | S–M | `src/store.ts:188-201`, `src/lib/sync.ts:108-124`, `src/lib/presetActions.ts:14-26,123-133` |
| 5 | Keep the last ~20 server revisions; set aside a corrupt `project.json` instead of overwriting it | One wrong "Keep mine and overwrite" or Reset is unrecoverable on the server | M | S | `server/project.mjs:189-221` |
| 6 | CI (check, build, build:hosted, Playwright smoke), ESLint (typescript-eslint + react-hooks), Prettier/Biome, Dependabot; run `npm run check` in the Render build | No gate before `main` auto-deploys | M | S | `.github/workflows/ci.yml`, `eslint.config.js`, `render.yaml:14` |
| 7 | Read sync memory before the first GET, and reuse the GET's data instead of re-fetching | Every page load downloads the whole project, sometimes twice | M | S | `src/lib/sync.ts:133,181-207` |
| 8 | Content-addressed image upload for sync (`PUT /api/images/<sha>`, references in the project JSON) | Cuts each save from MBs to kB, removes the 50 MB ceiling and the server memory spikes | M | L | `src/lib/sync.ts`, `server/server.mjs`, `server/project.mjs`, reuse `persist.ts` dehydrate |
| 9 | Version and tag exports and PUTs (`format`, `version`); run imports through `migratePersisted`; add a light runtime validator | Old exports can't take version-gated migrations; malformed imports crash | M | S–M | `src/components/SettingsPanel.tsx:42-62`, `src/lib/syncLogic.ts:378-399`, `src/lib/migrate.ts` |
| 10 | Raise `MIN_PASSCODE_LENGTH` to 10; per-IP exponential delay instead of a global lockout; POST logout; CSP + HSTS headers | Hardening an internet-facing login | M | S | `server/auth.mjs:7`, `server/server.mjs:72-74,118-126,375` |
| 11 | Make sync testable (`createSync` with injected deps) and test it against a fake server; add `fake-indexeddb` persistence tests and HTTP route tests (`createServer` export) | The riskiest stateful code has no tests | M | M | `src/lib/sync.ts`, `src/lib/persist.ts`, `server/server.mjs` |
| 12 | Typecheck `server/`, `scripts/` and `vite.config.ts` (`tsconfig.node.json` with checkJs); add `engines` / `packageManager`; `npm audit fix` | Untyped server code; dev-tool advisories; npm 10 workaround in three places | L | S | `tsconfig.json`, `package.json` |
| 13 | Store `roomId` on photos beside the names; clear `floorPhotoId` on photo removal | Name-based links break on duplicate names | L | M | `src/types.ts:638-649`, `src/store.ts:318-374` |
| 14 | Split `planningCheck` into per-class rules; split `types.ts` and `export.ts`; update CLAUDE.md's PlanEditor size | Biggest single function in lib; stale code map | L | M | `src/lib/planning.ts:362-939`, `src/types.ts`, `CLAUDE.md` |
| 15 | Discriminated union for `Opening`; `stairs` object (array) on `Floor` (with a migration) | Compiler-checked kind-specific fields; multiple flights | L | L | `src/types.ts:166-205,340-353`, `src/lib/migrate.ts` |
