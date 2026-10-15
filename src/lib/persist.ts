import { del, delMany, get, getMany, keys, setMany } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { uid } from "../types";

/**
 * Storage for the zustand persist middleware that keeps large images out of
 * the main state blob and debounces writes.
 *
 * Floorplan images and photos are data URLs of several MB. Writing them on
 * every state change (each pointer move while dragging a corner) made saving
 * slow, so each distinct data URL is stored once under its own key and the
 * state JSON carries a short reference instead.
 */

/** Prefix that marks a reference to an image stored under its own key. */
export const IMG_REF = "@@img:";
const IMG_KEY_PREFIX = "house-modeler/img/";
/** Strings shorter than this stay inline. */
const MIN_INLINE = 512;
/** 1x1 transparent PNG used when a referenced image is missing. */
const MISSING_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const isImageData = (v: unknown): v is string => typeof v === "string" && v.length > MIN_INLINE && v.startsWith("data:");

/** Serialise `value`, replacing large data URLs with references. Pure apart from `idOf`. */
export function dehydrate(value: unknown, idOf: (url: string) => string): { json: string; used: Set<string> } {
  const used = new Set<string>();
  const json = JSON.stringify(value, (_k, v) => {
    if (!isImageData(v)) return v;
    const id = idOf(v);
    used.add(id);
    return IMG_REF + id;
  });
  return { json, used };
}

/** Image ids referenced by a serialised state. */
export function refIds(json: string): string[] {
  const out = new Set<string>();
  const re = /"@@img:([A-Za-z0-9_-]+)"/g;
  for (let m = re.exec(json); m; m = re.exec(json)) out.add(m[1]);
  return [...out];
}

/** Parse a serialised state, swapping references back for data URLs. */
export function rehydrate(json: string, urlOf: (id: string) => string | undefined): unknown {
  return JSON.parse(json, (_k, v) => (typeof v === "string" && v.startsWith(IMG_REF) ? urlOf(v.slice(IMG_REF.length)) ?? MISSING_IMAGE : v));
}

export function imageAwareStorage<S>(delayMs = 400, maxWaitMs = 2000): PersistStorage<S> {
  const urlToId = new Map<string, string>();
  /** Ids known to be written to IndexedDB. */
  const written = new Set<string>();
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** When the oldest unsaved change was made, so a stream of updates (the sun animation) can't hold off saving for ever. */
  let since: number | null = null;
  let chain: Promise<void> = Promise.resolve();

  const idOf = (url: string) => {
    let id = urlToId.get(url);
    if (!id) {
      id = uid();
      urlToId.set(url, id);
    }
    return id;
  };

  const flush = (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const job = pending;
    pending = null;
    since = null;
    if (!job) return chain;
    chain = chain
      .then(async () => {
        const { json, used } = dehydrate(job.value, idOf);
        const fresh = [...used].filter((id) => !written.has(id));
        if (fresh.length) {
          const urlById = new Map<string, string>();
          for (const [url, id] of urlToId) if (used.has(id)) urlById.set(id, url);
          await setMany(fresh.map((id) => [IMG_KEY_PREFIX + id, urlById.get(id)!]));
          fresh.forEach((id) => written.add(id));
        }
        await setMany([[job.name, json]]);
        // Drop images nothing refers to any more (removed photos, replaced plans).
        const stale = (await keys()).filter(
          (k): k is string => typeof k === "string" && k.startsWith(IMG_KEY_PREFIX) && !used.has(k.slice(IMG_KEY_PREFIX.length)),
        );
        if (stale.length) {
          await delMany(stale);
          const gone = new Set(stale.map((k) => k.slice(IMG_KEY_PREFIX.length)));
          gone.forEach((id) => written.delete(id));
          for (const [url, id] of urlToId) if (gone.has(id)) urlToId.delete(url);
        }
      })
      .catch((e) => console.error("Saving the project failed", e));
    return chain;
  };

  if (typeof window !== "undefined") {
    // Save straight away when the tab is hidden or closed.
    window.addEventListener("pagehide", () => void flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush();
    });
  }

  return {
    getItem: async (name) => {
      const raw = await get<string>(name);
      if (!raw) return null;
      const ids = refIds(raw);
      const urls = ids.length ? await getMany<string | undefined>(ids.map((id) => IMG_KEY_PREFIX + id)) : [];
      const byId = new Map<string, string>();
      ids.forEach((id, i) => {
        const url = urls[i];
        if (!url) return;
        byId.set(id, url);
        urlToId.set(url, id);
        written.add(id);
      });
      return rehydrate(raw, (id) => byId.get(id)) as StorageValue<S>;
    },
    setItem: (name, value) => {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      since ??= Date.now();
      timer = setTimeout(() => void flush(), Math.max(0, Math.min(delayMs, since + maxWaitMs - Date.now())));
    },
    removeItem: async (name) => {
      pending = null;
      await del(name);
    },
  };
}
