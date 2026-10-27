import { toggleLink, pruneLinks, pruneCircuits } from "../../lib/electrics";
import type { HouseModel } from "../../types";

/** The model with `lightId` linked to (or unlinked from) gang `gang` of the switch `switchId`, wherever the switch is; the same object when no floor holds the switch. */
export function toggleLinkInModel(model: HouseModel, switchId: string, lightId: string, gang = 0): HouseModel {
  let changed = false;
  const floors = model.floors.map((f) => {
    if (!(f.fixtures ?? []).some((x) => x.id === switchId)) return f;
    changed = true;
    return { ...f, fixtures: (f.fixtures ?? []).map((x) => (x.id === switchId ? { ...x, ...toggleLink(x, lightId, gang) } : x)) };
  });
  return changed ? { ...model, floors } : model;
}

/**
 * The model after fixtures were deleted: switch `controls` and circuit `points` that name nothing now are dropped
 * (the same object when there is nothing to drop, which is every model without links or circuits).
 */
export function pruneDeleted(model: HouseModel): HouseModel {
  const linked = pruneLinks(model);
  const circuits = pruneCircuits(linked);
  return circuits === linked.circuits ? linked : { ...linked, circuits };
}
