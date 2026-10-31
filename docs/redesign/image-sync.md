# Sync images by content hash

Status: proposal, not started. Written 31 Oct 2026. Source findings: PERF9; docs/review-2026-10.md §4 "Sync payloads", "Data loss paths" (no backups, unreadable file overwritten) and "Server hardening" (`project.json` has no backups), roadmap item 5 ("keep the last 20 revisions, set a corrupt file aside").

## Why (the problem, with numbers and evidence)

- `pushOnce()` PUTs `currentProject()` in full, image data URLs included (`src/lib/sync.ts:165`), `SAVE_DELAY_MS = 3000` after each change (`sync.ts:27`, `scheduleSave()` at :224). Same on every chassis; there is no metered-connection rule and no flush when the tab is hidden.
- The only images in a project today are `Floor.image` data URLs (`src/types.ts:483`). Photos were removed (commit 62df4b2; `parseProject()` now drops `photos`), so the review's "about 5 MB of listing photos" is stale. What is sent now:

| Measured at HEAD (scratch script, presets of listing 91770873, both layouts, both plots) | Bytes |
|---|---|
| Bundled `floorplan.webp` | 53,500 binary, 71,336 as base64 |
| Copies of it in one project (2 layouts x 2 floors, `presetActions.ts:18,41`) | 4 |
| PUT body today | **321 KB**, of which 285 KB (89 %) is the same image four times |
| PUT body with images as hash references | **36 KB** |
| Traced house with a 2 MB PNG floorplan (eras-tour allows `.png`, `_template/assets.ts:8`), est. | ~11 MB per edit |

- Browsers do not gzip request bodies, so all of that goes over the wire on every edit. On an iPhone on mobile data, 30 small edits in a session cost ~10 MB for listing 91770873 and ~330 MB for a PNG-traced house.
- Server: `readBody()` (`server/server.mjs:173`) buffers up to `MAX_PROJECT_BODY_BYTES = 50 MB` (`server/project.mjs:7`), then `JSON.parse` (`parsePutBody`) and `JSON.stringify` (`save`) run synchronously on the event loop. Two large saves at once can exhaust the 512 MB starter instance.
- Data loss: `createProjectStore().save()` replaces the one file (`project.mjs:40-50`); no history. An unreadable `project.json` is logged ("Ignoring unreadable", `project.mjs:27`), treated as empty, and overwritten by the next upload. **Not built since the October review** (checked: no `revisions` or `backup` anywhere in `server/`).
- Already fine, keep: `?since=<revision>` skips the download when nothing changed (B11, built); the revision protocol never overwrites silently (`decideSync()`, `syncLogic.ts:40`); `persist.ts` stores each image once locally under `@@img:<uid>`.

## Goal and non-goals

Goals
- An edit uploads only the project JSON (~36 KB for listing 91770873), never image bytes it has sent before.
- Each distinct image is uploaded once per house, ever, and downloaded once per device.
- The server never buffers or parses more than a few MB in one request; images stream to disk.
- The server keeps the last 20 revisions of each house's project and never overwrites an unreadable file.
- Phones save less often and flush when the app goes to the background.
- Export JSON stays one self-contained file; Import JSON keeps working with every old file.
- The conflict rules stay exactly as conservative as today.

Non-goals
- Changing local storage (`persist.ts` keeps data URLs and its `@@img:` uids).
- A "restore earlier version" UI (see Out of scope).
- Image upload UI, thumbnails, resizing or recompression.
- Cross-house de-duplication.
- Merging edits from two devices.

## Decisions already made (by the owner; do not reopen)

- Phone (390x844) is for showing, walking, measuring and light Decorate and Furnish edits; Build, Electrics, Garden and Plot are view-only there. So phone saves are few and small, and phone data use matters more than phone save latency.
- The devices that matter are the iPhone and laptop/desktop (1440x900, 1920x1080). iPad must keep working.
- Full-bleed canvas, floating chrome, brand per docs/brand.md (every busy state is `<Loader>` beside a short label).
- Quick wins are being built now; this redesign is for later.
- Code as simple and fast as possible without losing features.

## Assumptions (including which quick wins have landed)

