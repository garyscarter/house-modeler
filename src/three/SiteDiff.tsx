import { useMemo } from "react";
import type { VariantKey } from "../types";
import { useSite, useStore } from "../store";
import { changedPieces, type BoundaryPiece } from "../lib/siteDiff";
import { GROUND_Y } from "./Site";

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
  if (!showSite || !pieces.length) return null;
  return (
    <group>
      {pieces.map((p, i) => (
        <Piece key={i} p={p} />
      ))}
    </group>
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
