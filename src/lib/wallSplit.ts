import type { WallSplit } from "../types";
import type { FaceQuad } from "./walls";

const EPS = 1e-6;

/** Default height (m) of a horizontal split line. */
export const DEFAULT_SPLIT_HEIGHT = 1.2;

type P = { p: FaceQuad["v"][number]; uv: [number, number]; d: number };

/** Turn a convex polygon (3 to 6 points) into quads (a triangle repeats its last point), keeping winding and normal. */
function toQuads(poly: P[], q: FaceQuad): FaceQuad[] {
  const out: FaceQuad[] = [];
  const make = (idx: number[]): FaceQuad => {
    const ids = idx.length === 3 ? [...idx, idx[2]] : idx;
    return { v: ids.map((i) => poly[i].p) as FaceQuad["v"], n: q.n, uv: ids.map((i) => poly[i].uv), slot: q.slot };
  };
  if (poly.length < 3) return out;
  for (let i = 1; i + 1 < poly.length; i += 2) out.push(make(i + 2 < poly.length ? [0, i, i + 1, i + 2] : [0, i, i + 1]));
  return out;
}

/**
 * Cut a wall-face quad along the line f = 0, where f(u, y) is a signed
 * distance in the face's own plane (u = the quad's uv u, y = world height).
 * Positions and uv are interpolated at the cut. `below` is the f <= 0 side,
 * `above` the f > 0 side. A quad wholly on one side comes back unchanged.
 */
export function splitFaceByLine(q: FaceQuad, f: (u: number, y: number) => number): { below: FaceQuad[]; above: FaceQuad[] } {
  const pts: P[] = q.v.map((p, i) => ({ p, uv: q.uv[i], d: f(q.uv[i][0], p[1]) }));
  if (pts.every((x) => x.d <= EPS)) return { below: [q], above: [] };
  if (pts.every((x) => x.d >= -EPS)) return { below: [], above: [q] };
  const clip = (keep: (d: number) => boolean): P[] => {
    const out: P[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ka = keep(a.d);
      if (ka) out.push(a);
      if (ka !== keep(b.d)) {
        const t = a.d / (a.d - b.d);
        out.push({
          p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t, a.p[2] + (b.p[2] - a.p[2]) * t],
          uv: [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t],
          d: 0,
        });
      }
    }
    // Corners lying on the line also come back as cut points: drop the repeats.
    const same = (a: P, b: P) => Math.abs(a.p[0] - b.p[0]) < EPS && Math.abs(a.p[1] - b.p[1]) < EPS && Math.abs(a.p[2] - b.p[2]) < EPS;
    return out.filter((x, i) => !same(x, out[(i + 1) % out.length]));
  };
  return { below: toQuads(clip((d) => d <= 0), q), above: toQuads(clip((d) => d > 0), q) };
}

/**
 * The signed distance for a split of a wall seen from inside. `left` and
 * `right` are the u (metres along the wall direction) of the wall's left and
 * right ends as the viewer sees them; right < left when u runs against the
 * viewer's left-to-right. The wall runs from floor 0 to `top`. Positive is the
 * second colour's side: above the line, or right of a vertical one.
 */
export function splitLine(split: WallSplit, left: number, right: number, top: number): (u: number, y: number) => number {
  const span = right - left || 1e-9;
  const dir = span < 0 ? -1 : 1;
  switch (split.kind) {
    case "horizontal": {
      const at = split.at ?? DEFAULT_SPLIT_HEIGHT;
      return (_u, y) => y - at;
    }
    case "vertical": {
      const at = split.at ?? Math.abs(span) / 2;
      return (u) => (u - (left + dir * at)) * dir;
    }
    case "diagonalUp":
      return (u, y) => y - (top * (u - left)) / span;
    case "diagonalDown":
      return (u, y) => y - top * (1 - (u - left) / span);
  }
}
