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

The free plan sleeps the service after about 15 minutes without a visit, and the next visit can take up to a minute to wake it. Wrong passcodes are limited to 10 per 15 minutes for each address.

To run it locally:

```bash
npm run build && PASSCODE=choose-a-passcode npm start
```

Then open <http://localhost:10000> (set `PORT` to change it). The server refuses to start without a `PASSCODE`.

## Listing 91770873

**Load listing 91770873** (and its proposed two-storey side extension) is built in: traced from the listing's floorplan, checked against its photos, placed on its plot from the OS map with the neighbours, and orientated to the compass so the sun study is right. The listing's floorplan and 37 photos are bundled (**Photos → Load listing 91770873 photos**). `reference/listing-91770873/NOTES.md` records the facts used and where each came from.

## Using it

- **Floorplans**: load the built-in listing, with or without the two-storey extension. **Proposed** can start as a copy of As listed.
- **Check plan** (the plan editor): drag corners and openings, draw rooms and walls, and add doors, windows, French and bi-fold doors and bays. Pinch or scroll to zoom and drag to pan. Each room shows its area and the selected room its edge lengths. Tap an edge length to type a new one, or type a room's width and depth. **Measure** gives the distance between two points. The room inspector has notes, floor finish, wall paint or covering (paint, wallpapers, tiles or exposed brick), outside finish and an "unheated" flag; any wall can have its own covering, such as a feature wall or a tiled splashback, and is lit on the plan as you pick it. The furniture catalogue has UK sizes; items snap to walls and can be resized, recoloured, rotated and duplicated.
- **3D view**: orbit, or use the camera presets for street-level elevations. **View** holds side by side and overlay compare, which floors to show, labels, ceilings, the exterior and the site.
- **Exterior**: hipped or gabled roof, party wall side, tiles, fascias and gutters, the tiled skirt round single-storey flat roofs, porch canopies, extension roofs and chimneys.
- **Site**: plot boundary, fences and walls, garden surfaces and neighbouring houses, edited on a plan with distances to the boundary. The **Sun study** shows the sun and shadows for any day and time, and how many hours of sun each part of the garden gets.
- **Photos**: load the listing photos or add your own and assign each to a room or side of the house; they appear as pins in 3D and can be used as floor textures.
- **Report**: room, floor and house areas for both variants. It also checks the model's area, measured the way a listing measures it, against the listing's printed total, and gives the heated area. It lists the changes from As listed to Proposed, flagging likely structural work, and gives a rough cost from your own rates. The exports are PNG snapshots, scale plan drawings (SVG), a print / save-as-PDF report, a .glb 3D model and a CSV of the changes.
- **Settings**: render quality (lower it on older iPads), and project export and import as JSON (images included).

## How it works

- `src/lib/`: pure, tested logic. `geometry.ts` (plan to world, walls, openings cut into walls), `walls.ts` and `openings.ts` (wall shells, frames, doors and bays), `wallCovering.ts` and `featureWalls.ts` (room and per-wall coverings), `roof.ts` and `roofParts.ts` (roof planning and parts), `site.ts` and `sun.ts`, `stairs.ts` and `stairwell.ts` (stair geometry), `planMath.ts` (editor maths), `report.ts` and `export.ts` (areas, change list, costs, plan SVGs, CSV).
- `src/three/`: react-three-fiber scene, with procedural textures generated once and cached, and one merged mesh per material per floor.
- `src/editor/`: the SVG plan and site editors.
- State lives in a zustand store persisted to IndexedDB. Images are stored separately, and writes are debounced and flushed when the page hides. Model edits can be undone.

## Limits

- The plan is traced by eye from a marketing floorplan, so corners can be a few centimetres out. **Check plan** lets you nudge them.
- Room areas in the tables run to the wall centre lines. The "measured like the listing" figure in the Report is the one to compare with a listing or an EPC.
- Rough costs use only the rates you enter. They are not a quote, and the structural flags are prompts to get advice, not advice.
- The photos are used as reference and texture only; there is no photogrammetry.
