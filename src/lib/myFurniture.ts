import type { Fixture, HouseModel, MyPiece, VariantKey } from "../types";
import { byId, MINE, type CatalogueItem } from "./catalogue";
import { pointInPolygon } from "./geometry";

/** The catalogue entry a piece draws as: the base kind's look with the piece's own name and measured size. The id stays the base id. */
export function pieceItem(p: MyPiece): CatalogueItem {
  const base = byId(p.kind) ?? byId("custom")!;
  return { ...base, name: p.name, category: MINE, w: p.w, d: p.d, h: p.h, color: p.color ?? base.color, note: p.note, piece: p.id, toCeiling: false };
}

/** Fields a new placement of `item` carries: nothing for a catalogue item, the piece link and size for the owner's. */
export function pieceFixtureFields(item: CatalogueItem): Partial<Fixture> {
  if (!item.piece) return {};
  return { piece: item.piece, w: item.w, d: item.d, h: item.h, color: item.color, label: item.name };
}

/** Copy a piece's new size and colour onto every placement (the label too, unless the owner changed it). Same object when nothing matches. */
export function applyPiece(model: HouseModel, prev: MyPiece, next: MyPiece): HouseModel {
  let changed = false;
  const floors = model.floors.map((f) => {
    if (!f.fixtures?.some((x) => x.piece === next.id)) return f;
    changed = true;
    return {
      ...f,
      fixtures: f.fixtures.map((x) =>
        x.piece === next.id
          ? { ...x, w: next.w, d: next.d, h: next.h, color: next.color ?? byId(next.kind)?.color, label: !x.label || x.label === prev.name ? next.name : x.label }
          : x,
      ),
    };
  });
  return changed ? { ...model, floors } : model;
}

/** Cut the link between a piece and its placements; they stay as plain items with their label. */
export function unlinkPiece(model: HouseModel, id: string): HouseModel {
  let changed = false;
  const floors = model.floors.map((f) => {
    if (!f.fixtures?.some((x) => x.piece === id)) return f;
    changed = true;
    return {
      ...f,
      fixtures: f.fixtures.map((x) => {
        if (x.piece !== id) return x;
        const { piece: _gone, ...rest } = x;
        return rest;
      }),
    };
  });
  return changed ? { ...model, floors } : model;
}

const clampSize = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(10, Math.max(0.02, n)) : fallback);

/** Read pieces from saved or imported data; undefined when it is not a list. */
export function sanitizePieces(raw: unknown): MyPiece[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: MyPiece[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || typeof o.name !== "string" || !o.name) continue;
    const kind = typeof o.kind === "string" && byId(o.kind) ? o.kind : "custom";
    const base = byId(kind)!;
    const piece: MyPiece = { id: o.id, name: o.name, kind, w: clampSize(o.w, base.w), d: clampSize(o.d, base.d), h: clampSize(o.h, base.h) };
    if (typeof o.color === "string") piece.color = o.color;
    if (typeof o.note === "string" && o.note) piece.note = o.note;
    out.push(piece);
  }
  return out;
}

export interface Whereabouts {
  count: number;
  /** "Room, Floor" for each placement. */
  places: string[];
}

/** Where each piece is placed in each loaded layout. */
export function pieceWhereabouts(
  variants: Partial<Record<VariantKey, HouseModel>>,
  pieces: MyPiece[],
): Record<string, Partial<Record<VariantKey, Whereabouts>>> {
  const out: Record<string, Partial<Record<VariantKey, Whereabouts>>> = {};
  for (const p of pieces) out[p.id] = {};
  for (const k of ["current", "proposed"] as VariantKey[]) {
    const m = variants[k];
    if (!m) continue;
    for (const p of pieces) out[p.id][k] = { count: 0, places: [] };
    for (const f of m.floors) {
      for (const x of f.fixtures ?? []) {
        const w = x.piece ? out[x.piece]?.[k] : undefined;
        if (!w) continue;
        const room = f.rooms.find((r) => pointInPolygon({ x: x.x, y: x.y }, r.polygon));
        w.count++;
        w.places.push(room ? `${room.name}, ${f.name}` : f.name);
      }
    }
  }
  return out;
}

export function whereaboutsLine(count: number): string {
  return count === 0 ? "Not placed" : count === 1 ? "Placed" : `Placed ${count} times`;
}