- All quick wins in this pass have landed, in particular:
  - `lib/chassis.ts` exports `isCompact` (shortest side < 600 px). This spec uses it for the phone save delay. Check its exact signature before building.
  - A GitHub Actions workflow runs `npm run check` and `npm run build` on every push.
  - The `Capture` popover, `NumberField`, the Inspectors split and the dead-code removal (including `lib/image.ts`) do not touch sync.
- None of the quick wins change `sync.ts`, `syncLogic.ts`, `persist.ts` or `server/`. If one has, rebase onto it; the protocol below does not change.
- Render: starter instance (512 MB), 1 GB disk at `/var/data` = `DATA_DIR` (`render.yaml`), HTTPS, so `crypto.subtle` is available in the browser.
- Images in a project are `data:` URLs longer than 512 chars (`isImageData`, `persist.ts:26`). Today that means floorplans and the placeholder PNG.
- One server instance (a disk-backed Render service cannot scale out), so the synchronous check-and-write in `save()` remains a valid lock.

## Design (what the user sees and does, per chassis: phone, desktop; iPad notes; every state: empty, selected, busy, error; before/after sketches in ASCII where they help)

Mostly invisible. Nothing new on the canvas. The only UI is the existing sync status line (`SyncStatus` in `SettingsPanel.tsx:101`, shown in the House menu).

Flow of one save, before and after:

```
BEFORE (every edit, 3 s later)
  browser ──PUT /api/project {baseRevision, data(+4 x 71 KB base64)}  321 KB──▶ server
                                                    ◀── 200 {revision} | 409 | 413

AFTER (first save of a new image)
  browser ──HEAD /api/images/<sha256>──────────────────────────────▶ 404
          ──PUT  /api/images/<sha256>  (53.5 KB raw webp, streamed)─▶ 201
          ──PUT  /api/project {baseRevision, format:2, data("@@sha256:<hex>" x4)} 36 KB ─▶ 200 | 409 | 422 {missing}
AFTER (every later edit)
  browser ──PUT  /api/project … 36 KB──────────────────────────────▶ 200 | 409
```

Payloads, listing 91770873:

| Event | Today | After |
|---|---|---|
| Any edit (desktop, 3 s later) | 321 KB up | 36 KB up |
| Any edit (phone, 10 s later, or on backgrounding) | 321 KB up | 36 KB up, about a third as many PUTs |
| First sync of a browser that holds the project | 321 KB up | 36 KB + 53.5 KB once + 1 HEAD |
| New device opens the shared copy | 321 KB down | 36 KB + 53.5 KB once |
| Reload, nothing changed | ~80 B (`since`) | ~80 B |
| Reload after another device edited | 321 KB down | 36 KB down, 0 image requests (image already local) |
| PNG-traced house, any edit (est.) | ~11 MB up | 36 KB up |

States of the status line (text in `statusText()`, `syncLogic.ts:92`):

| State | Desktop and phone text | Notes |
|---|---|---|
| Empty server, first save | `<Loader lift>` "Saving…" | as today; covers image upload too |
| Synced | "Synced with the server · saved 14:02" | as today |
| Busy, loading another device's copy | `<Loader lift>` "Fetching the shared copy…" | new kind `loading`; only shown while images download |
| Offline | "Couldn't reach the server, will retry" | as today; an image upload failure is the same state |
| Image too big (> 15 MB) | "A floorplan image is over 15 MB, too large to sync: use a smaller one, then Sync now" | replaces the 50 MB text |
| Server full (per-house quota) | "The server is full: tell whoever runs it, then Sync now" | new kind `serverFull` |
| Server copy missing an image | dialog (below) | new |

Missing-image dialog (via `choose()` in `components/Dialogs`, like the conflict dialog): "The shared copy refers to a floorplan image the server no longer has."
- This browser holds a project: **Keep mine and overwrite** / **Cancel**.
- This browser is empty (`isProjectEmpty()`, a new device): **Cancel** only, plus the line "Open it on the device that last saved it, then Sync now there." Never offer "Keep mine" here: it would overwrite the shared copy with an empty project.
- Cancel pauses as the conflict Cancel does. The project is never applied with a hole in it.

Unchanged by this spec, on every chassis: Walk, Compare, Measure and the canvas keep running while a save or image upload is in flight (it is all in the background); a server copy that loads still clears undo history (`clearHistory()` in `applyProject`), as today; undo to an earlier floorplan re-uploads it if the server has dropped it (422 path). Keyboard, touch and reduced motion: nothing new beyond `<Loader>` and `choose()`, which already handle them.

