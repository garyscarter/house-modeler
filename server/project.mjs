// The one shared project: a single JSON file `{ revision, savedAt, data }` in DATA_DIR.
// Revision is an integer that goes up by one on every save; a save must name the
// revision it was based on, so two devices can never silently overwrite each other.
import fs from "node:fs";
import path from "node:path";

export const MAX_PROJECT_BODY_BYTES = 50 * 1024 * 1024;
const FILE_NAME = "project.json";

export function createProjectStore(dir) {
  const file = path.join(dir, FILE_NAME);
  let meta = null; // { revision, savedAt } of what is on disk, null when nothing is saved
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Number.isInteger(saved.revision) && saved.revision >= 1 && saved.data && typeof saved.data === "object") {
      meta = { revision: saved.revision, savedAt: String(saved.savedAt) };
    }
  } catch (err) {
    if (err?.code !== "ENOENT") console.warn(`Ignoring unreadable ${file}: ${err?.message ?? err}`);
  }

  return {
    /** `{ revision, savedAt }` or null. */
    meta: () => (meta ? { ...meta } : null),
    /** The stored file's text, which is already the GET response body. */
    readRaw: () => fs.readFileSync(file, "utf8"),
    /**
     * Save `data` if `baseRevision` is the stored revision (0 when nothing is saved).
     * Returns `{ ok: true, revision, savedAt }`, or `{ ok: false, ...current }` on a mismatch.
     * Synchronous on purpose: the check and the write cannot interleave with another request.
     */
    save(baseRevision, data, now = new Date()) {
      const current = meta?.revision ?? 0;
      if (baseRevision !== current) return { ok: false, revision: current, savedAt: meta?.savedAt ?? null };
      const next = { revision: current + 1, savedAt: now.toISOString() };
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ ...next, data }));
      fs.renameSync(tmp, file);
      meta = next;
      return { ok: true, ...next };
    },
  };
}

/** True when the request's Origin header names this server's own host (a basic CSRF guard). */
export function originMatchesHost(origin, host) {
  if (typeof origin !== "string" || typeof host !== "string" || !origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/** Check a PUT body; returns `{ baseRevision, data }` or null. */
export function parsePutBody(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const { baseRevision, data } = body;
  if (!Number.isInteger(baseRevision) || baseRevision < 0) return null;
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.variants !== "object" || data.variants === null) return null;
  return { baseRevision, data };
}
