import { useSyncExternalStore } from "react";
import type { Fixture } from "../types";

/**
 * In-app clipboard for furniture (one item or a whole selection, with its layout). Module-level so it
 * survives switching layouts and floors, and mirrored to sessionStorage so it survives a tab switch
 * or reload. The system clipboard is never touched.
 */
const KEY = "house-modeler.fixture-clipboard";
const EMPTY: Fixture[] = [];
let current: Fixture[] | undefined;
const listeners = new Set<() => void>();

const valid = (f: Fixture) => !!f && typeof f.type === "string" && Number.isFinite(f.x) && Number.isFinite(f.y);

const load = (): Fixture[] => {
  try {
    const raw = sessionStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    // An older save held a single fixture.
    const list: Fixture[] = Array.isArray(v) ? v : v ? [v] : [];
    const ok = list.filter(valid);
    return ok.length ? ok : EMPTY;
  } catch {
    return EMPTY;
  }
};

export const getClipboardFixtures = (): Fixture[] => (current === undefined ? (current = load()) : current);

export function setClipboardFixtures(list: Fixture[]) {
  current = list.length ? list.map((f) => ({ ...f })) : EMPTY;
  try {
    if (list.length) sessionStorage.setItem(KEY, JSON.stringify(list));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the in-memory copy still works */
  }
  listeners.forEach((l) => l());
}

export function useClipboardFixtures(): Fixture[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getClipboardFixtures,
  );
}