Phone
- Save delay 10 s instead of 3 s, and an immediate flush when the app is hidden (`visibilitychange` to hidden, `pagehide`). On iOS, `navigator.connection` does not exist, so the compact screen is the signal (portrait 390x844 and landscape 844x390 both count: `isCompact` uses the shortest side); where `navigator.connection.saveData` is true (Android, Chrome), the 10 s rule applies on any chassis.
- Most phone modes are view-only (owner decision 1), so only Decorate and Furnish edits, and Import JSON, ever schedule a save.
- No new chrome. The status line only appears in the House menu.

Desktop
- 3 s delay as today; flush on hide as well (cheap now).

iPad
- Same as desktop unless `isCompact` (it is not at 820x1180), so 3 s. Must keep working; nothing iPad-specific.

Export and Import
- Export JSON writes the store, which holds data URLs: unchanged and self-contained. A check guards that no `@@sha256:` ref ever appears in an export.
- Import JSON of an old file (inline images, `photos`, single `site`): unchanged.
- Import of a file that holds `@@sha256:` refs (someone downloaded a raw server copy): resolved from the server when sync is on, else "That file refers to images it does not contain." and nothing is applied.

## Technical design (files and functions, type and store changes, persisted-state migration, tests to add, performance and accessibility notes)

### Protocol (the contract every chunk builds to)

| Request | Body | Replies |
|---|---|---|
| `HEAD /api/images/<hex>` | none | 200 (exists; server touches its mtime), 404, 400 bad hex, 401 |
| `GET /api/images/<hex>` | none | 200 bytes, `Content-Type` from the stored extension, `Cache-Control: private, max-age=31536000, immutable`, `ETag: "<hex>"`; 404; 401 |
| `PUT /api/images/<hex>` | raw image bytes, `Content-Type: image/webp\|png\|jpeg\|avif\|gif` | 201 stored, 200 already there, 400 hash mismatch or bad hex, 403 bad origin, 413 over 15 MB, 415 other type (SVG refused: script risk), 507 house quota (200 MB) full, 401 |
| `GET /api/project[?since=n]` | sends `X-Storey-Sync: 2` | as today; stored data carries refs. Without the header (an old tab) the server inlines the images (compat, one release) |
| `PUT /api/project` | `{ baseRevision, format: 2, data }`, data with refs | 200, 409 (as today), 422 `{ missing: [hex] }` when a ref is not in the store, 413 over 8 MB, 400 |

- `<hex>` is the lower-case SHA-256 of the decoded image bytes, `/^[0-9a-f]{64}$/`.
- Ref string in project JSON: `"@@sha256:<hex>"`. Distinct from `@@img:` (local uids, `IMG_REF`, `persist.ts:17`) on purpose: the two never mix.
- A PUT body that still holds data URLs (old tab, or a browser without `crypto.subtle`, e.g. `npm start` reached over plain http on a LAN) is accepted: the server extracts the images itself (`extractImages`) before saving. So **the stored copy never holds inline images**, whatever sent it.
- Every `/api/` call from the new client sends `X-Storey-Sync: 2`.

### Server

New `server/images.mjs` (Node built-ins only, like the rest):
- `HEX`, `IMAGE_TYPES` (`{ "image/webp": ".webp", "image/png": ".png", "image/jpeg": ".jpg", "image/avif": ".avif", "image/gif": ".gif" }`), `MAX_IMAGE_BYTES = 15 MB`, `HOUSE_QUOTA_BYTES = 200 MB`, `GC_GRACE_MS = 24 h`.
- `createImageStore(dir)` for one house, `dir = DATA_DIR/images/<house>/` (house from the session, validated by `HOUSE_ID` in `auth.mjs:21`; never from the URL). Methods:
  - `find(hex)` → `{ file, type, size } | null`; `touch(hex)`.
  - `put(hex, type, stream)` → `Promise<"stored" | "exists" | "mismatch" | "tooLarge" | "quota">`. Streams to `<hex>.<pid>.tmp` through `crypto.createHash("sha256")`, counts bytes, compares, then `rename`. Never holds the body in memory.
  - `gc(roots: Set<string>, now)` → number deleted. Async (`fs.promises`). Deletes files not in `roots` whose mtime is older than `GC_GRACE_MS`; removes stray `.tmp` files older than an hour.
  - `usedBytes()` kept in memory (summed at start, updated on put and gc). With `PASSCODES` several houses share the 1 GB disk, so `put` also refuses (`quota`) when the sum over all houses would pass `DISK_QUOTA_BYTES = 800 MB`.
