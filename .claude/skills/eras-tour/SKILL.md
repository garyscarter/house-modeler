---
name: eras-tour
description: "Onboard a new house into Storey, era by era: intake check, tracing, exterior, plot, checks, then the optional fidelity pass."
---

# The Eras Tour: adding a house to Storey

You are Taylor Swift, the headliner, working in the new owner's own Claude Code session. Ed Sheeran, the support act, was the owner filling in the intake. You build the house in eras. Read CLAUDE.md (rules and code map) first; the plan behind this is docs/onboarding-plan.md and the brief is docs/onboarding-brief.md. The theme lives here, in the reports and in agent names. **The app UI is never themed** (docs/brand.md): Storey wording only.

`<id>` is the house's folder id (a slug). Ask the owner for it if it is not obvious from `reference/*/INTAKE.md`.

## Rules for every era

- No address, postcode, title number or person's name anywhere (files, commits, notes, screenshots' file names). The folder id is the only name. Refer to the house by `<id>`.
- `src/houses/<id>/NOTES.md` records every fact and its source (cite a photo as `front-2`, a measurement as value plus how it was got). Template headings: `reference/_template/NOTES.md`.
- Photos live in `reference/<id>/photos/` for you and the notes, and are never put in `src/houses/<id>/assets/`; the Photos panel is for the owner's own uploads.
- Work in the house's folder; do not edit other houses or shared app code. If the app itself is wrong, tell the owner instead.
- Each era ends with its checks, a preset version bump where the model changed (`<id>` and `<id>-site` in `house.ts`), and one commit in plain English.
- Subagents, when the session has them, are named after the Eras Tour openers (Sabrina Carpenter, Gracie Abrams, Phoebe Bridgers, HAIM, Paramore). Tell the owner in one short table: name, job, why that name. Use them only for independent pieces (for example one floor each); otherwise do the work yourself.
- The report is one line per era, in the owner's words, no code.

## Support act: Ed Sheeran (check the intake)

Read `reference/<id>/INTAKE.md`. Check the files are really there: floorplan(s) in `reference/<id>/` (or already in `src/houses/<id>/assets/`), photos in `reference/<id>/photos/` named `<room>-<n>.jpg` and `front-/rear-/side-<n>.jpg`, a map with a scale. If anything is missing or unticked, **stop** and list what is missing under Ed's song names, then wait:

| Song | Needs |
|---|---|
| Shape of You | floorplan image(s), printed room sizes if the plan has them |
| Photograph | a photo of each room and each outside face; the garden |
| Castle on the Hill | north-up map of the plot with a scale |
| Thinking Out Loud | the ten answers (attached/detached and side, front direction, garage, extensions, year built, storeys, ceiling heights, changes wanted, floorplan errors, file locations) |
| Perfect | the checklist ticked, the slug chosen (not an address) |

## Debut: scaffold the house

1. `npm run house:new <id> "<Name>"` (copies `src/houses/_template/`, writes `meta.json`, renames the preset ids, creates `reference/<id>/` if needed). The name must not be an address.
2. Move or copy the floorplan to `src/houses/<id>/assets/floorplan.(webp|png|jpg)`; `assets.ts` already picks it up. Photos stay in `reference/<id>/photos/` for you and NOTES.md; never put them in `src/houses/<id>/assets/`. The Photos panel is for the owner's own uploads.
3. `npm run check`; commit "Add the <id> house folder from the template".

## Fearless: trace the floorplan

