/** Pure helpers for path-traced stills ("Render"): output size, sample counts and the progress line. */

export type StillQuality = "high" | "balanced" | "low";

/** A still the viewer's shape, its longest side capped at `maxSide` px (whole pixels, at least 1). */
export function stillSize(viewerW: number, viewerH: number, maxSide = 1600): { width: number; height: number } {
  const w = Math.max(1, viewerW), h = Math.max(1, viewerH);
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** Samples per pixel for a still at each render quality. */
export function samplesFor(quality: StillQuality): number {
  return quality === "high" ? 256 : quality === "balanced" ? 128 : 48;
}

/** "about 40 s left" / "about 3 min left" for a remaining time in ms. */
function timeLeft(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 90 ? `about ${s} s left` : `about ${Math.round(s / 60)} min left`;
}

/**
 * The progress line under a render: "Building the scene…" before the first
 * sample, then "48 of 256 samples · about 40 s left" from the running
 * average time per sample. `elapsedMs` counts from the first sample, so the
 * scene build does not skew the estimate.
 */
export function progressLabel(done: number, total: number, elapsedMs: number): string {
  const n = Math.min(Math.floor(done), total);
  if (n <= 0) return "Building the scene…";
  const head = `${n} of ${total} samples`;
  if (n >= total) return head;
  return `${head} · ${timeLeft((elapsedMs / n) * (total - n))}`;
}