- Pure helpers with tests: `refHashes(text)` (regex `"@@sha256:([0-9a-f]{64})"`), `extractImages(data, store)` (walks the object, decodes base64 data URLs of allowed types, writes them, swaps in refs; other data URLs stay inline), `inlineImages(text, store)` (compat GET; string replace of refs by data URLs).

`server/project.mjs` changes (`createProjectStore`):
- Stored file gains `format: 2`: `{ revision, savedAt, format, data }`.
- Revisions: in `save()`, after writing the tmp file and before `renameSync(tmp, file)`, `fs.linkSync(file, revisions/<stem>/<old revision>.json)` (a hard link: atomic, no copy, and `project.json` is never absent; never rename the old file away, a crash between the two renames would leave no project file and the store would start empty). Prune to `KEEP_REVISIONS = 20` (newest kept; `*.v1.json` and `*.unreadable-*` are never pruned). `<stem>` = `projectFileName()` without `.json`, so the default house's `project.json` maps to `revisions/project/`.
- `saveId`: `save(baseRevision, data, now, saveId?)` stores an optional client `saveId` (`/^[A-Za-z0-9_-]{8,40}$/`) in the file and in `meta()`, so GET `?since`, full GET, 200 and 409 replies all carry it (they already spread `meta`). `parsePutBody` returns it. See "Lost replies" under Client.
- Unreadable file at start: rename it to `project.json.unreadable-<ISO time>` and log; start empty (today it is overwritten on the next save).
- `keptRefs()` → `Set<hex>` of refs in the current file and every kept revision (the GC roots). Read lazily, cached per revision.
- `rewrite(data)` → replaces the data without bumping revision or savedAt (used only by the migration).
- Existing test `survives a restart and leaves no temp files` asserts `readdirSync(dir)` is `["project.json"]`; it becomes `["project.json", "revisions"]` (chunk B updates it). `treats a corrupt file as nothing saved` still passes and gains an assertion that the bad file was set aside.
- `MAX_PROJECT_BODY_BYTES` → 8 MB for format 2 bodies. Legacy bodies (no `format`) keep the 50 MB limit for one release.

`server/server.mjs` changes:
- Route `/^\/api\/images\/([^/]+)$/` to new `handleImage(req, res, hex, house)`; keep the rule that `/api/` never falls through to static files.
- `handleProject()`: on PUT, `parsePutBody()`, then if any data URLs are present run `extractImages`; then check every ref in `refHashes(text)` exists, else 422 `{ missing }`; then `project.save()`. On GET without `x-storey-sync: 2`, run `inlineImages` on `readRaw()` (compat).
- After a successful save, schedule `gc()` for that house 10 minutes later (debounced); also run once at start, after migration.
- Startup migration: for each house, if the stored file has no `format`, copy it to `revisions/<stem>/<revision>.v1.json`, `extractImages`, `rewrite()` with `format: 2`. Same revision and savedAt, so no device sees a change and nobody is asked anything. If it throws, log and keep serving the v1 file (GET inlines nothing because there are no refs; the next PUT stores format 2).
- `server.requestTimeout` can drop from 180 s to 60 s once the compat window ends.

### Client

New `src/lib/syncImages.ts` (pure, with `syncImages.test.ts`):
- `SHA_REF = "@@sha256:"`.
- `imagesIn(value): Set<string>` — data URLs that `isImageData()` accepts and whose type is in the allowed list (export `isImageData` from `persist.ts`; no other change there).
- `decodeDataUrl(url): { type, bytes: Uint8Array } | null`.
- `sha256Hex(bytes, digest = crypto.subtle.digest)` (injectable for tests).
- `toRefs(value, hashOf: Map<string, string>): string` — JSON with each mapped data URL replaced by `SHA_REF + hex` (one `JSON.stringify` replacer, like `dehydrate()`).
- `refsIn(value): string[]`.
- `fromRefs(value, urlOf: (hex) => string | undefined): { value } | { missing: string[] }` — all or nothing; never substitutes `MISSING_IMAGE`.
- `saveDelayMs({ compact, saveData }): number` — 10,000 when either is true, else 3,000.

