/**
 * How far a drawn ceiling hangs below the underside of the slab above, metres.
 *
 * The slab over a room is extruded from exactly the ceiling height upwards, so a
 * ceiling drawn at that height shares a plane with the slab's dark underside and
 * the two z-fight: the room's ceiling showed as ragged dark brown wherever a
 * floor lay above it. A few millimetres of clearance is invisible but enough for
 * the depth buffer at room distances.
 */
export const CEILING_DROP = 0.008;

/** Height above the floor at which a room's ceiling is drawn. */
export function ceilingY(ceilingHeight: number): number {
  return ceilingHeight - CEILING_DROP;
}
