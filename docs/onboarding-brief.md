# Onboarding a second house: brief ("The Eras Tour")


> **Update (2026-10-28):** the hosted Claude artifact and `npm run build:hosted` were dropped. Render deploys main and is the only hosted copy; read the artifact parts below as history.

Status: agreed in outline, decisions below being settled. Plan to follow (docs/onboarding-plan.md).

## What the owner asked

A mate wants to model his own home in Storey. He gets access to this repo and knows Claude Code. The onboarding must be as simple and seamless as possible, produce the same level of output as listing 91770873, be reusable for the next person, and be playful: themed as a Taylor Swift gig with Ed Sheeran supporting.

Decisions already made by the owner:

- **One deployment, a house picker, one project per house on the server** (approach 3 of the three offered). He loads it live, not just locally.
- **Shared repo**: both houses live on `main`; app work is shared, house data is per folder.
- **The fidelity pass is an option.** The playbook explains what it is and what it costs, and he chooses.

## What the history says (why the playbook looks like this)

- The house lives in code (`src/lib/houses/listing91770873.ts`), versioned so a browser holding an older copy is offered the update and keeps its edits (`layoutMerge`, `siteMerge`, `startupPrompt`). Claude reading the floorplan and writing the tracing beat the vision-extraction path, which was removed on 15 October.
- Evidence came in a fixed order: floorplan with printed sizes (scale), photos (finishes, joinery, heights), an OS-based map (plot, neighbours), bearing and rough location (sun). Camera fitting to photos settled the roof pitch, storey heights and chimney. NOTES.md records every fact and its source; a test file guards the data.
- The process that produced the quality: brief, one round of questions with recommendations, an Opus plan with owned files, parallel Sonnet worktrees, merge, check, push, republish.

## The show

The playbook is one skill, `/eras-tour`, in `.claude/skills/eras-tour/`. The theme lives in the playbook, the templates, the reports and the subagent names; the app itself stays Storey (docs/brand.md).

### Support act: Ed Sheeran (the intake, done by the mate before Claude starts)

He fills `reference/<slug>/INTAKE.md` from a template and drops files beside it. About 30 minutes, no Claude.

| Song | What he brings |
|---|---|
| **Shape of You** | The floorplan image(s), with the printed room sizes if the agent's plan has them. |
| **Photograph** | Every photo he has: each room, each outside face, the garden. Named by room if he can; Claude names the rest. |
| **Castle on the Hill** | A north-up map of the plot with a scale: title plan, the OS map from the searches, or a satellite screenshot with the scale bar. |
| **Thinking Out Loud** | A ten-line questionnaire: attached or detached and on which side, which way the front faces, garage, extensions, year built, storeys, what he wants to change. |
| **Perfect** | The checklist ticked. The slug (never an address) chosen. |

### Headliner: Taylor Swift (Claude builds, era by era)

Each era ends with `npm run check`, screenshots for him to look at, a preset version bump, a commit and a republish. He is asked questions in two eras only.

| Era | What happens | Interaction |
|---|---|---|
| **Debut** | The house folder is scaffolded from the template; the registry knows the house; the picker shows it. | none |
| **Fearless** | Claude reads the floorplan and writes the tracing; the overlay check image and room areas against printed sizes. | none |
| **Speak Now** | The one round of questions: ambiguous rooms, the party wall, door swings, anything the plan does not say. The "surprise songs". | **one round** |
| **Red** | Exterior from the photos: roof form and pitch, walls, windows, doors, chimney. | none |
| **1989** | Plot, neighbours, bearing and location from the map; the sun study works. | none |
| **Reputation** | The data tests pass, the 3D and plan screenshots are sent, and he is told what the fidelity pass would add. | **he picks a tier** |
| **Lover** | Fidelity, standard: per-room finishes, joinery, radiators and fittings from the photos. | none |
| **Folklore** | Fidelity, full: garden baseline, lighting as photographed. | none |
| **Taylor's Version** | Fidelity, full: camera-fitted storey heights, roof pitch and window heights; the house re-recorded to be faithful to the photos. | none |
| **Encore** | His passcode, his hosted project, the link, how updates reach his browser without losing his edits. | none |

### The fidelity pass, as it is explained to him

The basic tiers (Debut to 1989) give a house that is the right shape, on the right plot, facing the right way: good enough to plan a layout, compare As listed with Proposed, cost it and check planning rules. The fidelity pass makes the 3D look like his house: real finishes on each wall and floor, the actual kitchen and wardrobes, radiators where they hang, windows at their real heights, the garden as it is. It costs sessions (about two for Lover, four or more for Taylor's Version), needs good photos of every room and every outside face, and each pass bumps the preset version, so his browser is offered the update and keeps his edits. He can stop after any tier and come back later.

### Subagents

Opus plans as **Taylor Swift** (the headliner writes the setlist). **Ed Sheeran** builds the support set: the intake template, the house-folder template, the overlay and map scripts in Node. The Sonnet builders are named after the real Eras Tour openers: Sabrina Carpenter, Gracie Abrams, Phoebe Bridgers, HAIM, Paramore.

## What has to change in the app for one live deployment

1. **House registry.** `src/houses/<slug>/` holds `house.ts` (layouts, plot, presets), `assets/` (the floorplan), `NOTES.md` and `house.test.ts`; `src/houses/index.ts` lists them, each loaded lazily so one house's photos never load for another. A `House` descriptor carries the id, display name, presets and asset loaders. Everything that now says "listing 91770873" (about 20 files) reads the active house. Listing 91770873 moves into the first folder unchanged.
2. **Active house.** The store carries `houseId`. The Welcome card shows a picker when more than one house is available; the House menu gets "Switch house…". The browser's saved project is namespaced by house, so switching never loses work.
3. **Server.** `PASSCODES` names one passcode per house (`PASSCODE` alone keeps working for the first house). The session cookie carries the house, `/api/project` reads and writes `project-<house>.json`, and `/api/me` tells the app which house the passcode opened. Served by the server, the app opens that house and hides the picker.
4. **Hosted artifact.** The build takes the houses to include; the owner's artifact stays the owner's house only.
5. **CLAUDE.md** splits into shared rules and a short per-house block (slug, artifact URL if any); the privacy rule becomes "refer to each house by its slug".

## Open decisions (owner, one round)

| # | Decision | Recommendation |
|---|---|---|
| 1 | One shared passcode, or one per house | **Per house.** The passcode picks the house, so each of you sees your own; you can hold both. |
| 2 | The owner's hosted artifact: own house only, or the picker with both | **Own house only.** Keeps his photos out of it and the build small. |
| 3 | When he picks the fidelity tier: at intake, or after seeing the basic 3D | **After seeing it** (the Reputation era), when he knows what he is looking at. |
| 4 | Theme reach: playbook, reports and agent names, or the app's welcome copy too | **Playbook only.** The app stays Storey-branded. |
