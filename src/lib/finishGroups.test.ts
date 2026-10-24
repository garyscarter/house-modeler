import { describe, expect, it } from "vitest";
import { FLOOR_GROUPS, FLOOR_TILE_NAME, WALL_GROUPS, WALL_TILE_NAME, groupOf } from "./finishGroups";
import { FLOOR_FINISH_LABEL, WALL_COVERING_LABEL } from "../types";

describe("finish groups", () => {
  it("list every floor finish exactly once", () => {
    const all = FLOOR_GROUPS.flatMap((g) => g.items).sort();
    expect(all).toEqual(Object.keys(FLOOR_FINISH_LABEL).sort());
    expect(Object.keys(FLOOR_TILE_NAME).sort()).toEqual(all);
  });

  it("list every wall covering exactly once", () => {
    const all = WALL_GROUPS.flatMap((g) => g.items).sort();
    expect(all).toEqual(Object.keys(WALL_COVERING_LABEL).sort());
    expect(Object.keys(WALL_TILE_NAME).sort()).toEqual(all);
  });

  it("find a finish's group", () => {
    expect(groupOf(FLOOR_GROUPS, "herringbone").id).toBe("wood");
    expect(groupOf(WALL_GROUPS, "metro").id).toBe("tile");
    expect(groupOf(WALL_GROUPS, "paint").id).toBe("paint");
  });
});
