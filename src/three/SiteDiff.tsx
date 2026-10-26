import { useMemo } from "react";
import type { GardenItem, Site, VariantKey } from "../types";
import { useSite, useStore } from "../store";
import { changedPieces, type BoundaryPiece } from "../lib/siteDiff";
import { GROUND_Y } from "./Site";
import { groundHeightAt, itemBounds, itemsOf } from "../lib/siteItems";
import { gardenDef, itemSize } from "../lib/gardenCatalogue";

/** Overlay colours, as for the house: green is in the solid layout only, red in the other only. */
const NEW = "#16a34a";
const GONE = "#e0332f";
const THICK = 0.34;

/**
 * Overlay compare: plot boundary stretches whose wall, fence or hedge
 * differs between the viewed layout and the other, in the change colours.
 * Green boxes are the viewed layout's new treatment (and a strip on the
 * ground where it opens up the boundary); red boxes are the other's that
 * are gone.
 */
export function SiteDiff({ variant, other }: { variant: VariantKey; other: VariantKey }) {
  const mine = useSite(variant);
  const theirs = useSite(other);
  const showSite = useStore((s) => s.showSite);
  const pieces = useMemo(() => (mine && theirs ? changedPieces(theirs, mine) : []), [mine, theirs]);
  const items = useMemo(() => (mine && theirs ? changedItems(theirs, mine) : []), [mine, theirs]);
  if (!showSite || (!pieces.length && !items.length)) return null;
  return (
    <group>
      {pieces.map((p, i) => (
        <Piece key={i} p={p} />
      ))}
      {items.map(({ item, site, added }) => (
        <ItemBox key={`${added ? "+" : "-"}${item.id}`} item={item} site={site} added={added} />
      ))}
    </group>
  );
}

/** Garden items in one layout and not the other (or moved, turned, resized or swapped since). */
function changedItems(before: Site, after: Site): { item: GardenItem; site: Site; added: boolean }[] {
  const key = (it: GardenItem) => JSON.stringify([it.type, it.x, it.y, it.rot, it.w, it.d, it.h, it.to, it.toH, it.mount]);
  const was = new Map(itemsOf(before).map((it) => [it.id, key(it)]));
  const now = new Map(itemsOf(after).map((it) => [it.id, key(it)]));
  return [
    ...itemsOf(after).filter((it) => was.get(it.id) !== key(it)).map((item) => ({ item, site: after, added: true })),
    ...itemsOf(before).filter((it) => now.get(it.id) !== key(it)).map((item) => ({ item, site: before, added: false })),
  ];
}

/** A see-through box round a garden item's footprint and height: green if it is new here, red if gone. */
function ItemBox({ item, site, added }: { item: GardenItem; site: Site; added: boolean }) {
  const b = itemBounds(item);
  const { h } = itemSize(item);
  const base = GROUND_Y + groundHeightAt(site, { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }) + (item.mount ?? gardenDef(item.type)?.mount ?? 0);
  const top = Math.max(h, 0.1) + 0.05;
  return (
    <mesh position={[(b.x0 + b.x1) / 2, base + top / 2, (b.y0 + b.y1) / 2]} renderOrder={2}>
      <boxGeometry args={[b.x1 - b.x0 + 0.1, top, b.y1 - b.y0 + 0.1]} />
      <meshStandardMaterial color={added ? NEW : GONE} transparent opacity={added ? 0.35 : 0.25} depthWrite={false} />
    </mesh>
  );
}

function Piece({ p }: { p: BoundaryPiece }) {
  const cx = (p.a.x + p.b.x) / 2;
  const cz = (p.a.y + p.b.y) / 2;
  const rot = -Math.atan2(p.b.y - p.a.y, p.b.x - p.a.x);
  const box = (h: number, color: string, opacity: number, w = THICK) => (
    <mesh position={[cx, GROUND_Y + h / 2, cz]} rotation={[0, rot, 0]} renderOrder={2}>
      <boxGeometry args={[p.length, h, w]} />
      <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
  const before = p.before && p.before.kind !== "open" ? p.before : undefined;
  const after = p.after && p.after.kind !== "open" ? p.after : undefined;
  return (
    <>
      {after && box(Math.max(after.height, 0.2) + 0.04, NEW, 0.5)}
      {before && (!after || after.kind !== before.kind) && box(Math.max(before.height, 0.2) + 0.04, GONE, 0.3)}
      {p.after?.kind === "open" && before && box(0.06, NEW, 0.7, 0.6)}
    </>
  );
}
