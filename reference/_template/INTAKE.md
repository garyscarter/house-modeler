# Intake for <id>

The support act (Ed Sheeran). About 30 minutes, no Claude needed. Fill this in, drop the files in the places below, then run `/eras-tour`. Tick each checklist item (change `- [ ]` to `- [x]`) as you finish it; `npm run welcome` shows what is still open.

## The slug (Perfect)

The folder id: lowercase letters, digits and hyphens, 3 to 40 characters, never an address, street, postcode or a person's name. Good: `my-semi`, `the-barn`, `flat-4b`. Bad: anything that says where it is or whose it is.

- Slug: `__________`
- Display name shown in the app (also not an address): `__________`

## Where files go

- `reference/<id>/` holds everything you were given: the floorplan(s), the map, `photos/`, anything raw. Put your files here and leave them as they are; Claude does not change or delete them. It is committed with the house (later sessions need the photos) but is not shipped in the app.
- Debut copies the floorplan into `src/houses/<id>/assets/` for you. Photos are never put there.

## Checklist

### Shape of You: the floorplan
- [ ] Floorplan image(s) in `reference/<id>/` (one per floor, or both floors on one image)
- [ ] Printed room sizes are visible on the plan: yes / no
- [ ] Floors supplied: `__________` (ground, first, loft, basement ...)
- [ ] Printed total area, if given: `______ m2`

### Photograph: the photos
- [ ] Every room, at least one photo each, named `<room>-<n>.jpg` (for example `kitchen-1.jpg`, `bedroom-2-1.jpg`, `hall-stairs-1.jpg`); Claude names the rest
- [ ] Every outside face, named `front-<n>.jpg`, `rear-<n>.jpg`, `side-<n>.jpg`
- [ ] The garden and the street view, if you have them (`garden-<n>.jpg`)
- [ ] Rooms with no photo: `__________`
- [ ] Check no photo shows the house number, a name plate or a car number plate, or tick that you are happy for those to be in the repo.

### Castle on the Hill: the map
- [ ] A north-up map of the plot with a scale: title plan, an OS-based map, or a satellite screenshot showing the scale bar. Save in `reference/<id>/` as `map.png`
- [ ] Scale (as printed or measured): `______` (for example "scale bar 10 m = 120 px")
- [ ] Source of the map: `__________`

### Thinking Out Loud: twelve questions
1. Attached or detached, and if attached, on which side (looking at the front)? `__________`
2. Which way does the front face (compass direction, roughly)? `__________`
3. Garage: none / integral / separate, and where? `__________`
4. Extensions (built or planned), and which parts are newer than the rest? `__________`
5. Year built: `__________`
6. Storeys (including loft or basement): `__________`
7. Ceiling heights, if you know them (ground / first): `__________`
8. The stairs: straight or turning; winders (angled steps) at the foot, the head, both or neither; which way it rises from the hall (for example "up towards the back, turning left at the top"): `__________`
9. Location: the nearest town, or latitude and longitude to two decimals (nothing more precise; this sets the sun): `__________`
10. Boundaries, each as wall / fence / hedge / open, with a rough height: front `__________`, left `__________`, right `__________`, rear `__________` (left and right as seen from the road)
11. The bay or any other projection (porch, oriel, bay window): its shape (canted with angled sides, square, curved) and which rooms: `__________`
12. What do you want to change, and anything the floorplan gets wrong? `__________`

Where the files are (a folder, a download link, already in place): `__________`

### Perfect: ready to go
- [ ] Slug chosen and the folder `reference/<id>/` exists (copy of `reference/_template/`)
- [ ] Every box above ticked or marked "not available"
- [ ] No address, postcode, title number or person's name in any file name or in this file
