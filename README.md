# House Modeler

A browser-only tool for visualising a house you are buying and planning its renovation, on a desktop, iPad or phone.

The house is built in: the listing, traced from its floorplan and placed on its plot. The app builds a 3D model with real wall finishes, doors and windows, roofs, the garden, the neighbours and the sun. Edit the plan, draw a second "Proposed" layout and compare it with the original side by side or as an overlay, list what changes, put rough costs against it and export plans and a print-ready report.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints. `npm run check` runs the type check and the unit tests; `npm run build` produces a static site in `dist/` that can be served from anywhere. On an iPad or phone, **Add to Home Screen** installs it as an app.

## Hosting on Render

`render.yaml` describes a small Node web service (`server/server.mjs`, no extra dependencies) that serves the built site only to people who have entered a passcode, so it can be opened on a desktop, iPad or phone. Once signed in, a browser stays signed in for 30 days.

1. In the [Render dashboard](https://dashboard.render.com) choose **New → Blueprint** and connect this GitHub repository.
2. When prompted, type a value for `PASSCODE` (at least 4 characters). It is never stored in the repository. `SESSION_SECRET` is generated for you.
3. Apply the Blueprint and wait for the first deploy to finish (a few minutes).
4. Open the `onrender.com` URL shown for the service, enter the passcode and, on an iPad or phone, **Add to Home Screen**.

To change the passcode, edit `PASSCODE` under the service's **Environment** tab and save. Render redeploys, and everyone is signed out. Visiting `/logout` signs out the current browser.

Wrong passcodes are limited to 10 per 15 minutes for each address.

### Keeping one project on every device

Each browser keeps its own copy of the project (layouts, photos, plots, cost rates) in its own storage. On Render the server also holds **one shared copy**, so a laptop and an iPad see the same project:

- When the app opens, it asks the server for the shared copy. If the server's copy is newer than the one this browser last synced, it is loaded (the startup prompt about listing updates then runs on what was loaded). A browser that has never synced uploads its project if the server has none.
- About 3 seconds after you stop editing, the project is saved to the server. If the shared copy was changed on another device in the meantime, nothing is overwritten: a dialog offers **Load that version**, **Keep mine and overwrite** or **Cancel**. **Cancel** leaves things as they are until you tap **Sync now**.
- **Settings → Project** shows the state ("Synced with the server · saved 14:02", "Saving…", "Couldn't reach the server, will retry") and has a **Sync now** button. Opening the app again, or coming back to its tab, also checks for changes made elsewhere. Camera, tabs and other view settings are not synced, only the project (the same data as Export JSON).
- Where there is no server (`npm run dev`, or the hosted Claude artifact), sync is off and nothing is shown.

The server stores the shared copy as one file, `project.json`, in the folder named by the `DATA_DIR` environment variable (without it, `./data` next to the app, which is in `.gitignore`). Photos are embedded, so saves can be large (up to 50 MB).

**The shared copy only survives deploys and restarts if `DATA_DIR` is on a persistent disk.** Render's free instances have no disk: anything written next to the app is wiped on every deploy or restart. `render.yaml` therefore asks for a paid instance (`plan: starter`) with a 1 GB disk mounted at `/var/data` and sets `DATA_DIR=/var/data`. How much that costs depends on Render's [pricing](https://render.com/pricing), so check there. A service with a disk is deployed with a short downtime instead of zero-downtime (and cannot be scaled to several instances). If `DATA_DIR` is not set, the server logs a loud warning and tells the app, which then adds "Server copy isn't permanent" to the status line. Each browser still keeps its own copy, and **Export JSON** is still the way to make a backup you control.

For a service that was not created from the Blueprint, add the disk by hand in the Render dashboard:

1. **Settings → Instance type → Starter** (or any paid type; the free type cannot have a disk).
2. **Disks → Add disk**: name it (say `house-data`), mount path `/var/data`, size 1 GB.
3. **Environment → add `DATA_DIR` = `/var/data`**, then save. Render redeploys.

To run it locally:

```bash
npm run build && PASSCODE=choose-a-passcode npm start
```

Then open <http://localhost:10000> (set `PORT` to change it). The server refuses to start without a `PASSCODE`.

## Listing 91770873

**Load listing 91770873** (and its proposed two-storey side extension) is built in: traced from the listing's floorplan, checked against its photos, placed on its plot from the OS map with the neighbours, and orientated to the compass so the sun study is right. The listing's floorplan and 37 photos are bundled (**Photos → Load listing 91770873 photos**). `reference/listing-91770873/NOTES.md` records the facts used and where each came from.

## Using it

- **Floorplans**: load the built-in listing, with or without the two-storey extension. **Proposed** can start as a copy of As listed, plot included. When the built-in house improves after you copied it (a measured roof pitch, radiators, the stairs), **Bring in updates from listing 91770873…** on Proposed lists what changed, grouped (roof and exterior, neighbouring buildings, new fittings and furniture, stairs, doors and windows), with the safe ones ticked and a reason beside the rest ("sits where your Utility Room now is"). Only what you tick changes; your rooms, walls and own furniture are never touched, and one undo puts it back. The startup prompt offers the same review when As listed is updated.
- **Check plan** (the plan editor): drag corners and openings, draw rooms, porch canopies and walls, and add doors, windows, French and bi-fold doors and bays. Pinch or scroll to zoom and drag to pan. A porch canopy shows as a hatched dashed outline: tap it to type a width and depth, drag its corners or the whole canopy, or delete it, and the 3D roof and pillars follow. Each room shows its area and the selected room its edge lengths. Tap an edge length to type a new one, or type a room's width and depth. **Measure** gives the distance between two points. The room inspector has notes, floor finish (boards, wide-plank oak, herringbone and chevron parquet, porcelain, hexagon, Victorian geometric and encaustic tiles, terrazzo, microcement and more, with the pattern's direction and the grout colour), wall paint (with a row of quick modern colours) or covering (paint, wallpapers, tiles, exposed brick, shaker panelling, tongue and groove, board and batten, metro and zellige tiles, limewash, microcement; panelling, boards and splashback tiles stop at a dado or splashback height and the wall above is painted), outside finish and an "unheated" flag; any wall can have its own covering, such as a feature wall or a tiled splashback, and is lit on the plan as you pick it. The furniture catalogue has UK sizes; items snap to walls and can be resized, recoloured, rotated and duplicated.
- **3D view**: orbit, or use the camera presets for street-level elevations. **View** holds side by side and overlay compare, which floors to show, labels, ceilings, the exterior and the site.
- **Exterior**: hipped or gabled roof, party wall side, tiles, fascias and gutters, the tiled skirt round single-storey flat roofs, porch canopies, extension roofs and chimneys.
- **Site**: plot boundary, fences and walls, garden surfaces and neighbouring houses, edited on a plan with distances to the boundary. Each layout has its own plot, so a change for Proposed (say, taking out part of the front garden wall to widen the drive) doesn't show in As listed: pick Proposed, then edit its plot in the Site panel or **Check plan → Site**. A Proposed layout with no plot of its own uses As listed's until you first change it, and a note in the Site panel says which layout's plot you are editing. Side by side, each view shows its own plot; the overlay marks boundary walls and fences that differ. The **Sun study** shows the sun and shadows for any day and time, and how many hours of sun each part of the garden gets.
- **Photos**: load the listing photos or add your own and assign each to a room or side of the house; they appear as pins in 3D and can be used as floor textures.
- **Report**: room, floor and house areas for both variants. It also checks the model's area, measured the way a listing measures it, against the listing's printed total, and gives the heated area. It lists the changes from As listed to Proposed, flagging likely structural work, plot changes included (boundary walls shortened or removed, drive openings widened, surfaces added or resized), and gives a rough cost from your own rates. The exports are PNG snapshots, scale plan drawings (SVG), a print / save-as-PDF report, a .glb 3D model and a CSV of the changes.
- **Settings**: render quality (lower it on older iPads), and project export and import as JSON (images included), and, on the Render server, the sync status and **Sync now**.

## How it works

- `src/lib/`: pure, tested logic. `geometry.ts` (plan to world, walls, openings cut into walls), `walls.ts` and `openings.ts` (wall shells, frames, doors and bays), `wallCovering.ts` and `featureWalls.ts` (room and per-wall coverings), `floorFinish.ts` and `floorPattern.ts` (floor finish colours and grout, herringbone, chevron and hexagon layouts, pattern direction), `roof.ts` and `roofParts.ts` (roof planning and parts), `site.ts` and `sun.ts`, `sites.ts` (each layout's plot) and `siteDiff.ts` (plot changes), `layoutMerge.ts` and `siteMerge.ts` (bringing listing updates into an edited design or plot), `migrate.ts` (saved-state upgrades), `stairs.ts` and `stairwell.ts` (stair geometry), `planMath.ts` (editor maths), `report.ts` and `export.ts` (areas, change list, costs, plan SVGs, CSV).
- `src/three/`: react-three-fiber scene, with procedural textures generated once and cached, and one merged mesh per material per floor.
- `src/editor/`: the SVG plan and site editors.
- State lives in a zustand store persisted to IndexedDB. Images are stored separately, and writes are debounced and flushed when the page hides. Model and plot edits can be undone. The plots sit beside the layouts (`sites`, one per layout) rather than inside them, so a plot edit doesn't rebuild the 3D house; saves and JSON exports from before, with one shared plot, give each layout a copy.

## Limits

- The plan is traced by eye from a marketing floorplan, so corners can be a few centimetres out. **Check plan** lets you nudge them.
- Room areas in the tables run to the wall centre lines. The "measured like the listing" figure in the Report is the one to compare with a listing or an EPC.
- Rough costs use only the rates you enter. They are not a quote, and the structural flags are prompts to get advice, not advice.
- The photos are used as reference and texture only; there is no photogrammetry.
