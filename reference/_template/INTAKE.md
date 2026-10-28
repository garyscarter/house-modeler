# Intake for <id>

The support act (Ed Sheeran). About 30 minutes, no Claude needed. Fill this in, drop the files in the places below, then run `/eras-tour`.

## The slug (Perfect)

The folder id: lowercase letters, digits and hyphens, 3 to 40 characters, never an address, street, postcode or a person's name. Good: `my-semi`, `the-barn`, `flat-4b`. Bad: anything that says where it is or whose it is.

- Slug: `__________`
- Display name shown in the app (also not an address): `__________`

## Where files go

- `reference/<id>/` holds the sources you were given (agent PDFs, map screenshots, anything raw). It stays in the repo for reference and is not shipped in the app.
- `src/houses/<id>/assets/` holds the floorplan and photos that ship with the house. The floorplan is `floorplan.webp` (or .png/.jpg); photos go in `photos/`.

## Checklist

### Shape of You: the floorplan
- [ ] Floorplan image(s), one per floor, in `src/houses/<id>/assets/` (and the originals in `reference/<id>/`)
- [ ] Printed room sizes are visible on the plan: yes / no
- [ ] Floors supplied: `__________` (ground, first, loft, basement ...)
- [ ] Printed total area, if given: `______ m2`

### Photograph: the photos
- [ ] Every room, at least one photo each, named `<room>-<n>.jpg` (for example `kitchen-1.jpg`, `bedroom-2-1.jpg`, `hall-stairs-1.jpg`); Claude names the rest
- [ ] Every outside face, named `front-<n>.jpg`, `rear-<n>.jpg`, `side-<n>.jpg`
- [ ] The garden and the street view, if you have them (`garden-<n>.jpg`)
- [ ] Rooms with no photo: `__________`

### Castle on the Hill: the map
- [ ] A north-up map of the plot with a scale: title plan, an OS-based map, or a satellite screenshot showing the scale bar. Save in `reference/<id>/` as `map.png`
- [ ] Scale (as printed or measured): `______` (for example "scale bar 10 m = 120 px")
- [ ] Source of the map: `__________`

### Thinking Out Loud: ten questions
1. Attached or detached, and if attached, on which side (looking at the front)? `__________`
2. Which way does the front face (compass direction, roughly)? `__________`
3. Garage: none / integral / separate, and where? `__________`
4. Extensions (built or planned), and which parts are newer than the rest? `__________`
5. Year built: `__________`
6. Storeys (including loft or basement): `__________`
7. Ceiling heights, if you know them (ground / first): `__________`
8. What do you want to change? `__________`
9. Anything the floorplan gets wrong? `__________`
10. Where are the files (a folder, a download link, already in place)? `__________`

### Perfect: ready to go
- [ ] Slug chosen and the folder `reference/<id>/` exists (copy of `reference/_template/`)
- [ ] Every box above ticked or marked "not available"
- [ ] No address, postcode, title number or person's name in any file name or in this file
