import { useSyncExternalStore } from "react";
import type { Fixture } from "../types";

/**
 * In-app clipboard for furniture. Module-level so it survives switching
 * layouts and floors, and mirrored to sessionStorage so it survives a tab
 * switch or reload. The system clipboard is never touched.
 */
const KEY = "house-modeler.fixture-clipboard";
let current: Fixture | null | undefined;
const listeners = new Set<() => void>();

const load = (): Fixture | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    const f = raw ? (JSON.parse(raw) as Fixture) : null;
    return f && typeof f.type === "string" && Number.isFinite(f.x) && Number.isFinite(f.y) ? f : null;
  } catch {
    return null;
  }
};

export const getClipboardFixture = (): Fixture | null => (current === undefined ? (current = load()) : current);

export function setClipboardFixture(f: Fixture | null) {
  current = f ? { ...f } : null;
  try {
    if (f) sessionStorage.setItem(KEY, JSON.stringify(f));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the in-memory copy still works */
  }
  listeners.forEach((l) => l());
}

export function useClipboardFixture(): Fixture | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getClipboardFixture,
  );
}
