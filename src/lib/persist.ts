import { create } from "zustand";
import { del, delMany, get, getMany, keys, setMany } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { uid } from "../types";

/**
 * Storage for the zustand persist middleware that keeps large images out of
 * the main state blob and debounces writes.
 *
 * Floorplan images are data URLs of several MB. Writing them on
 * every state change (each pointer move while dragging a corner) made saving
 * slow, so each distinct data URL is stored once under its own key and the
 * state JSON carries a short reference instead.
 */

/** Prefix that marks a reference to an image stored under its own key. */
export const IMG_REF = "@@img:";
export const IMG_KEY_PREFIX = "house-modeler/img/";
/** The image key prefix for a house's storage suffix ("" for the default house, "/<id>" otherwise). */
export const imgKeyPrefix = (suffix = ""): string => (suffix ? `house-modeler${suffix}/img/` : IMG_KEY_PREFIX);
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

export type StorageStatus = { kind: "idle" | "ok" | "failed" | "readonly"; message?: string; persistent?: boolean };

/** Whether the project is being saved on this device (shown in the House menu). */
export const useStorageStatus = create<StorageStatus>(() => ({ kind: "idle" }));
const setStatus = (s: StorageStatus) => useStorageStatus.setState(s, true);

/** Set when loading the saved project failed (corrupt blob, migration threw, IndexedDB unavailable). */
export const useHydration = create<{ error: unknown | null }>(() => ({ error: null }));

/** A plain-English reason a save failed. */
export function saveFailureMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : typeof e === "object" && e && "name" in e ? String((e as { name: unknown }).name) : "unknown error";
  return `Couldn't save on this device: ${name === "QuotaExceededError" ? "storage is full" : name}`;
}

export interface StorageOptions {
  /** Web Locks to use for the single-writer rule; null turns it off. Defaults to navigator.locks. */
  locks?: Pick<LockManager, "request"> | null;
  /**
   * Also delete image keys that nothing in the saved project references, once at startup. Off by default: another
   * tab (or an older build) may have written images this tab has never seen, and they are not ours to delete.
   */
  gcOnStart?: boolean;
  /**
   * Called when this tab takes over saving and finds the saved project newer than what it loaded (another tab saved
   * meanwhile): the store should load the saved project again rather than let this tab write over it.
   */
  onTakeover?: () => Promise<void> | void;
  /** The active house's storage suffix (see lib/house.ts storageSuffix): keeps each house's images and writer apart. */
  suffix?: string;
}

/** Why saving stopped in this tab, for the notice (see components/SaveNotice.tsx). */
export const TAKEN_OVER = "Another tab took over saving this project. Your next change here takes it back.";
/** Shown for a moment after a takeover found newer saved work: this tab's unsaved change was dropped for it. */
export const REFRESHED = "Loaded your changes from the other tab. Make your last change here again.";

export const WRITER_LOCK = "storey-writer";
/** The single-writer lock for a house's storage suffix: each house has its own writer. */
export const writerLock = (suffix = ""): string => WRITER_LOCK + suffix;