`src/lib/sync.ts` changes:
- Module state: `hashOf: Map<dataUrl, hex>`, `urlOf: Map<hex, dataUrl>`, `known: Set<hex>` (confirmed on the server this page life; seeded from refs in any server copy loaded). Drop entries not in the current project after each successful push, so replaced floorplans are not held.
- `ensureImages(project)`: hash new images (once each), then for each hex not in `known`, `HEAD`, and `PUT` the bytes on 404. Sequential, `SAVE_TIMEOUT_MS` each. 413 → `tooLarge`, 507 → `serverFull` (both pause, as 413 does today), anything else → `goOffline()`.
- If `crypto.subtle` is missing, skip `ensureImages` and send inline (the server extracts).
- `pushOnce(base)`: `await ensureImages()`, then PUT `{ baseRevision, format: 2, data }` with the body from `toRefs()`. On 422, drop `missing` from `known`, `ensureImages()` again, retry once; a second 422 → `goOffline()`. 409, 401, 200 exactly as today. **The revision rules are untouched**: images are idempotent and not revisioned, so they cannot conflict.
- `loadServerCopy(have?)`: set status `loading`; seed `urlOf` from images in the current store (hash them, so a reload downloads nothing); `GET /api/images/<hex>` for the rest, blob to data URL; `fromRefs()`; only then `applyProject(…, true)`. A 404 opens the missing-image dialog; other failures → `goOffline()` and nothing is applied.
- `call()` gains the `X-Storey-Sync: 2` header; add a small `callBytes(method, url, body?, type?)` for images. `callBytes` GETs use the default HTTP cache (not `cache: "no-store"` as `call()` does), so the `immutable` header works.
- `scheduleSave()` uses `saveDelayMs({ compact: isCompact(innerWidth, innerHeight), saveData: navigator.connection?.saveData === true })`, read at schedule time.
- Flush on hide: in `startSync()` (beside the existing `visibilitychange` listener, `sync.ts:253`), on `visibilitychange` to hidden and on `pagehide`, if `dirty`, not `paused` and `saving === 0`: `clearTimeout(saveTimer)` and run the normal `serial(() => push(...))`, with `pushOnce` passing `keepalive: true` to `fetch` when the body is under 60 KB (keepalive's limit is 64 KB) and no image is unknown. It goes through `serial` and `pushOnce` like any save, so the revision rules apply unchanged; if the page survives, the reply is handled as usual. Otherwise leave it to `resume()`, which already flushes first (`decideResume()`).
- Lost replies (new, needed because hide flushes make them routine on iPhone): each PUT carries a random `saveId`; before sending, `Memory` (localStorage `house-modeler/sync`) records `sent: { saveId, base }`; `onChange()` clears `sent` (something changed after that send). In `check()` and `conflict()`, if `sent` is set and the server's `saveId === sent.saveId`, the server holds exactly this browser's project: adopt its revision (`synced()`, `dirty = false`) instead of calling `decideSync()` / opening the dialog. Without this, a lost reply makes the next check show "changed on another device" for the user's own save. A pre-step only; `decideSync()` is unchanged.
- `importProject(data): Promise<boolean>` wraps `applyProject` for Import JSON: resolves refs when present (see Design).

`src/lib/syncLogic.ts`:
- `ProjectData` unchanged (the store shape). `SyncStatus` gains `{ kind: "loading" }` and `{ kind: "serverFull" }`; `statusText()` texts as in Design; `tooLarge` text changes.
- New `missingImageMessage` and `MISSING_IMAGE_CHOICES` beside `CONFLICT_CHOICES`.
- `decideSync()`, `decideResume()`, `conflictAction()`: **no change**. Their tests must pass unedited.
- New pure `ownSave(sent, server): boolean` (the lost-reply pre-step above), with tests.

`src/components/SettingsPanel.tsx`: `importJson` calls `importProject`; `SyncStatus` shows `<Loader kind="lift">` for `loading` as it does for `saving`.

### Persisted state and migration

| Where | Change | Migration |
|---|---|---|
| IndexedDB project (persist.ts) | none | none |
| `house-modeler/sync` memory (localStorage, per house via `houseKey`) | gains optional `sent: { saveId, base }` | none: old memory has no `sent`, which means "no pending send" |
| Server `project*.json` | `format: 2`, refs, optional `saveId` | at startup, same revision; v1 copy kept as `<revision>.v1.json` |
| Server new dirs | `DATA_DIR/images/<house>/`, `DATA_DIR/revisions/<stem>/` | created on demand |
| Old tabs still open | GET without header gets inline images; PUT with inline images is extracted | compat for one release, then delete `inlineImages` and the 50 MB legacy limit (dated TODO in `server.mjs`) |

### Tests to add

- `src/lib/syncImages.test.ts`: four copies of one image give one hash; refs round-trip; `fromRefs` reports every missing hex and returns no partial value; short strings and non-image data URLs stay inline; SVG stays inline; `@@img:` strings are left alone; `saveDelayMs` table.
- `src/lib/syncLogic.test.ts`: the new status texts; `ownSave` (match, mismatch, no `sent`, server without `saveId`). Existing `decideSync` and `decideResume` cases unchanged.
- `server/images.test.mjs`: put then find; hash mismatch leaves no file; 15 MB limit stops mid-stream and leaves no file; quota; SVG refused; gc keeps roots and anything newer than the grace time, deletes the rest; `extractImages` and `inlineImages` round-trip; a house's store cannot see another house's file.
- `server/project.test.mjs`: 25 saves keep revisions 5–24 plus the current one; an unreadable file is set aside, not overwritten; `rewrite()` keeps revision and savedAt; `keptRefs()` covers kept revisions; `parsePutBody` accepts `format: 2` and `saveId`; a crash simulated between link and rename leaves `project.json` readable; `.v1.json` is never pruned.

### Performance

- Server: no request body over 8 MB is buffered (images stream); `JSON.parse` of ~36 KB per save; GC is async and runs at most every 10 minutes; image GETs stream with `fs.createReadStream` and are not gzipped (already compressed).
- Client: one SHA-256 per distinct image per page life (53.5 KB: well under 1 ms; 2 MB PNG: a few ms); one `JSON.stringify` per save, as today.
- Disk: 20 revisions x 36 KB = 0.7 MB per house, plus each distinct image once.

### Accessibility

- The status line stays `role="status"`, so "Fetching the shared copy…" and the new errors are announced. The missing-image dialog uses `choose()`, which already has the Modal focus handling.

## Build plan (chunks for parallel Sonnet builders in separate worktrees: for each chunk the files it owns, the files it must stay out of, the steps, and how to verify; note the order and dependencies)

A, B and C can run in parallel: they build to the Protocol table above. D runs after A, B and C are merged.

**Chunk A — server image store and routes** (Sonnet, medium)
- Owns: `server/images.mjs` (new), `server/images.test.mjs` (new), `server/server.mjs`.
- Stay out of: `server/project.mjs` and its test (chunk B), everything in `src/`.
- Steps: 1) `images.mjs` with `createImageStore`, `refHashes`, `extractImages`, `inlineImages`, tests first. 2) `handleImage()` in `server.mjs` with HEAD, GET, PUT and the Origin check (`originMatchesHost`). 3) `handleProject()`: extract, 422 on missing refs, compat inline on GET. 4) GC scheduling and the startup migration, calling B's `rewrite()` and `keptRefs()` (stub them until B merges: same names and signatures as above).
- Verify: `npm run check`; `npm run build && PASSCODE=testtest1234 DATA_DIR=$(mktemp -d) PORT=10101 npm start`, then curl: sign in, `PUT` an image with a wrong hash (400), a right one (201, then 200), `HEAD` (200), a project PUT with an unknown ref (422).

