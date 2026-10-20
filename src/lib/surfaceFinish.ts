import type { SiteSurface, SurfaceFinish, SurfaceKind } from "../types";

/** Surface kinds that can be laid with a choice of finish; lawns, beds and roads look only one way. */
const FINISHABLE: ReadonlySet<SurfaceKind> = new Set<SurfaceKind>(["drive", "patio", "path", "pavement"]);

export const canHaveFinish = (kind: SurfaceKind): boolean => FINISHABLE.has(kind);

/**
 * The material a surface is drawn with: its finish if it has one and its kind can take one,
 * otherwise the kind's own texture (block paving on a drive, slabs on a patio, and so on), so
 * a surface with no finish looks exactly as it did before finishes existed.
 */
export function surfaceLook(s: Pick<SiteSurface, "kind" | "finish">): SurfaceFinish | SurfaceKind {
  if (s.finish && FINISHABLE.has(s.kind)) return s.finish;
  return s.kind;
}
