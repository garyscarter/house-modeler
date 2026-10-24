import { describe, expect, it, vi } from "vitest";
import { dehydrate, dropAiSettings, imageAwareStorage, refIds, rehydrate, saveFailureMessage, useStorageStatus } from "./persist";

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
      type St = { photos: string[]; n: number };
      const a = imageAwareStorage<St>(10, 50, { locks: null });
      const b = imageAwareStorage<St>(10, 50, { locks: null });
      a.setItem("k", { state: { photos: [], n: 1 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      b.setItem("k", { state: { photos: [big("B")], n: 1 }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(imgKeys()).toHaveLength(1);
      a.setItem("k", { state: { photos: [], n: 2 }, version: 1 });
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
      type St = { photos: string[] };
      const a = imageAwareStorage<St>(10, 50, { locks: null });
      a.setItem("k", { state: { photos: [big("A"), big("C")] }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(imgKeys()).toHaveLength(2);
      a.setItem("k", { state: { photos: [big("A")] }, version: 1 });
      await vi.advanceTimersByTimeAsync(100);
      expect(imgKeys()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("single writer and status", () => {
  const fakeLocks = (available: boolean) => {
    const waiting: (() => void)[] = [];
    let free = available;
    return {
      open: () => {
        free = true;
      },
      locks: {
        request: ((_n: string, _o: unknown, cb: (l: unknown) => unknown) => {
          if (!free) return Promise.resolve(cb(null));
          free = false;
          waiting.length = 0;
          return Promise.resolve(cb({ name: "storey-writer" }));
        }) as unknown as LockManager["request"],
      },
    };
  };

  it("does not write without the lock, then flushes once it gets it", async () => {
    vi.useFakeTimers();
    try {
      db.clear();
      useStorageStatus.setState({ kind: "idle" }, true);
      const fl = fakeLocks(false);
      const s = imageAwareStorage<{ n: number }>(10, 50, { locks: fl.locks });
      await vi.advanceTimersByTimeAsync(5);
      expect(useStorageStatus.getState().kind).toBe("readonly");
      s.setItem("w", { state: { n: 1 }, version: 1 });
      await vi.advanceTimersByTimeAsync(200);
      expect(db.has("w")).toBe(false);
      fl.open();
      s.setItem("w", { state: { n: 2 }, version: 1 }); // a change retries the lock
      await vi.advanceTimersByTimeAsync(200);
      expect(db.has("w")).toBe(true);
      expect(useStorageStatus.getState().kind).toBe("ok");
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
