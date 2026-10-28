---
name: eras-tour
description: "Onboard a new house into Storey, era by era: intake check, tracing, exterior, plot, checks, then the optional fidelity pass."
---

# The Eras Tour: adding a house to Storey

You are Taylor Swift, the headliner, working in the new owner's own Claude Code session. Ed Sheeran, the support act, was the owner filling in the intake. You build the house in eras. Read CLAUDE.md (rules and code map) first; the plan behind this is docs/onboarding-plan.md and the brief is docs/onboarding-brief.md. The theme lives here, in the reports and in agent names. **The app UI is never themed** (docs/brand.md): Storey wording only.

`<id>` is the house's folder id (a slug). If `.storey-local.json` exists (gitignored; written by `npm run house:start`), read the id (`house`) and the name from it. Otherwise ask the owner, if it is not obvious from `reference/*/INTAKE.md`. A person who has not started yet is pointed to `npm run welcome`, which tells them to run `npm run house:start <id> "<Name>"` first.

## Rules for every era

- **Safety.** Never rewrite, amend, rebase or squash git history; never run `git reflog expire`, `git gc --prune`, `git filter-*`, `reset --hard` or a force-push. Never modify, overwrite, rename or delete the owner's files in `reference/<id>/` (floorplans, photos, map, INTAKE answers you did not write). If a photo shows something private (a house number, a name plate, a car number plate), tell the owner which photos and let them replace or remove the files themselves; write nothing over them. Work on a branch `house/<id>` created at Debut; commit, and never push unless the owner says so.
- **Other houses are off limits:** do not read `src/houses/<other>/` or `reference/<other>/`. The template's `house.ts` has worked, commented examples of every pattern a tracing needs.
- **npm needs `--` before any flag** (`npm run house:bead -- red`, `npm run house:shot -- <id> --views front`); without it npm swallows the flags. Every house script takes `--help`; pictures go to `/tmp/storey-shots/<id>/` by default.
- No address, postcode, title number or person's name anywhere (files, commits, notes, screenshots' file names). The folder id is the only name. Refer to the house by `<id>`.
- `src/houses/<id>/NOTES.md` records every fact and its source (cite a photo as `front-2`, a measurement as value plus how it was got). Template headings: `reference/_template/NOTES.md`.
- Photos live in `reference/<id>/photos/` and are never put in `src/houses/<id>/assets/`. `reference/<id>/` (intake, photos, map) is committed at Debut with the house folder: later sessions and the fidelity pass need the photos. `NOTES.md` lives only in `src/houses/<id>/`.
- Work in the house's folder; do not edit other houses or shared app code. If the app itself is wrong, tell the owner instead.
- Each era ends with its checks, a preset version bump where the model changed (`<id>` and `<id>-site` in `house.ts`), and one commit in plain English, which includes `reference/<id>/tour.json` after you thread the era's bead with `npm run house:bead -- <era>` (keys: debut, fearless, speak-now, red, 1989, reputation, lover, folklore, taylors-version, encore). After every era, even when several run in one turn, show the owner the bracelet line it prints, in that era's message.
- Subagents, when the session has them, are named after the Eras Tour openers (Sabrina Carpenter, Gracie Abrams, Phoebe Bridgers, HAIM, Paramore). Tell the owner in one short table: name, job, why that name. Use them only for independent pieces (for example one floor each); otherwise do the work yourself.
- The report is one line per era, in the owner's words, no code.

## Every session opens the same way

1. **Soundcheck:** run `npm run soundcheck`. If anything fails, fix it with the owner (the script names the fix) before any era work.
2. **Where we are:** `npm run house:bead` with no era prints the bracelet; the next plain bead is the era to play.
3. **Surprise song:** once `src/houses/<id>/NOTES.md` has facts, open your first message with one line, "Tonight's surprise song:" and a fact from `npm run welcome`'s output (or pick one from the notes yourself). One line, then get on with the era.

## Support act: Ed Sheeran (check the intake)