1. Read the floorplan image with the Read tool. Note its pixel size, the printed room sizes, door and window positions, stairs and the compass if drawn.
2. Work out pixels per metre from a printed size or the total area; record how in NOTES.md ("Floorplan and scale").
3. Rewrite `src/houses/<id>/house.ts` in **floorplan pixels** (wall centre lines) with the helpers at the top of `src/houses/listing-91770873/house.ts`: `rect(name, x0, y0, x1, y1, dims?)`, `poly(name, [[x,y],...], dims?)` and `op(kind, x, y, "h"|"v", widthM)`. Pass the printed sizes as `dims`. One floor object per floor, with `pxPerM`. Keep the template's preset shape and export names.
4. `npm run house:overlay <id> [--floor n] [--out file.png]`, then **look at the image** (Read it). Fix rooms that miss the walls and openings off their edges; repeat until it lines up.
5. Compare each room's traced area with its printed size (the lint in `src/houses/lint.ts` allows 8%); note any difference over a few per cent in NOTES.md.
6. Take a 3D screenshot: start `VITE_HOUSES=<id> npx vite --port 5173`, adapt the pattern in `scripts/screenshots.mjs` (Playwright from /opt/node22/lib/node_modules, launched with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`). Look at it.
7. `npm run check`; bump `version`; commit "Trace the <id> floorplan".

## Speak Now: the one round of questions

Ask every open decision in **one round**, each with your recommendation: ambiguous rooms, the party wall, door swings, stair direction, anything the plan or the ten answers do not settle. Use AskUserQuestion when available, otherwise one numbered message. Then build without asking again; make the remaining calls yourself and list them in the report. Apply the answers, record them in NOTES.md as "owner says", re-run the overlay, commit.

## Red: the exterior from the photos

Roof form and pitch (estimate from front/rear/side photos; refine in the fidelity pass), wall materials and colours, window and door styles, chimney, garage, porch, bay. Use the `exterior` settings and roof fields the template and listing use. Record each with its photo in NOTES.md. Screenshot front and rear; compare with the photos by eye. Bump version; commit "Add the <id> exterior".

## 1989: the plot and the sun

From the map: boundary, neighbours' footprints, drive, front garden, boundary types and heights from the photos. Work in metres around the house (x right, z towards the front) in the site preset. Set `frontBearing`, `latitude` and `longitude` (rounded to about a kilometre). Check by eye:
`npm run house:map <id> <map.png> --scale <px per m> --origin <x,y> [--bearing deg]` and look at the image; fix and repeat. Open the sun study and check shadows fall the right way. Record the bearing's source and the map's accuracy in NOTES.md. Bump the site preset version; commit "Place <id> on its plot".

## Reputation: checks, and the choice

1. `npm run check` and `npm run build` must pass (the house's `house.test.ts` runs the lint).
2. Screenshots for the owner: 3D from front, rear and top, and the ground-floor plan. Send them (show the images in the reply; say where the files are).
3. Explain the fidelity pass, in these words:

   > The basic tiers (Debut to 1989) give a house that is the right shape, on the right plot, facing the right way: good enough to plan a layout, compare As listed with Proposed, cost it and check planning rules. The fidelity pass makes the 3D look like your house: real finishes on each wall and floor, the actual kitchen and wardrobes, radiators where they hang, windows at their real heights, the garden as it is. It costs sessions (about two for Lover, four or more for Taylor's Version), needs good photos of every room and every outside face, and each pass bumps the preset version, so your browser is offered the update and keeps your edits. You can stop after any tier and come back later.

4. Ask **one question**: stop at basic, Lover, or Taylor's Version (which includes Lover and Folklore). Recommend what the photos support. Then go to Encore if they stop.

## The fidelity pass (optional)

Each tier may be its own session. Every pass bumps the preset version so the update prompt (`layoutMerge`, `startupPrompt`) offers it to the owner's browser and keeps their edits. Commit per tier; record every fact and photo in NOTES.md; `npm run check` before each commit.

| Era | Scope |
|---|---|
| **Lover** (standard) | Per-room finishes (floors, walls, skirting), joinery, kitchen and bathroom fittings, radiators and other fixtures from the photos. |
| **Folklore** (full) | Garden baseline (surfaces, walls, plants, outbuildings) and lighting as photographed. |
| **Taylor's Version** (full) | Camera-fitted storey heights, roof pitch, window heights and chimney; the house re-recorded to be faithful to the photos. Fit cameras to photos as the listing's NOTES.md describes ("Roof pitch and eaves", "Storey heights and the chimney"). |

## Encore: share it

1. **Passcode.** The owner of the live server (the repo owner) adds this house to `PASSCODES` on Render: `PASSCODES="listing-91770873=…,<id>=…"`, one passcode per house, at least 10 characters. Tell the new owner to ask for it; the passcode keeps each house's shared project separate; the houses in a build are visible to anyone signed in. The shared project then lives on the server and syncs across their devices (README, "Keeping one project on every device").
2. **Optional own artifact.** `npm run build:hosted -- --house <id>` builds a single-file page with only this house; the owner may publish `dist-hosted/house-modeler.html` as their own Artifact and record its URL in NOTES.md. Never publish the repo owner's artifact URL.
3. **How updates reach a browser.** Bumped preset versions are offered by a prompt on the next open; edits are kept and merged. Their work is saved per house in the browser and on the server.
4. Merge or push as the repo owner directs; do not push to `main` yourself unless told.

Finish with the report: one line per era (what was done, what was a judgement call, what is still open).
