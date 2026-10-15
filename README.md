# House Modeler

A browser-only tool for visualising a house you are buying and planning its renovation, on a desktop, iPad or phone.

Upload the floorplan image from the listing and Claude reads it into rooms, doors, windows and printed dimensions (or trace it by hand). The app scales the plan and builds a 3D model with real wall finishes, doors and windows, roofs, the garden, the neighbours and the sun. Draw a second "Proposed" layout and compare it with the original side by side or as an overlay, list what changes, put rough costs against it and export plans and a print-ready report.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints. `npm run check` runs the type check and the unit tests; `npm run build` produces a static site in `dist/` that can be served from anywhere. On an iPad or phone, **Add to Home Screen** installs it as an app.

The app works without a key if you trace the floorplan by hand. For AI extraction and photo matching, go to **Settings** and paste an Anthropic API key from https://platform.claude.com. The key is stored only in your browser (IndexedDB) and requests go straight from the page to the Anthropic API, so never deploy this with a key baked in or on a shared host.

## Listing 91770873

**Load listing 91770873** (and its proposed two-storey side extension) is built in: traced from the listing's floorplan, checked against its photos, placed on its plot from the OS map with the neighbours, and orientated to the compass so the sun study is right. The listing's floorplan and 37 photos are bundled (**Photos → Load listing 91770873 photos**). `reference/listing-91770873/NOTES.md` records the facts used and where each came from.

## Using it

- **Floorplans**: extract a plan with AI, trace by hand, or load the built-in listing. **Proposed** can start as a copy of As listed.
- **Check plan** (the plan editor): drag corners and openings, draw rooms and walls, and add doors, windows, French and bi-fold doors and bays. Pinch or scroll to zoom and drag to pan. Each room shows its area and the selected room its edge lengths. Tap an edge length to type a new one, or type a room's width and depth. **Measure** gives the distance between two points. The room inspector has notes, floor finish, wall paint, outside finish and an "unheated" flag. The furniture catalogue has UK sizes; items snap to walls and can be resized, recoloured, rotated and duplicated.
- **3D view**: orbit, or use the camera presets for street-level elevations. **View** holds side by side and overlay compare, walk mode, which floors to show, labels, ceilings, the exterior and the site.
- **Walk**: WASD (Shift to run) or the on-screen joystick on touch screens. Drag to look, and double-tap to glide to a spot. Walls block you, and the stairs take you between floors.
- **Exterior**: hipped or gabled roof, party wall side, tiles, fascias and gutters, the tiled skirt round single-storey flat roofs, porch canopies, extension roofs and chimneys.
- **Site**: plot boundary, fences and walls, garden surfaces and neighbouring houses, edited on a plan with distances to the boundary. The **Sun study** shows the sun and shadows for any day and time, and how many hours of sun each part of the garden gets.
- **Photos**: match listing photos to rooms (with AI or by hand); they appear as pins in 3D and can be used as floor textures.
- **Report**: room, floor and house areas for both variants. It also checks the model's area, measured the way a listing measures it, against the listing's printed total, and gives the heated area. It lists the changes from As listed to Proposed, flagging likely structural work, and gives a rough cost from your own rates. The exports are PNG snapshots, scale plan drawings (SVG), a print / save-as-PDF report, a .glb 3D model and a CSV of the changes.
- **Settings**: API key and model, render quality (lower it on older iPads), and project export and import as JSON (images included).

## How it works

- `src/ai/`: floorplan extraction and photo matching with structured outputs. The SDK only loads when you first use AI.
- `src/lib/`: pure, tested logic. `geometry.ts` (plan to world, walls, openings cut into walls), `walls.ts` and `openings.ts` (wall shells, frames, doors and bays), `roof.ts` and `roofParts.ts` (roof planning and parts), `site.ts` and `sun.ts`, `walk.ts` (collision and stairs), `planMath.ts` (editor maths), `report.ts` and `export.ts` (areas, change list, costs, plan SVGs, CSV).
- `src/three/`: react-three-fiber scene, with procedural textures generated once and cached, and one merged mesh per material per floor.
- `src/editor/`: the SVG plan and site editors.
- State lives in a zustand store persisted to IndexedDB. Images are stored separately, and writes are debounced and flushed when the page hides. Model edits can be undone.

## Limits

- Coordinates from a vision model are approximate. Expect to nudge a few corners in **Check plan** on a busy plan.
- Room areas in the tables run to the wall centre lines. The "measured like the listing" figure in the Report is the one to compare with a listing or an EPC.
- Rough costs use only the rates you enter. They are not a quote, and the structural flags are prompts to get advice, not advice.
- The photos are used as reference and texture only; there is no photogrammetry.
