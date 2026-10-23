import type { HouseModel, MyPiece, Photo, SavedView, VariantKey } from "../types";
import { sanitizePieces } from "./myFurniture";
import { parseSavedViews } from "./savedViews";
import { migrateModel, migratePhotos, migrateSites } from "./migrate";
import { sitesFromImport, type Sites } from "./sites";

/**
 * The pure parts of syncing the project with the server (the doing is in sync.ts).
 *
 * The server keeps one copy of the project with an integer revision. Each browser
 * remembers the revision (and save time) it last matched, and whether it has
 * changes the server has not seen yet ("dirty").
 */

/** What the project is, in the same shape as Settings → Export JSON. */
export interface ProjectData {
  variants: Partial<Record<VariantKey, HouseModel>>;
  photos: Photo[];
  sites: Sites;
  costRates: Record<string, number>;
  /** The owner's own furniture (absent in older copies). */
  pieces?: MyPiece[];
  savedViews?: SavedView[];
}

/** A revision of the server's copy. */
export interface Revision {
  revision: number;
  savedAt: string;
}

export type SyncAction = "none" | "load" | "upload" | "conflict";

/**
 * What to do when comparing this browser with the server's copy.
 * - `local`: the revision this browser last matched (null: never synced).
 * - `server`: the server's current revision (null: nothing saved there).
 * - `dirty`: this browser has changes the server has not seen.
 * - `localEmpty`: this browser has no layouts and no photos.
 */
export function decideSync(i: { local: Revision | null; server: Revision | null; dirty: boolean; localEmpty: boolean }): SyncAction {
  // A browser that has never synced but holds a project counts as having unsynced changes.
  const dirty = i.dirty || (i.local === null && !i.localEmpty);
  if (!i.server) return dirty || !i.localEmpty ? "upload" : "none"; // the server's copy was lost (or never made): put ours there
  const same = i.local !== null && i.local.revision === i.server.revision && i.local.savedAt === i.server.savedAt;
  if (same) return dirty ? "upload" : "none";
  return dirty ? "conflict" : "load";
}

/** Least time between checks when the app comes back to the front. */
export const RESUME_THROTTLE_MS = 10_000;

/**
 * What to do when the app becomes visible or focused again: nothing (checked recently, a save is
 * under way, the user chose Cancel in the conflict dialog, or there is no server), send unsaved
 * changes first (a conflict then shows the usual dialog), or look at what the server has.
 */
export function decideResume(i: { now: number; lastResume: number; saving: boolean; paused: boolean; noServer: boolean; enabled: boolean; dirty: boolean }): "skip" | "flush" | "check" {
  if (i.noServer || i.paused || i.saving || i.now - i.lastResume < RESUME_THROTTLE_MS) return "skip";
  return i.enabled && i.dirty ? "flush" : "check";
}

export type ConflictAction = "load" | "overwrite" | "cancel";

/** The button picked in the "changed on another device" dialog: Load / Keep mine and overwrite / Cancel (or dismissed). */
export function conflictAction(choice: number | null): ConflictAction {
  return choice === 0 ? "load" : choice === 1 ? "overwrite" : "cancel";
}

export const CONFLICT_CHOICES = ["Load that version", "Keep mine and overwrite", "Cancel"];

export const conflictMessage = (savedAt: string | null, now = new Date()) =>
  `This project was changed on another device${savedAt ? ` (saved ${formatSavedAt(savedAt, now)})` : ""}.`;

/** "14:02", or "12 Oct 14:02" when it was not today. */
export function formatSavedAt(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "earlier";
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === now.toDateString() ? time : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

export type SyncStatus =
  | { kind: "off" }
  | { kind: "synced"; savedAt: string | null; persistent: boolean }
  | { kind: "saving" }
  | { kind: "offline" }
  | { kind: "signedout" }
  | { kind: "paused" }
  | { kind: "tooLarge" };

export function statusText(s: SyncStatus): string {
  switch (s.kind) {
    case "off":
      return "";
    case "synced":
      return `Synced with the server${s.savedAt ? ` · saved ${formatSavedAt(s.savedAt)}` : ""}${s.persistent ? "" : " · Server copy isn't permanent"}`;
    case "saving":
      return "Saving…";
    case "offline":
      return "Couldn't reach the server, will retry";
    case "signedout":
      return "Signed out of the server: reload the page and sign in again";
    case "paused":
      return "Not saved: the server has a different version. Tap Sync now to choose";
    case "tooLarge":
      return "Too large to sync (over 50 MB): remove some photos, then Sync now";
  }
}

/** True for a reply that came from the Storey server (a static host answers with HTML instead). */
export const isJsonReply = (contentType: string | null) => /\bapplication\/json\b/i.test(contentType ?? "");

export const isProjectEmpty = (p: { variants: ProjectData["variants"]; photos: Photo[] }) =>
  !p.variants.current && !p.variants.proposed && p.photos.length === 0;

const looksLikeModel = (m: unknown): m is HouseModel => !!m && Array.isArray((m as HouseModel).floors);

/**
 * Read a project (a server copy or an imported file) into what the store should hold,
 * or null when it is not a Storey project. Older files with one shared `site` are accepted.
 */
export function parseProject(data: unknown, costRatesNow: Record<string, number>, opts: { allowEmpty?: boolean } = {}): ProjectData | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { variants?: Record<string, unknown>; photos?: unknown; sites?: unknown; site?: unknown; costRates?: Record<string, number>; pieces?: unknown; savedViews?: unknown };
  const current = looksLikeModel(d.variants?.current) ? d.variants?.current : undefined;
  const proposed = looksLikeModel(d.variants?.proposed) ? d.variants?.proposed : undefined;
  if (!current && !proposed) {
    // An emptied project (after Reset) is a valid server copy, but not a valid import.
    const emptied = opts.allowEmpty && !!d.variants && typeof d.variants === "object" && !Array.isArray(d.variants) && Object.keys(d.variants).length === 0;
    return emptied ? { variants: {}, photos: [], sites: {}, costRates: d.costRates ?? costRatesNow, pieces: sanitizePieces(d.pieces), savedViews: parseSavedViews(d.savedViews) } : null;
  }
  const variants: ProjectData["variants"] = {};
  if (current) variants.current = migrateModel(current);
  if (proposed) variants.proposed = migrateModel(proposed);
  return {
    variants,
    photos: Array.isArray(d.photos) ? migratePhotos(d.photos as Photo[]) : [],
    sites: migrateSites(sitesFromImport({ sites: d.sites, site: d.site, variants })),
    costRates: d.costRates ?? costRatesNow,
    pieces: sanitizePieces(d.pieces),
    savedViews: parseSavedViews(d.savedViews),
  };
}
