import { describe, expect, it } from "vitest";
import { dehydrate, refIds, rehydrate } from "./persist";

const big = (c: string) => "data:image/png;base64," + c.repeat(2000);

describe("image refs", () => {
  it("replaces large data URLs with refs and restores them", () => {
    const img = big("A");
    const state = { variants: { current: { floors: [{ image: img }, { image: img }] } }, photos: [{ dataUrl: big("B"), name: "x" }], note: "data:small" };
    const ids = new Map<string, string>();
    const { json, used } = dehydrate(state, (u) => ids.get(u) ?? (ids.set(u, "id" + ids.size), ids.get(u)!));
    expect(used.size).toBe(2);
    expect(json.length).toBeLessThan(500);
    expect(refIds(json).sort()).toEqual([...used].sort());
    const byId = new Map([...ids].map(([u, i]) => [i, u]));
    expect(rehydrate(json, (id) => byId.get(id))).toEqual(state);
  });

  it("substitutes a placeholder for a missing image", () => {
    const out = rehydrate('{"image":"@@img:gone"}', () => undefined) as { image: string };
    expect(out.image.startsWith("data:image/png")).toBe(true);
  });
});
