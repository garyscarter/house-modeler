# Listing 91770873: reference notes

Facts used to build the built-in model (`src/lib/houses/listing91770873.ts`), and where each came from. Assets are in `src/assets/listing-91770873/` (the listing's floorplan and 37 photos).

## The house

- 1928 interwar semi-detached house, joined to No. 26 (the corner plot) on the plan's right (east). Garage side faces the west neighbour.
- Two-storey part: cream render, hipped roof at the garage end, flush at the party wall, concrete interlocking tiles, brown uPVC fascias, gutters and windows. One brick chimney stack on the party wall near the ridge (chimney breasts on that wall on both floors of the plan).
- Single-storey part (garage, galley, front hall): red brick at the front, rendered at the rear. Flat roof, dressed across the whole front (porch, garage and hall) with one tiled slope under one fascia and gutter line; the porch over the drive is under the same roof, on a brick pier at its front-left corner (front-2, front-3, front-street).
  - The slope rises about 0.9 m at about 30°, all the way up to the two-storey wall over the hall, with a thin flashing where it meets it (front-1, front-street). Measured against the garage door in front-street, the fascia's underside is about 2.2 m above the garage floor and the top of the slope about 3.2 m.
  - Hipped at both ends, with hip tiles. On the right the hip runs back to the two-storey wall beside the bay, with a downpipe in that corner (front-1, front-2). The left end is hipped over the pier and the gutter turns the corner (front-3); how far the slope returns down the garage side is not visible (it faces the boundary). The model assumes 2 m.
  - The rear photos (rear-1, rear-4) show nothing rising above the plain flat edge at the back, so the slope does not run the length of the garage side.
  - Brown fascia about 0.2 m deep below a brown half-round gutter. Under the porch, the garage's front wall around the door is cream render, not brick (front-3).
- Front door: dark brown with glazed panels, on the side of the front hall projection under the porch canopy. Garage door: red, up-and-over.
- Canted bay on the front living room with a small canopy roof.
- The 2.0 m opening between the two living rooms is an open, square-headed archway with no doors (not bi-folds), lined and trimmed on both faces in dark stained timber. In living-front-1 its head is about 2.1 m (about 87% of the 2.4 m ceiling) and its overall width, architraves included, about 2.2 m; the model keeps the 2.0 m traced width and a 2.1 m head, drawn as the "archway" opening kind (living-rear-1, living-front-1, living-rear-3).

## Size and scale

- Floorplan (Giraffe360): approximate total area 113.9 m² (RICS IPMS 3C), garage included. The EPC repeats 114 m².
- Model measured inside the outside walls comes to about 110 m² with the garage: within about 3%.
- Floorplan image is 2000 × 1414 px; the tracing uses 73 px/m. Coordinates are wall centre lines.

## Orientation and plot

Measured from the OS-based map in the drainage and water search (north-up), scaled so the house outline matches the traced model (agreement within about 0.15 m). Map accuracy is roughly ±0.3 m.

- Front faces a compass bearing of about 162° (south-south-east); the garden faces about 342°. The floorplan's own compass says about 171°.
- Plot about 10.6 m wide and 16.7–17.6 m deep (the rear boundary is skewed). The house fills the plot's width: the garage wall is on the west boundary, the party wall on the east.
- Rear garden about 5.8–6.6 m deep; front garden about 2.6 m in front of the hall and 4.3 m in front of the bay.
- The west side of the drive is a brick wall, not a fence: the same red brick and coping as the front garden wall, about 1 m high at the pavement, running back into the brick pier at the garage's front-left corner, which rises out of the end of the wall (the model ends the wall under the porch pillar, its street face flush with the pillar's) (front-1, front-2, front-3). It appears to step up slightly toward the pier; the model uses a plain 1 m wall. Behind the pier the boundary is a timber fence again (front-3). The model splits the west edge at about 4.3 m back from the pavement line.
- The drive rises gently from the pavement to the garage door; there is no step up to the garage (front-3, front-street), only a thin threshold, and the front door's landing under the porch sits on the same slope (a small step at most). The model ramps the drive from ground level at the pavement to 0.24 m at the garage door (about 1 in 18 over 4.3 m), 0.02 m under the ground floor's finished level, which is 0.26 m above the ground, so the front door (about 2 m back from the pavement) has a step of about 0.07 m. A paved strip along the front of the hall, kerbed from the lawn (front-3), carries on from the drive's east edge at the drive's height (0.16 m falling to 0.11 m away from the wall). Both levels are estimates from the photos. The 1 m drive wall keeps a level top, so on the drive side it stands about 0.85 m above the drive at the pier.
- The garden walls have no concrete coping and no regular piers: the top is a course of red bricks laid on edge, slightly weathered. The model draws this as `top: "brick"`, `piers: false` on every wall edge. The two rear walls carry a pierced block panel on top that cannot be drawn, so they use the same brick-on-edge top as the closest match.
- Other boundaries (all from the photos; positions along each edge are estimates):
  - Front: brick wall with coping, about 0.9 m, across the front garden (front-1, front-2, front-garden); open drive. Unchanged.
  - East, back garden: a brick wall with a pierced decorative block panel, about 1.4 m, beside No. 26's conservatory (rear-3), modelled from the house's rear corner to the conservatory's far end. The panel itself cannot be drawn (plain wall). Further back the boundary is not visible in any photo (fence kept).
  - East, along the party wall and front garden: not visible (fence kept).
  - West, at the back of the house: a brick wall about 1.3 m with a decorative block panel along the top and a grey bin store against it (rear-1, rear-2, rear-4), then a hedge, about 2 m, further back. The panel and bin store are not drawn. rear-garden looks east along the house from the west end of the patio, not along the west boundary: the shrub bed and conifer on its left are the raised bed below, which runs parallel to the house, and the conservatory in the distance is No. 26's.
  - Rear garden layout (rear-garden, rear-2, rear-3, rear-4; the raised brick bed confirmed by the owner): the patio runs about 4 m out from the rear wall to a long raised brick-kerbed shrub bed with a conifer, parallel to the house across the garden width (modelled as a bed 0.9 m deep and 0.3 m raised, from z -9.6 to -10.5; the depth, kerb height and planting are estimates). A curved raised brick planter stands in front of the patio doors by the east wall (modelled as a 3 x 1.6 m ellipse polygon, 0.3 m raised). The conifer is not drawn.
  - Rear: not visible in any photo (fence kept).
- West neighbour's wall is about 1.8 m beyond our garage wall.
- No. 26: main block mirrors ours (about 6.4 m wide), a single-storey conservatory about 2.8 × 3.8 m on the shared boundary at the rear, and a set-back side extension.
- A building backs onto the rear-left corner of the garden.

The world-frame coordinates are in `listingSite()`. `scripts/` holds the image analysis used to get them (plot corners, house outline profile, neighbour profiles) and the overlay of the traced model on the floorplan.

## From the searches and EPC (context, not modelled)

- In a river flood zone 2 or 3 (at the edge); a coal-mining reporting area; no public sewers or water mains within the boundary.
- EPC: rating C (69), cavity walls (main house uninsulated, extension insulated), 100 mm loft insulation, solid floor, gas boiler.
- The 1928 conveyance has a covenant against altering the external plan or elevation without the original company's consent, and a £5 a year rentcharge: questions for the conveyancer, not the model.
