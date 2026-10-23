import { create } from "zustand";
import { useStore } from "../store";
import { choose } from "../components/Dialogs";
import {
  CONFLICT_CHOICES,
  conflictAction,
  conflictMessage,
  decideResume,
  decideSync,
  isJsonReply,
  isProjectEmpty,
  parseProject,
  type ProjectData,
  type Revision,
  type SyncStatus,
} from "./syncLogic";

/**
 * Keeps this browser's project in step with the one the server holds (see "Hosting on
 * Render" in the README). Where there is no server (the static artifact, `npm run dev`)
 * the first request does not get a JSON reply, sync stays off and nothing shows.
 */

const STORAGE_KEY = "house-modeler/sync";
const SAVE_DELAY_MS = 3000;
const RETRY_MS = 20_000;
const PROBE_TIMEOUT_MS = 6000;
const SAVE_TIMEOUT_MS = 120_000;

export const useSyncStatus = create<{ status: SyncStatus }>(() => ({ status: { kind: "off" } }));
const setStatus = (status: SyncStatus) => useSyncStatus.setState({ status });

interface Memory extends Partial<Revision> {
  dirty?: boolean;
}
const readMemory = (): Memory => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
};
const writeMemory = (m: Memory) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  } catch {
    // private window or blocked storage: carry on, a reload then just asks again
  }
};

/** The revision this browser last matched, and whether it has changes the server hasn't seen. */
let last: Revision | null = null;
let dirty = false;
let persistent = true;
let enabled = false;
let paused = false; // "Cancel" was chosen in the conflict dialog: wait for Sync now
let applying = false;
let version = 0; // counts local changes, so a save can tell whether more came in while it was sent
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;
let lastResume = 0;
let noServer = false; // the first answer wasn't from our server (static host, artifact): sync stays off
let queue: Promise<unknown> = Promise.resolve();

/** Run one sync step at a time. */
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

const remember = () => writeMemory({ ...last, dirty });
const synced = (rev: Revision) => {
  last = rev;
  remember();
  setStatus({ kind: "synced", savedAt: rev.savedAt, persistent });
};