export function imageAwareStorage<S>(delayMs = 400, maxWaitMs = 2000, opts: StorageOptions = {}): PersistStorage<S> {
  const IMG_KEY_PREFIX = imgKeyPrefix(opts.suffix);
  const WRITER_LOCK = writerLock(opts.suffix);
  const locks = opts.locks === undefined ? (typeof navigator !== "undefined" ? navigator.locks : undefined) ?? null : opts.locks;
  const urlToId = new Map<string, string>();
  /** Ids known to be written to IndexedDB. */
  const written = new Set<string>();
  /** Ids the last state this tab loaded or wrote referred to. Only ids that drop out of this set are deleted. */
  let previouslyUsed = new Set<string>();
  let pending: { name: string; value: StorageValue<S> } | null = null;
  /** The newest value offered, kept even when not writing, so it can be saved once this tab becomes the writer. */
  let latest: { name: string; value: StorageValue<S> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** When the oldest unsaved change was made, so a stream of updates (the sun animation) can't hold off saving for ever. */
  let since: number | null = null;
  let lastState: Record<string, unknown> | null = null; // the fields of the last value accepted, to skip unchanged saves
  let chain: Promise<void> = Promise.resolve();
  let persistAsked = false;

  // Only one tab writes at a time: the one the owner is using. A tab takes the lock when it opens, comes to the
  // front or gets a change; the tab that loses it keeps what it has in memory and says so (its next change takes the
  // lock back). Before writing after a takeover, the tab checks the saved project is the one it loaded: if another
  // tab saved meanwhile it loads that instead of writing over it. A hidden tab (a preview) never takes the lock.
  let writer = !locks;
  let asking = false;
  /** The saved blob this tab last loaded or wrote, to tell whether another tab has saved since. */
  let lastJson: string | null = null;
  const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
  const tryLock = () => {
    if (!locks || writer || asking || !visible()) return;
    asking = true;
    let got = false;
    void Promise.resolve(
      locks.request(WRITER_LOCK, { steal: true }, async (lock) => {
        asking = false;
        if (!lock) {
          setStatus({ kind: "readonly" });
          return undefined;
        }
        got = true;
        writer = true;
        if (useStorageStatus.getState().kind === "readonly") setStatus({ kind: "idle" });
        if (latest && !useHydration.getState().error) {
          const stored = lastJson === null ? undefined : await get<string>(latest.name).catch(() => undefined);
          if (stored !== undefined && stored !== lastJson) {
            // Another tab saved since this one loaded: take its work rather than write over it.
            pending = null;
            latest = null;
            lastState = null;
            lastJson = stored;
            setStatus({ kind: "ok", message: REFRESHED, persistent: useStorageStatus.getState().persistent });
            await opts.onTakeover?.();
          } else {
            pending = latest;
            void flush();
          }
        }
        return new Promise<void>(() => {}); // hold the lock until the page goes, or another tab takes it
      }),
    ).catch(() => {
      asking = false;
      if (got) {
        // Another tab took the lock and saves from now on.
        writer = false;
        setStatus({ kind: "readonly", message: TAKEN_OVER });
      } else writer = true; // locks unusable: behave as if there were none
    });
  };

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
    if (!job || !writer) return chain;
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
        lastJson = json;
        // Drop images this tab stopped using (replaced or removed plans, and photos from before they were taken out), never ones it hasn't seen.
        const stale = [...previouslyUsed].filter((id) => !used.has(id));
        previouslyUsed = used;
        if (stale.length) {
          await delMany(stale.map((id) => IMG_KEY_PREFIX + id));
          const gone = new Set(stale);
          gone.forEach((id) => written.delete(id));
          for (const [url, id] of urlToId) if (gone.has(id)) urlToId.delete(url);
        }
        setStatus({ kind: "ok", persistent: useStorageStatus.getState().persistent });
        if (!persistAsked) {
          persistAsked = true;
          void Promise.resolve(typeof navigator !== "undefined" ? navigator.storage?.persist?.() : undefined)
            .then((persistent) => {
              if (typeof persistent === "boolean") useStorageStatus.setState({ persistent });
            })
            .catch(() => undefined);
        }
      })
      .catch((e) => {
        console.error("Saving the project failed", e);
        lastState = null; // so the next change tries again even if it matches
        setStatus({ kind: "failed", message: saveFailureMessage(e), persistent: useStorageStatus.getState().persistent });
      });
    return chain;
  };

  if (typeof window !== "undefined") {
    // Save straight away when the tab is hidden or closed.
    window.addEventListener("pagehide", () => void flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush();
      else tryLock();
    });
    window.addEventListener("focus", tryLock);
  }
  tryLock();

  return {
    getItem: async (name) => {
      const raw = await get<string>(name);
      lastJson = raw ?? null;
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
        previouslyUsed.add(id);
      });
      if (opts.gcOnStart) {
        const stale = (await keys()).filter((k): k is string => typeof k === "string" && k.startsWith(IMG_KEY_PREFIX) && !ids.includes(k.slice(IMG_KEY_PREFIX.length)));
        if (stale.length) await delMany(stale);
      }
      return rehydrate(raw, (id) => byId.get(id)) as StorageValue<S>;
    },
    setItem: (name, value) => {
      // A save that failed to load must not overwrite the data the recovery screen is offering.
      if (useHydration.getState().error) return;
      // zustand calls this on every set, including hover and selection that change nothing we save.
      const state = value.state as Record<string, unknown>;
      const keys = Object.keys(state);
      if (lastState && keys.length === Object.keys(lastState).length && keys.every((k) => k in lastState! && state[k] === lastState![k])) return;
      lastState = state;
      latest = { name, value };
      if (!writer) return tryLock();
      pending = latest;
      if (timer) clearTimeout(timer);
      since ??= Date.now();
      timer = setTimeout(() => void flush(), Math.max(0, Math.min(delayMs, since + maxWaitMs - Date.now())));
    },
    removeItem: async (name) => {
      pending = null;
      latest = null;
      lastState = null;
      await del(name);
    },
  };
}

/** Drop the retired Anthropic API key and model so the key does not linger in IndexedDB. */
export function dropAiSettings<T extends object>(settings: T | undefined): Omit<T, "apiKey" | "model"> | undefined {
  if (!settings) return undefined;
  const { apiKey: _apiKey, model: _model, ...rest } = settings as T & { apiKey?: string; model?: string };
  return rest;
}