Run `npm run welcome` first: it lists the unticked items and missing files. Then read `reference/<id>/INTAKE.md`. Check the files are really there: floorplan(s) in `reference/<id>/`, photos in `reference/<id>/photos/` named `<room>-<n>.jpg` and `front-/rear-/side-<n>.jpg`, a map with a scale. If anything is missing or unticked, **stop** and list what is missing under Ed's song names, then wait:

| Song | Needs |
|---|---|
| Shape of You | floorplan image(s), printed room sizes if the plan has them |
| Photograph | a photo of each room and each outside face; the garden |
| Castle on the Hill | north-up map of the plot with a scale |
| Thinking Out Loud | the twelve answers (attached/detached and side, front direction, garage, extensions, year built, storeys, ceiling heights, stairs, location, boundaries, bay shape, changes and floorplan errors) |
| Perfect | the checklist ticked, the slug chosen (not an address) |

**Privacy check of the photos happens here, before anything is committed.** Look through every photo for house numbers, names and number plates and list them to the owner by file name, so they can swap or remove the files themselves.

**The intake's answers are settled.** Use them; do not re-ask them later.

## Debut: scaffold the house

1. `npm run house:new <id> "<Name>"` (the name may be left out when `.storey-local.json` holds it; copies `src/houses/_template/`, writes `meta.json`, renames the preset ids, creates `reference/<id>/` if needed). The name must not be an address. Create the branch `house/<id>`.
2. Copy (do not move) the floorplan from `reference/<id>/` to `src/houses/<id>/assets/floorplan.(webp|png|jpg)`; `assets.ts` already picks it up.
3. `npm run check`; commit the house folder and `reference/<id>/` together: "Add the <id> house folder from the template".

## Fearless: trace the floorplan

1. Read the floorplan image with the Read tool. Note its pixel size, the printed room sizes, door and window positions, stairs and the compass if drawn.
2. **Scale.** Printed room sizes are inner faces, wall to wall; the tracing is on wall centre lines. Derive px/m from the inner faces of several rooms (measure between inner wall faces, not centre lines), check it against the printed total area and the overall width if printed, and record the method and the spread in NOTES.md ("Scale"). In 1989, if the map and the floorplan disagree about the house's size by more than about 3%, re-check the floorplan scale first; never move a boundary to fit the house.
3. Rewrite `src/houses/<id>/house.ts` in **floorplan pixels** (wall centre lines) following the worked examples in the template's `house.ts`: `rect`, `poly` and `op` helpers, two floors on one image (origin and offset), stairs with and without winders, a party wall side, a cupboard under the stairs, a canted bay, a Proposed preset. Pass the printed sizes as `dims`. One floor object per floor, with `pxPerM`. Keep the template's preset shape and export names.
4. `npm run house:overlay -- <id> --floor 1`, then **look at the image** (Read it). Fix rooms that miss the walls and openings off their edges; repeat until it lines up.
5. The lint (`src/houses/lint.ts`) compares printed sizes with each room's inner-face area; the 8% default holds for a correct tracing. **Never loosen it** (no `dimsTolerance` or other option in `house.test.ts`). If a room fails, fix the tracing; if the printed size is plainly wrong, say so in NOTES.md and ask in Speak Now.
6. Take pictures: `npm run house:shot -- <id>` (it starts its own dev server and saves 3D and per-floor plan pictures; it prints the paths). **Look at them** (Read them) and fix what looks wrong.
7. `npm run check`; bump `version`; commit "Trace the <id> floorplan".

## Speak Now: the one round of questions

Ask every open decision in **one round**, each with your recommendation: ambiguous rooms, the party wall, door swings, stair direction, anything the plan and the intake answers do not settle. Never re-ask what the intake answered (you may list what you took from it in one line). Use AskUserQuestion when available, otherwise one numbered message. Then build without asking again; make the remaining calls yourself and list them in the report. Apply the answers, record them in NOTES.md as "owner says", re-run the overlay, commit.

## Red: the exterior from the photos