interface Reply {
  status: number;
  json: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Call the server; null when there is no (JSON) answer: no server, or it can't be reached. */
async function call(method: "GET" | "PUT", url: string, body?: unknown, timeoutMs = PROBE_TIMEOUT_MS): Promise<{ reply: Reply | null; unreachable: boolean }> {
  try {
    const res = await fetch(url, {
      method,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!isJsonReply(res.headers.get("content-type"))) return { reply: null, unreachable: false };
    return { reply: { status: res.status, json: await res.json() }, unreachable: false };
  } catch {
    return { reply: null, unreachable: true };
  }
}

const currentProject = (): ProjectData => {
  const { variants, photos, sites, costRates, savedViews } = useStore.getState();
  return { variants, photos, sites, costRates, savedViews };
};

/** Put a project into the store the way Import JSON does. Returns false when it isn't a project. */
export function applyProject(data: unknown, fromServer = false): boolean {
  const project = parseProject(data, useStore.getState().costRates, { allowEmpty: fromServer });
  if (!project) return false;
  applying = fromServer; // the server's own copy is not a local change to send back
  try {
    // One undoable step: replace everything at once.
    useStore.setState({ costRates: project.costRates });
    if (project.savedViews) useStore.setState({ savedViews: project.savedViews });
    useStore.getState().setVariant("current", project.variants.current);
    useStore.getState().setVariant("proposed", project.variants.proposed);
    useStore.setState({ photos: project.photos, sites: project.sites });
  } finally {
    applying = false;
  }
  return true;
}

function goOffline() {
  setStatus({ kind: "offline" });
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => void serial(check), RETRY_MS);
}

async function loadServerCopy(): Promise<void> {
  const { reply } = await call("GET", "/api/project", undefined, SAVE_TIMEOUT_MS);
  if (!reply || reply.status !== 200 || !applyProject(reply.json.data, true)) return goOffline();
  persistent = reply.json.persistent !== false;
  dirty = false;
  synced({ revision: reply.json.revision, savedAt: reply.json.savedAt });
}

/** Save to the server on top of `base`. A mismatch (409) is the user's call, never a silent overwrite. */
let saving = 0; // saves (and the conflict dialog they can open) in progress
async function push(base: number): Promise<void> {
  saving++;
  try {
    await pushOnce(base);
  } finally {
    saving--;
  }
}

async function pushOnce(base: number): Promise<void> {
  if (!enabled || paused) return;
  const sent = version;
  clearTimeout(saveTimer);
  setStatus({ kind: "saving" });
  const { reply } = await call("PUT", "/api/project", { baseRevision: base, data: currentProject() }, SAVE_TIMEOUT_MS);
  if (!reply) return goOffline();
  if (reply.status === 401) return setStatus({ kind: "signedout" });
  if (reply.status === 409) return conflict(reply.json as Partial<Revision>);
  if (reply.status === 413) {
    paused = true; // retrying the same upload cannot succeed: wait for Sync now
    return setStatus({ kind: "tooLarge" });
  }
  if (reply.status !== 200) return goOffline();
  persistent = reply.json.persistent !== false;
  if (sent === version) dirty = false;
  synced({ revision: reply.json.revision, savedAt: reply.json.savedAt });
  if (sent !== version) scheduleSave();
}

async function conflict(server: Partial<Revision>): Promise<void> {
  if (!server.revision) return push(0); // the server's copy has gone: nothing to lose by saving ours
  const action = conflictAction(await choose(conflictMessage(server.savedAt ?? null), CONFLICT_CHOICES));
  if (action === "load") return loadServerCopy();
  if (action === "overwrite") return push(server.revision);
  paused = true;
  setStatus({ kind: "paused" });
}

/** Compare with the server and do what is needed. Also the first thing that runs, and what a retry does. */
async function check(): Promise<void> {
  if (noServer) return;
  const since = last && !dirty ? `?since=${last.revision}` : "";
  const { reply, unreachable } = await call("GET", `/api/project${since}`);
  if (!reply || (reply.status !== 200 && reply.status !== 404)) {
    if (reply?.status === 401) {
      if (enabled) setStatus({ kind: "signedout" });
    } else if (enabled) goOffline();
    else if (!unreachable) noServer = true; // an answer that isn't ours (a static host): sync stays off for this page load
    return;
  }
  persistent = reply.json.persistent !== false;
  if (!enabled) {
    const saved = readMemory();
    enabled = true;
    last = saved.revision ? { revision: saved.revision, savedAt: saved.savedAt ?? "" } : null;
    dirty = saved.dirty ?? false;
    useStore.subscribe((s, prev) => {
      if (applying) return;
      if (s.variants !== prev.variants || s.photos !== prev.photos || s.sites !== prev.sites || s.costRates !== prev.costRates || s.savedViews !== prev.savedViews) onChange();
    });
  }
  const server: Revision | null = reply.status === 404 ? null : { revision: reply.json.revision, savedAt: reply.json.savedAt };
  const action = decideSync({ local: last, server, dirty, localEmpty: isProjectEmpty(useStore.getState()) });
  if (action === "none") return setStatus({ kind: "synced", savedAt: server?.savedAt ?? null, persistent });
  if (action === "load") return loadServerCopy();
  if (action === "upload") return push(server?.revision ?? 0);
  return conflict(server!);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void serial(() => push(last?.revision ?? 0)), SAVE_DELAY_MS);
}

function onChange() {
  version++;
  dirty = true;
  remember();
  if (paused) return;
  setStatus({ kind: "saving" });
  scheduleSave();
}

/** The app is in front again: pick up changes made on another device, or send ours first. */
function resume() {
  const now = Date.now();
  const action = decideResume({ now, lastResume, saving: saving > 0, paused, noServer, enabled, dirty });
  if (action === "skip") return;
  lastResume = now;
  // Unsaved changes go first: if the other device saved in between, the save meets the usual conflict dialog.
  void serial(action === "flush" ? () => push(last?.revision ?? 0) : check).catch(() => undefined);
}

/** Look for a server and, if there is one, bring this browser and the server together. Never throws. */
export async function startSync(): Promise<void> {
  if (import.meta.env.DEV || typeof window === "undefined" || !/^https?:$/.test(location.protocol)) return;
  if (!started) {
    started = true;
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && resume());
    window.addEventListener("focus", resume);
  }
  try {
    await serial(check);
  } catch (e) {
    console.error("Sync failed", e);
  }
}

/** The "Sync now" button. */
export function syncNow(): void {
  paused = false;
  clearTimeout(saveTimer);
  void serial(check).catch(() => undefined);
}
