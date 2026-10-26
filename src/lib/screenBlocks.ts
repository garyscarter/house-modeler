import type { BoundaryEdge, ScreenPanel } from "../types";

/** A pierced concrete screen block: 290 mm square, 90 mm thick. */
export const SCREEN_BLOCK = 0.29;
export const SCREEN_THICK = 0.09;
/** The least brickwork a panel needs under it, metres. */
const MIN_BRICK_UNDER = 0.3;

/** Where a wall's screen-block panel runs, metres along the edge, and how tall it is. */
export interface ScreenBand {
  from: number;
  to: number;
  rows: 1 | 2;
  /** rows × the block size. */
  height: number;
}

/**
 * The panel of screen blocks in a wall edge of length `len` whose top course is
 * `capH` tall: snapped to whole blocks from its start, kept inside the edge,
 * and only where the wall is tall enough to carry it on at least 0.3 m of
 * brick. Null for anything but a wall, or when no blocks fit.
 */
export function screenBand(edge: Pick<BoundaryEdge, "kind" | "height" | "screen">, len: number, capH: number): ScreenBand | null {
  const s = edge.screen;
  if (!s || edge.kind !== "wall") return null;
  const rows = s.rows === 2 ? 2 : 1;
  const height = rows * SCREEN_BLOCK;
  if (edge.height - capH - height < MIN_BRICK_UNDER - 1e-6) return null;
  const from = Math.min(Math.max(s.from ?? 0, 0), len);
  const wanted = Math.min(s.length ?? len - from, len - from);
  const n = Math.floor(wanted / SCREEN_BLOCK + 1e-6);
  if (n < 1) return null;
  return { from, to: from + n * SCREEN_BLOCK, rows, height };
}

export interface RunPiece {
  start: number;
  end: number;
  /** True where the band's blocks sit in the top of this piece. */
  screened: boolean;
}

/** A run from `start` to `end` cut where the band begins and ends; pieces under 1 mm are dropped. */
export function cutRun(start: number, end: number, band: ScreenBand | null): RunPiece[] {
  if (!band || band.to <= start || band.from >= end) return [{ start, end, screened: false }];
  const cuts = [start, band.from, band.to, end].filter((d) => d >= start && d <= end).sort((a, b) => a - b);
  const out: RunPiece[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    if (cuts[i + 1] - cuts[i] < 1e-3) continue;
    const mid = (cuts[i] + cuts[i + 1]) / 2;
    out.push({ start: cuts[i], end: cuts[i + 1], screened: mid > band.from && mid < band.to });
  }
  return out;
}

/** A tidy copy of a panel for comparing edges: the same panel always gives the same string. */
export const screenKey = (s: ScreenPanel | undefined): string => (s ? `${s.rows === 2 ? 2 : 1}:${s.from ?? 0}:${s.length ?? "all"}` : "");
