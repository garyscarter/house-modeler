import { describe, expect, it, vi } from "vitest";
import { REFRESHED, TAKEN_OVER, dehydrate, dropAiSettings, imageAwareStorage, refIds, rehydrate, saveFailureMessage, useStorageStatus } from "./persist";

const saved = vi.hoisted(() => [] as string[]);
const db = vi.hoisted(() => new Map<string, unknown>());
const failNext = vi.hoisted(() => ({ error: null as Error | null }));
vi.mock("idb-keyval", () => ({
  setMany: async (entries: [string, unknown][]) => {
    if (failNext.error) throw failNext.error;
    for (const [k, v] of entries) {
      db.set(k, v);
      saved.push(k);
    }
  },
  keys: async () => [...db.keys()],
  delMany: async (ks: string[]) => void ks.forEach((k) => db.delete(k)),
  del: async (k: string) => void db.delete(k),
  get: async (k: string) => db.get(k),
  getMany: async (ks: string[]) => ks.map((k) => db.get(k)),
}));

const big = (c: string) => "data:image/png;base64," + c.repeat(2000);

describe("image refs", () => {
  it("replaces large data URLs with refs and restores them", () => {
    const img = big("A");
    const state = { variants: { current: { floors: [{ image: img }, { image: img }] } }, gallery: [{ dataUrl: big("B"), name: "x" }], note: "data:small" };
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
      const storage = imageAwareStorage<{ n: number }>(400, 2000, { locks: null });
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
      const storage = imageAwareStorage<{ a: object; b: number }>(400, 2000, { locks: null });
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

const imgKeys = () => [...db.keys()].filter((k) => k.startsWith("house-modeler/img/"));

describe("image GC across tabs", () => {
  it("never deletes an image this tab has not seen", async () => {
    vi.useFakeTimers();
    try {
      db.clear();
      type St = { gallery: string[]; n: number };
      const a = imageAwareStorage<St>(10, 50, { locks: null });
      const b = imageAwareStorage<St>(10, 50, { locks: null });
      a.setItem("k", { state: { gallery: [], n: 1 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      b.setItem("k", { state: { gallery: [big("B")], n: 1 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(imgKeys()).toHaveLength(1);
      a.setItem("k", { state: { gallery: [], n: 2 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(imgKeys()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still deletes an image this tab stopped using", async () => {
    vi.useFakeTimers();
    try {
      db.clear();
      type St = { gallery: string[] };
      const a = imageAwareStorage<St>(10, 50, { locks: null });
      a.setItem("k", { state: { gallery: [big("A"), big("C")] }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(imgKeys()).toHaveLength(2);
      a.setItem("k", { state: { gallery: [big("A")] }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(imgKeys()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("images from before photos were removed", () => {
  it("drops photo images no longer referenced, and keeps the floorplan image", async () => {
    vi.useFakeTimers();
    try {
      db.clear();
      type St = { variants: { current: { image: string } } };
      const prefix = "house-modeler/img/";
      const plan = big("P");
      // An old save: a floorplan image (id plan1) and two photo images (ids ph1, ph2), all stored as refs.
      db.set(prefix + "plan1", plan);
      db.set(prefix + "ph1", big("Q"));
      db.set(prefix + "ph2", big("R"));
      db.set("k", JSON.stringify({ state: { variants: { current: { image: "@@img:plan1" } }, photos: [{ dataUrl: "@@img:ph1" }, { dataUrl: "@@img:ph2" }] }, version: 6 }));
      const a = imageAwareStorage<St>(10, 50, { locks: null });
      const raw = JSON.parse(db.get("k") as string);
      expect(raw.state.photos).toHaveLength(2);
      await a.getItem("k");
      // The migrated state has no photos, so the next save lets go of their images.
      a.setItem("k", { state: { variants: { current: { image: plan } } }, version: 7 });
      await vi.advanceTimersByTimeAsync(100);
      expect([...db.keys()].filter((k) => k.startsWith(prefix))).toEqual([prefix + "plan1"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("single writer and status", () => {
  /** A lock manager for one name: a holder, and `steal` evicting it (its request promise rejects, as the Web Locks API does). */
  const fakeLocks = () => {
    let evict: (() => void) | null = null;
    return {
      held: () => evict !== null,
      locks: {
        request: ((_n: string, o: { steal?: boolean; ifAvailable?: boolean }, cb: (l: unknown) => unknown) => {
          if (evict) {
            if (!o.steal) return Promise.resolve(cb(null));
            evict();
          }
          return new Promise<unknown>((resolve, reject) => {
            evict = () => {
              evict = null;
              reject(Object.assign(new Error("stolen"), { name: "AbortError" }));
            };
            void Promise.resolve(cb({ name: "storey-writer" })).then(resolve, reject);
          });
        }) as unknown as LockManager["request"],
      },
    };
  };

  it("takes the lock from another tab on opening, and that tab stops saving and says so", async () => {
    vi.useFakeTimers();
    try {
      db.clear();
      useStorageStatus.setState({ kind: "idle" }, true);
      const fl = fakeLocks();
      const a = imageAwareStorage<{ n: number }>(10, 50, { locks: fl.locks });
      await vi.advanceTimersByTimeAsync(5);
      a.setItem("w", { state: { n: 1 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(JSON.parse(db.get("w") as string).state.n).toBe(1);
      // A second tab opens: it becomes the writer; the first is told.
      const b = imageAwareStorage<{ n: number }>(10, 50, { locks: fl.locks });
      await vi.advanceTimersByTimeAsync(5);
      expect(useStorageStatus.getState()).toMatchObject({ kind: "readonly", message: TAKEN_OVER });
      b.setItem("w", { state: { n: 2 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(JSON.parse(db.get("w") as string).state.n).toBe(2);
      // The first tab's change is not written while the second holds the lock... until it takes it back.
      a.setItem("w", { state: { n: 3 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(fl.held()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("on taking the lock back, loads newer saved work instead of writing over it", async () => {
    vi.useFakeTimers();
    try {
      db.clear();
      useStorageStatus.setState({ kind: "idle" }, true);
      const fl = fakeLocks();
      let reloaded = 0;
      const a = imageAwareStorage<{ n: number }>(10, 50, { locks: fl.locks, onTakeover: () => void reloaded++ });
      await vi.advanceTimersByTimeAsync(5);
      a.setItem("w", { state: { n: 1 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      const b = imageAwareStorage<{ n: number }>(10, 50, { locks: fl.locks });
      await vi.advanceTimersByTimeAsync(5);
      await b.getItem("w");
      b.setItem("w", { state: { n: 2 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(JSON.parse(db.get("w") as string).state.n).toBe(2);
      // Tab a changes something: it takes the lock, finds b's newer save, and reloads rather than writing n = 3.
      a.setItem("w", { state: { n: 3 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(reloaded).toBe(1);
      expect(JSON.parse(db.get("w") as string).state.n).toBe(2);
      expect(useStorageStatus.getState()).toMatchObject({ kind: "ok", message: REFRESHED });
      // Now a is the writer with the saved project: its next change is written.
      a.setItem("w", { state: { n: 4 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(JSON.parse(db.get("w") as string).state.n).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a failed save and recovers on the next one", async () => {
    vi.useFakeTimers();
    try {
      db.clear();
      const s = imageAwareStorage<{ n: number }>(10, 50, { locks: null });
      const err = new Error("full");
      err.name = "QuotaExceededError";
      failNext.error = err;
      s.setItem("f", { state: { n: 1 }, version: 1 });
      await vi.advanceTimersByTimeAsync(200);
      expect(useStorageStatus.getState()).toMatchObject({ kind: "failed", message: "Couldn't save on this device: storage is full" });
      failNext.error = null;
      s.setItem("f", { state: { n: 1 }, version: 1 }); // same state still retries
      await vi.advanceTimersByTimeAsync(200);
      expect(useStorageStatus.getState().kind).toBe("ok");
      expect(db.has("f")).toBe(true);
    } finally {
      failNext.error = null;
      vi.useRealTimers();
    }
  });

  it("names other errors by their name", () => {
    expect(saveFailureMessage(Object.assign(new Error("x"), { name: "InvalidStateError" }))).toBe("Couldn't save on this device: InvalidStateError");
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