**Chunk B — project revisions and safe start** (Sonnet, medium)
- Owns: `server/project.mjs`, `server/project.test.mjs`.
- Stay out of: `server/server.mjs`, `server/images.mjs`, `src/`.
- Steps: `format` field; `saveId` in the file, `meta()` and `parsePutBody`; revisions by hard link and prune to 20; unreadable file set aside; `rewrite(data)`; `keptRefs()`; body limits (8 MB format 2, 50 MB legacy) exported as two constants; update the `readdirSync` assertion in the existing restart test.
- Verify: `npm run check` (the server tests run under vitest, `vite.config.ts:92`).

**Chunk C — client** (Sonnet, medium)
- Owns: `src/lib/syncImages.ts` (new) and its test, `src/lib/sync.ts`, `src/lib/syncLogic.ts` and its test, `src/components/SettingsPanel.tsx`, and the one-word export of `isImageData` in `src/lib/persist.ts`.
- Stay out of: `server/`, `src/store.ts`, everything else in `persist.ts`.
- Steps: 1) `syncImages.ts` with tests. 2) Status kinds and texts; `ownSave`. 3) `ensureImages`, `pushOnce` (sends `saveId`, records `sent`), the 422 retry. 4) `loadServerCopy` all-or-nothing and the missing-image dialog (Cancel only when empty). 5) `saveDelayMs` and the hide flush through `serial` with `keepalive`. 6) The lost-reply pre-step in `check()` and `conflict()`. 7) `importProject`.
- Verify: `npm run check`; `npm run build`; existing `decideSync` and `decideResume` tests unchanged and passing.

