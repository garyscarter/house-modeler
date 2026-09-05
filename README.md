# House Modeler

A throwaway, browser-only tool for visualising a house you are thinking of buying and the renovations you have in mind.

Upload the floorplan image from the listing and Claude reads it into rooms, doors, windows and printed dimensions. The app scales the plan from those dimensions and extrudes it into a 3D "dollhouse" you can orbit around or walk through at eye level. Upload the listing photos and Claude works out which room each one shows, so they appear as pins in the 3D view and can be used as floor textures. Upload a second, redrawn floorplan as the "Proposed" variant to compare against the original side by side or as a red ghost overlay.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints. The app works without any key if you trace the floorplan by hand. For AI extraction and photo matching, go to **Settings** and paste an Anthropic API key from https://platform.claude.com. The key is stored only in your browser (IndexedDB) and requests go straight from the page to the Anthropic API. Because of that, never deploy this with a key baked in or on a shared host.

`npm run build` produces a static site in `dist/` that can be served from anywhere, including GitHub Pages.

## Workflow

1. **Floorplans → As listed**: either **Extract with AI** (needs the API key; 30 to 90 seconds, multi-floor images handled) or **Trace by hand (no AI)**. Tracing opens the plan editor on the image: pick **Rectangle room** and click two opposite corners for each room (corners snap to existing ones so walls line up), use **Polygon room** for L-shapes, add doors and windows, then either enter the printed sizes on a couple of rooms and press **Scale from printed sizes**, or use **Calibrate scale**. Add more floors with **Add a floor to trace by hand**.
2. **Check plan**: the extracted geometry is drawn over the original image. Drag corners or openings that are off, add missing doors or windows, rename rooms, or click **Calibrate scale** and pick two points a known distance apart if the printed dimensions were not picked up.
3. **Photos**: add the listing photos, then **Match photos to rooms**. Fix any wrong guesses with the dropdown under each photo. In a room's inspector you can choose a photo as its floor texture.
4. **Floorplans → Proposed**: upload your redrawn plan. Then use **Side by side** or **Overlay** in the 3D view.
5. **Walk**: pick a floor, click the view, and move with WASD. Esc releases the mouse.
6. **Settings → Export JSON** saves the whole project, including images, to a file you can import later.

## How it works

- `src/ai/extract.ts` overlays a labelled 0–1000 coordinate grid on the floorplan and asks Claude for structured JSON (rooms as polygons, openings, dimensions) using structured outputs. Coordinates are snapped so shared walls line up, and the pixel-per-metre scale is the median estimate from every room that has printed dimensions.
- `src/lib/geometry.ts` converts room polygons to world metres, merges overlapping room edges into single walls, attaches doors and windows to the nearest wall, and cuts openings.
- `src/three/` renders it with react-three-fiber: slabs, walls, door leaves, glazing, stairs, labels and photo pins.
- `src/editor/PlanEditor.tsx` is the SVG check-and-fix view.
- State lives in a zustand store persisted to IndexedDB, so a refresh keeps your work.

## Limits

- Coordinates from a vision model are approximate. Expect to nudge a few corners in **Check plan** on a busy plan.
- There is no roof, garden or exterior detailing. Floors stack by the centre of their footprint; use the per-floor stacking offset if the upper floor sits wrong.
- The photos are used as reference and texture only; there is no photogrammetry.
