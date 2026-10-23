import { uid, type SavedView, type VariantKey } from "../types";
import { isValidPose, type CameraPose } from "./cameraViews";

/** Pure logic for saved camera views: naming, parsing and which 3D viewers to photograph. */

export const MAX_SAVED_VIEWS = 50;
const MAX_NAME = 60;

export function makeSavedView(pose: CameraPose, name: string, maxLevel: number | null, id: string = uid()): SavedView {
  return { id, name, position: { ...pose.position }, target: { ...pose.target }, maxLevel };
}

/** The first "View N" not already used. */
export function nextViewName(views: { name: string }[]): string {
  const used = new Set(views.map((v) => v.name));
  let n = 1;
  while (used.has(`View ${n}`)) n++;
  return `View ${n}`;
}

/** Trim, collapse whitespace, cap at 60 characters; the fallback when nothing is left. */
export function cleanViewName(raw: string, fallback: string): string {
  const s = raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();
  return s || fallback;
}

/** Read saved views from a server copy or an imported file; undefined when there is no list. */
export function parseSavedViews(raw: unknown): SavedView[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SavedView[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_SAVED_VIEWS) break;
    const v = item as Partial<SavedView> | null;
    if (!v || typeof v !== "object" || typeof v.id !== "string" || !v.id || seen.has(v.id)) continue;
    if (typeof v.name !== "string" || !v.name.trim() || !isValidPose({ position: v.position, target: v.target })) continue;
    seen.add(v.id);
    const maxLevel = typeof v.maxLevel === "number" && Number.isFinite(v.maxLevel) ? v.maxLevel : null;
    out.push({ id: v.id, name: cleanViewName(v.name, "View"), position: { ...v.position! }, target: { ...v.target! }, maxLevel });
  }
  return out;
}

/**
 * Which registered viewers to photograph, one per layout present: its own
 * viewer (side by side) or its wipe half; else the main viewer, but only for
 * the layout it shows.
 */
export function shotTargets(ids: string[], present: VariantKey[], active: VariantKey): { variant: VariantKey; id: string }[] {
  const out: { variant: VariantKey; id: string }[] = [];
  for (const k of present) {
    if (ids.includes(k)) out.push({ variant: k, id: k });
    else if (ids.includes(`wipe-${k}`)) out.push({ variant: k, id: `wipe-${k}` });
    else if (k === active && ids.includes("main")) out.push({ variant: k, id: "main" });
  }
  return out;
}

/** Whether every layout present has a picture. */
export function viewsCoverAll(targets: { variant: VariantKey }[], present: VariantKey[]): boolean {
  return present.every((k) => targets.some((t) => t.variant === k));
}
