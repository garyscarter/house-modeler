import type { HouseModel, VariantKey } from "../types";

/** What the startup prompt should offer, or nothing. */
export type StartupPrompt =
  | { kind: "load"; version: number; withProposed: boolean }
  | { kind: "update"; version: number; variants: VariantKey[] };

/** Versions of each prompt kind the user has already answered "not now" / "keep mine" to. */
export type Remembered = { load?: number; update?: number };

type Registry = Record<string, { version: number }>;

/**
 * Decide which prompt to show when the app opens, if any.
 *
 * Nothing saved as As listed: offer to load the listing. Otherwise, if a
 * built-in variant (one that still carries a preset) is older than the
 * registry, offer to update it. A layout without a preset, such as a copy made
 * to start a redesign, is the user's own and never counts. A remembered answer
 * silences the prompt until the version it was given for is superseded.
 */
export function decideStartupPrompt(
  variants: Partial<Record<VariantKey, Pick<HouseModel, "preset">>>,
  registry: Registry,
  listingPresetId: string,
  remembered: Remembered,
): StartupPrompt | null {
  if (!variants.current) {
    const version = registry[listingPresetId]?.version;
    if (version === undefined || (remembered.load ?? 0) >= version) return null;
    // Loading the extension would overwrite a Proposed layout that is already there.
    return { kind: "load", version, withProposed: !variants.proposed };
  }
  const stale: VariantKey[] = [];
  let version = 0;
  for (const k of ["current", "proposed"] as VariantKey[]) {
    const p = variants[k]?.preset;
    const latest = p && registry[p.id]?.version;
    if (p && latest !== undefined && latest > p.version) {
      stale.push(k);
      version = Math.max(version, latest);
    }
  }
  if (!stale.length || (remembered.update ?? 0) >= version) return null;
  return { kind: "update", version, variants: stale };
}

const KEY = "house-modeler/startup-prompt";

/** Read the remembered answers; storage can throw or hold junk, so fall back to none. */
export function readRemembered(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): Remembered {
  try {
    const raw = storage?.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Remembered) : {};
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
    return { load: num(v.load), update: num(v.update) };
  } catch {
    return {};
  }
}

export function remember(kind: "load" | "update", version: number, storage: Pick<Storage, "getItem" | "setItem"> | undefined = safeStorage()) {
  try {
    storage?.setItem(KEY, JSON.stringify({ ...readRemembered(storage), [kind]: version }));
  } catch {
    // Private mode or a full quota: the prompt may come back next time, which is harmless.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
