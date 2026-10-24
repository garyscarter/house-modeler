# Storey (house modeler)

Browser-only React + react-three-fiber + zustand app for one house the owner is buying ("listing 91770873") and its renovation. See README.md for what it does and reference/listing-91770873/NOTES.md for the facts behind the built-in model.

## Standing rules

- **Delegate only when it pays.** Make small or single-file changes yourself. Use subagents when a job splits into two or more independent pieces, or one piece is large; run those in parallel, each in its own git worktree, and merge, check and push the results yourself.
- **Name every subagent after a famous pop star** (Madonna, Beyoncé, Adele, Prince, Kylie, Dua Lipa, ...), and use the name in the agent's description and in its prompt. Pick names that suit the job.
- **Opus thinks, Sonnet types.** Sonnet with medium effort is the default for subagents: well-specified changes, refactors, wiring, data edits. Use Opus (medium effort; high only for hard geometry, roofs or photo matching) to plan or review: it reads the code and returns a tight spec (files, functions, type changes, acceptance checks) for a Sonnet subagent to implement, or it reviews a diff. Let Opus write code itself only when the work can't be specified up front. Use Haiku with low effort for lookups and mechanical edits.
- When launching subagents, tell the user in one short table: name, job, model and effort, and a light-hearted "why this name". When reporting, give one line per subagent; don't repeat the table.
- **End every task by republishing the hosted version, fire and forget.** After merging and pushing, run `npm run build:hosted` and publish `dist-hosted/house-modeler.html` with the Artifact tool to the same URL, https://claude.ai/artifact/T9t6mnk6DjA4vGxw25pvTg (pass it as `url` from a new session, with `root: "dist-hosted"` and every file under `assets/` in `files`, mapping files that no longer exist to null). Do not open, screenshot or verify the published page, and do not re-check the result; if the build or publish errors, say so in one line and move on. Then give the user the link.
- Give each subagent a self-contained prompt: the goal, the files it owns, the files other agents are touching (to stay out of), how to verify, and the commit trailer to use. Point it at the code map below rather than letting it explore.
- Read the part of a large file you need (search first, then read a range), not the whole file.

## Working on it

- A SessionStart hook (`.claude/hooks/session-start.sh`) runs `npm ci` when node_modules is missing. By hand: `npm ci`; if npm 10 fails with an "edgesOut" error, use `npx -y npm@11.6.2 ci` (or `install`). In a worktree, symlink the main checkout's node_modules instead of reinstalling, unless package-lock.json differs.
- `npm run check` (typecheck plus vitest) and `npm run build` must pass before pushing.
- Check UI changes in headless Chromium with Playwright from /opt/node22/lib/node_modules, launched with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. In dev builds the store is on `window.__houseStore`.
- Pure logic goes in src/lib with tests; world frame: x right, world z = plan y (+z is the front of the house).
- Brand: the app is Storey. Follow docs/brand.md: the mark and colours come from `src/lib/brand.ts` and `BrandMark`, CSS tokens only, and every wait or busy state uses `<Loader>` (blueprint, lift or fill) beside a short label, never bare "Loading…".
- Privacy: never put the property's address, postcode, title number or any owner's name in the repo; refer to it as "listing 91770873".

## Code map

- `src/types.ts` model types; `src/store.ts` zustand store (undo/redo, persisted via `lib/persist.ts`); `src/App.tsx` layout and panels.
- `src/lib/` pure logic, each file with a `.test.ts`:
  - plan and walls: `geometry.ts` (plan to world, wall thickness), `planWalls.ts`, `walls.ts` (3D wall faces), `wallSteps.ts`, `featureWalls.ts`, `mergeRooms.ts` (knock-through), `planMath.ts` (editor maths, in pixels)
  - openings, stairs, fixtures: `openings.ts`, `bifold.ts`, `boundaryOpening.ts`, `stairs.ts`, `stairwell.ts`, `catalogue.ts`
  - roofs: `roof.ts` (planning), `roofParts.ts` (meshes, gutters, joins), `canopy.ts`
  - plot and sun: `site.ts`, `sites.ts` (per-variant plots), `siteDiff.ts`, `siteMerge.ts`, `sitePreset.ts`, `sun.ts`
  - outputs: `report.ts` (areas, changes, costs), `export.ts`, `planning.ts` (permitted-development check)
  - built-in house: `houses/listing91770873.ts` (+ `listingAssets.ts`), loaded by `presetActions.ts`; updates flow into an edited copy via `layoutMerge.ts` and `startupPrompt.ts`
  - shared project sync with the server: `sync.ts`, `syncLogic.ts`; `migrate.ts` for old saves
- `src/three/` 3D view: `Viewer.tsx`, `House.tsx`, `shell.ts` (wall and slab meshes), `Roof.tsx`, `Fixtures.tsx`, `Site.tsx`, `Lighting.tsx`, `textures.ts` (procedural finishes)
- `src/editor/` 2D plan: `PlanEditor.tsx` (about 2,100 lines; search before reading), `Inspectors.tsx`, `SiteEditor.tsx`, symbols
- `src/components/` side panels and dialogs; `server/` passcode-protected Node server; `scripts/build-hosted.mjs` the hosted single-file build
