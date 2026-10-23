import { describe, expect, it, vi } from "vitest";
import { dehydrate, dropAiSettings, imageAwareStorage, refIds, rehydrate } from "./persist";

const saved = vi.hoisted(() => [] as string[]);
vi.mock("idb-keyval", () => ({
  setMany: async (entries: [string, unknown][]) => void saved.push(...entries.map(([k]) => k)),
  keys: async () => [],
  delMany: async () => {},
  del: async () => {},
  get: async () => undefined,
  getMany: async () => [],
}));

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

describe("imageAwareStorage", () => {
  it("still saves at least every couple of seconds while updates keep coming", async () => {
    vi.useFakeTimers();
    try {
      const storage = imageAwareStorage<{ n: number }>(400, 2000);
      saved.length = 0;
      for (let t = 0; t < 5000; t += 16) {
        storage.setItem("k", { state: { n: t }, version: 1 });
        await vi.advanceTimersByTimeAsync(16);
      }
      expect(saved.filter((k) => k === "k").length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips a save when no persisted field changed", async () => {
    vi.useFakeTimers();
    try {
      const storage = imageAwareStorage<{ a: object; b: number }>(400, 2000);
      saved.length = 0;
      const a = {};
      storage.setItem("same", { state: { a, b: 1 }, version: 1 });
      await vi.advanceTimersByTimeAsync(1000);
      storage.setItem("same", { state: { a, b: 1 }, version: 1 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(saved.filter((k) => k === "same")).toHaveLength(1);
      storage.setItem("same", { state: { a, b: 2 }, version: 1 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(saved.filter((k) => k === "same")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("dropAiSettings", () => {
  it("removes the API key and model but keeps other settings", () => {
    expect(dropAiSettings({ apiKey: "sk-ant-secret", model: "m", quality: "low" })).toEqual({ quality: "low" });
  });

  it("leaves missing settings alone", () => {
    expect(dropAiSettings(undefined)).toBeUndefined();
  });
});
