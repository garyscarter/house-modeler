import { useEffect, useMemo, useReducer } from "react";
import { useSite, useStore } from "../store";
import type { HouseModel, Site, VariantKey } from "../types";
import { gardenSun, occludersFor, roomSunHours, sunSamples, sunlightKey, type SunlightResult } from "../lib/sunlight";
import { sunTimes } from "../lib/sun";
import { SUN_YEAR } from "./useSun";

interface Entry {
  result?: SunlightResult;
  done: boolean;
  /** Mounted hooks waiting on this entry; a queued job nobody waits on is dropped. */
  refs: number;
}

const MAX_ENTRIES = 12;
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
/** Jobs run one at a time, each in its own timer tick, so the page stays responsive. */
let chain: Promise<void> = Promise.resolve();

const later = (fn: () => void) =>
  new Promise<void>((resolve) =>
    setTimeout(() => {
      try {
        fn();
      } finally {
        resolve();
      }
    }, 0),
  );
const notify = () => listeners.forEach((l) => l());

function evict() {
  for (const [k, e] of cache) {
    if (cache.size <= MAX_ENTRIES) break;
    if (e.done && e.refs === 0) cache.delete(k);
  }
}

function enqueue(key: string, model: HouseModel, site: Site, doy: number): Entry {
  const entry: Entry = { done: false, refs: 0 };
  cache.set(key, entry);
  let samples: ReturnType<typeof sunSamples> = [];
  let occ: ReturnType<typeof occludersFor> = [];
  // Rooms first, then the garden, as two jobs so neither holds up the page for long.
  chain = chain
    .then(() =>
      later(() => {
        if (entry.refs === 0) {
          if (cache.get(key) === entry) cache.delete(key);
          entry.done = true;
          return;
        }
        const { sunrise, sunset } = sunTimes(site.latitude, site.longitude, SUN_YEAR, doy);
        samples = sunSamples(site, SUN_YEAR, doy);
        occ = occludersFor(model, site);
        entry.result = { day: doy, sunrise, sunset, rooms: samples.length ? roomSunHours(model, occ, samples) : [] };
        if (!samples.length) entry.done = true;
        notify();
      }),
    )
    .then(() =>
      later(() => {
        if (entry.done || !entry.result) return;
        entry.result = { ...entry.result, garden: gardenSun(site, occ, samples, 1) };
        entry.done = true;
        evict();
        notify();
      }),
    );
  return entry;
}

/**
 * Room-by-room and garden sunlight for one layout on one day, worked out in
 * the background one job at a time. `result` has the rooms first and the
 * garden a moment later; `pending` is true until both are in.
 */
export function useSunlight(k: VariantKey, doy: number): { result?: SunlightResult; pending: boolean } {
  const model = useStore((s) => s.variants[k]);
  const site = useSite(k);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const geo = useMemo(() => (model && site ? sunlightKey(model, site) : ""), [model, site]);
  const key = `${k}|${doy}|${geo}`;
  useEffect(() => {
    listeners.add(bump);
    return () => void listeners.delete(bump);
  }, []);
  useEffect(() => {
    if (!model || !site) return;
    const entry = cache.get(key) ?? enqueue(key, model, site, doy);
    entry.refs++;
    bump();
    return () => {
      entry.refs--;
    };
    // The key stands for model and site: it changes whenever the geometry does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!model || !site) return { pending: false };
  const entry = cache.get(key);
  return { result: entry?.result, pending: !entry?.done };
}