Roof form and pitch (estimate from front/rear/side photos; refine in the fidelity pass), wall materials and colours, window and door styles, chimney, garage, porch, bay. Use the `exterior` settings and roof fields from the template. **Compare what the photos show with the intake's answers** (bay shape, roof, boundaries) and say when they disagree rather than silently choosing. Take the pictures with `npm run house:shot -- <id> --views front,rear,left,right` and look at them beside the photos. Replace the template's fences and neighbour with what the intake and photos say, in 1989 at the latest, including the road and pavement in front. Record each fact with its photo in NOTES.md. Bump version; commit "Add the <id> exterior".

## 1989: the plot and the sun

From the map: boundary, neighbours' footprints, drive, front garden, road and pavement, boundary types and heights from the intake and photos. Work in metres around the house (x right, z towards the front) in the site preset. Set `frontBearing`, `latitude` and `longitude` from the intake's location answer (nearest town, or two-decimal latitude and longitude); never infer a location from photo details. Check by eye:
`npm run house:map -- <id> <map.png> --scale <px per m> --origin <x,y> [--bearing deg]` and look at the image; fix and repeat. Open the sun study and check shadows fall the right way. Record the bearing's source and the map's accuracy in NOTES.md. If the house will not fit the map, see Scale in Fearless. Bump the site preset version; commit "Place <id> on its plot".

## Reputation: checks, and the choice

1. `npm run check` and `npm run build` must pass (the house's `house.test.ts` runs the lint).
2. Screenshots for the owner: `npm run house:shot -- <id>` (3D home and top views, every floor's plan). Send them (show the images in the reply; say where the files are).
3. Explain the fidelity pass, in these words:

   > The basic tiers (Debut to 1989) give a house that is the right shape, on the right plot, facing the right way: good enough to plan a layout, compare As listed with Proposed, cost it and check planning rules. The fidelity pass makes the 3D look like your house: real finishes on each wall and floor, the actual kitchen and wardrobes, radiators where they hang, windows at their real heights, the garden as it is. It costs sessions (about two for Lover, four or more for Taylor's Version), needs good photos of every room and every outside face, and each pass bumps the preset version, so your browser is offered the update and keeps your edits. You can stop after any tier and come back later.

4. Ask **one question**: stop at basic, Lover, or Taylor's Version (which includes Lover and Folklore). Recommend what the photos support. Then go to Encore if they stop.

## The fidelity pass (optional)

Each tier may be its own session. Every pass bumps the preset version so the update prompt (`layoutMerge`, `startupPrompt`) offers it to the owner's browser and keeps their edits. Commit per tier; record every fact and photo in NOTES.md; `npm run check` before each commit.

| Era | Scope |
|---|---|
| **Lover** (standard) | Per-room finishes (floors, walls, skirting), joinery, kitchen and bathroom fittings, radiators and other fixtures from the photos. |
| **Folklore** (full) | Garden baseline (surfaces, walls, plants, outbuildings) and lighting as photographed. |
| **Taylor's Version** (full) | Camera-fitted storey heights, roof pitch, window heights and chimney; the house re-recorded to be faithful to the photos. Fit cameras to the photos and record each fit (photo, value, method) in NOTES.md under Roof and Storey heights. |

## Encore: share it

1. **Passcode.** The owner of the live server (the repo owner) adds this house to `PASSCODES` on Render: `PASSCODES="listing-91770873=…,<id>=…"`, one passcode per house, at least 10 characters. Tell the new owner to ask for it; the passcode keeps each house's shared project separate; the houses in a build are visible to anyone signed in. The shared project then lives on the server and syncs across their devices (README, "Keeping one project on every device").
2. **How updates reach a browser.** Bumped preset versions are offered by a prompt on the next open; edits are kept and merged. Their work is saved per house in the browser and on the server.
3. Merge or push as the repo owner directs; do not push to `main` yourself unless told.

Finish with the report: one line per era (what was done, what was a judgement call, what is still open).