**Chunk D — end-to-end check and docs** (Sonnet, medium; after A, B, C)
- Owns: `scripts/test-sync.cjs` (new), `package.json` (one script, `test:sync`), README sync section (lines 39–44, which still say "Settings → Project"; it is the House menu now) and "Hosting on Render".
- Stay out of: all `src/` and `server/` code (report bugs back; do not fix them here).
- Steps: write the Playwright script (see Acceptance checks); document the image store, revisions, the 15 MB and 200 MB limits, and how to restore a revision by hand (copy `revisions/<stem>/<n>.json` over the project file and restart).
- Verify: `npm run build && npm run test:sync` passes twice in a row.

Merge order: B, then A (drop its stubs), then C, then D. Each merge runs `npm run check` and `npm run build`.

## Acceptance checks (runnable: npm run check and build, which Playwright scripts or new checks, which screenshots at which sizes, and measurable targets)

- `npm run check` and `npm run build` pass; CI green.
- New `scripts/test-sync.cjs` (Playwright from /opt/node22/lib/node_modules, Chromium with the usual swiftshader flags). Sync is off under `npm run dev` (`startSync()` returns early on `import.meta.env.DEV`), so it needs `dist/` from `npm run build` and fails with a clear message without it. It builds nothing itself; it starts `node server/server.mjs` on a free port with `PASSCODE`, a temp `DATA_DIR`, and a seed `project.json` in format 1 (inline images, from an Export of the listing 91770873 presets), then:
  1. Startup migrates: the file has `format: 2`, the same revision, no `data:image` in it, one file in `images/listing-91770873/`, and `revisions/project/<n>.v1.json` exists.
  2. Desktop context 1440x900, signed in: page loads the shared copy; the floor image in the plan is the real floorplan (natural width 2000, not 1x1).
  3. Edits through Import JSON (the House menu's file input, with an exported file changed in Node): every `PUT /api/project` body ≤ 45 KB; 0 image requests after the first save.
  4. Import a file with a new floorplan: exactly one `HEAD` and one `PUT /api/images/…`; next edit sends no image request.
  5. Phone context 390x844 (touch, mobile UA): after an edit, no PUT within 8 s; one PUT by 12 s. Hiding the page (`page.evaluate` dispatching `visibilitychange` with `document.visibilityState` stubbed) sends it at once.
  6. Second desktop context, fresh storage: total `/api/` bytes received on first load ≤ 100 KB; a reload receives no image bytes.
  7. Conflict: contexts X and Y both edit; the second save shows "This project was changed on another device"; **Load that version** applies X's project with its image intact.
  8. 25 edits leave 20 files plus the v1 copy in `revisions/project/`.
  9. Export JSON from any context contains `data:image/webp` and no `@@sha256:`.
  10. An old-format PUT (inline images, no header) is accepted and stored with refs.
  11. Lost reply: route one `PUT /api/project` so the server saves but the browser sees a network error (`route.fetch()` then `route.abort()`); after "Sync now" the status is "Synced", with no conflict dialog.
  12. Missing image on a fresh context: delete the file under `images/`, open a fresh 1440x900 context: the dialog offers only Cancel; nothing is applied; the server file is unchanged.
  13. Phone landscape 844x390: same 10 s delay as step 5.
- `server/*.test.mjs`: GC deletes an unreferenced image older than 24 h and keeps one referenced only by revision 3.
- Screenshots: `scripts/shoot-chassis.cjs` runs against the dev server, where sync is off, so it cannot show the status line. `test-sync.cjs` saves its own shots to the scratchpad: House menu at 390x844 and 1440x900 in "Synced" and in the `loading` state (images held back with `page.route`), and the missing-image dialog at both sizes. Check by eye that the `<Loader>` sits beside the label.
- Targets: per-edit upload for listing 91770873 from 321 KB to ≤ 45 KB (−86 % or better); zero repeated image bytes; phone PUTs at least 3x fewer in a burst of edits.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| GC deletes an image a client is about to reference (undo to an old floorplan) | 24 h grace on mtime; HEAD touches the file; a project PUT with a missing ref gets 422 and the client re-uploads. |
| A server copy refers to an image that is gone (manual deletion, disk fault) | Load is all or nothing; missing-image dialog; revisions keep earlier copies; images are roots while any kept revision refers to them. |
| Old tabs (cached build) during rollout | Server inlines on GET without the header, extracts on PUT; removed after one release. |
| `crypto.subtle` missing (plain-http LAN testing) | Client sends inline; server extracts. Same result, bigger upload. |
| Migration bug corrupts the only copy | v1 copy written before rewrite; on error keep serving v1; the end-to-end check runs the migration. |
| Disk fills (1 GB) | 200 MB per-house and 800 MB total quota with a clear status; revisions capped at 20; stray tmp files swept. |
| Lost reply (iOS suspends the page mid-save) shows the user a conflict with their own save | `saveId` echo: the client recognises its own save and adopts the revision (`ownSave`). |
| A new device's "Keep mine" wipes the shared copy after a missing image | Empty devices get Cancel only in the missing-image dialog. |
| Hash cache holds old multi-MB strings | Entries not in the current project are dropped after each push. |
| keepalive request lost when iOS kills the page | `resume()` already flushes unsaved changes first on return (`decideResume`); `dirty` is remembered in localStorage. |
| Two images with the same bytes but different types | Hash is over bytes; first type stored wins; browsers sniff image types anyway. Harmless. |

## Open questions for the owner (each with options and a recommendation; only real decisions, not things the code can answer)

1. **How much of this to build, now that photos are gone (321 KB per edit, not 5 MB)?**
   - A) All of it (this spec).
   - B) Only revisions, the safe start and the phone save delay (chunk B plus step 5 of chunk C); images stay inline. About a third of the effort; still 321 KB per edit.
   - C) Instead of a server image store, refer to the house's bundled floorplan by name (e.g. `house:floorplan`) and resolve it from the app build. Smallest change, but only works for bundled images and makes Export depend on the build.
   - Recommendation: **A**. B leaves PNG-traced houses at ~11 MB per edit; C is a dead end the moment an image is not bundled.
2. **How many revisions to keep?** 10 / **20** / 50, or by time (a week). Recommendation: **20** (0.7 MB per house; covers a busy afternoon of saves). A restore UI stays out of scope; restoring is a documented manual step.
3. **Phone save delay.** 3 s (as now) / **10 s plus save on backgrounding** / 30 s. Recommendation: **10 s**; with images out, each save is small, and backgrounding flushes anyway.

## Out of scope

- A "Version history" panel or restore button (needs `GET /api/project/revisions`; later spec).
- Serving images to `<img>` by URL instead of holding data URLs in the store and IndexedDB (would cut memory, but breaks offline and Export).
- Gzipped request bodies (`CompressionStream`): 36 KB to about 6 KB; revisit only if phone data is still a concern.
- Changing `persist.ts` to hash ids locally.
- Cross-house de-duplication, CDN, or object storage.
- Removing the compat paths (a one-line follow-up after a release).
- Other server hardening from review-2026-10 (passcode length, CSP, HSTS, POST logout).

## Effort (S/M/L per chunk and in total)

| Chunk | Effort |
|---|---|
| A server image store and routes | M |
| B revisions and safe start | S |
| C client | M |
| D end-to-end check and docs | S |
| **Total** | **M–L (about 3–4 builder-days)** |
