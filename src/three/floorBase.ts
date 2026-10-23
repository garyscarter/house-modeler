import type { Floor, HouseModel } from "../types";

/** Height of a floor's finished level above the ground floor's slab top, metres. */
export function floorBaseY(model: HouseModel, floor: Floor) {
  return floor.level * (model.ceilingHeight + model.slabThickness);
}
