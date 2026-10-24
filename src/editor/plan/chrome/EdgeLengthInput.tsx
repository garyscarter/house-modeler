import { useState } from "react";
import { edgeLengthsM, type Size } from "../../../lib/planMath";
import type { Pt, Room } from "../../../types";
import { NumberField } from "../../Inspectors";
import { edgeLabelAt } from "../layers/shared";

/** A small field over the plan for typing an edge's new length. */
export function EdgeLengthInput({
  room,
  idx,
  ppm,
  px,
  fontSize,
  toScreen,
  bounds,
  onCommit,
  onClose,
}: {
  room: Room;
  idx: number;
  ppm: number;
  px: number;
  fontSize: number;
  toScreen: (p: Pt) => Pt;
  bounds: Size;
  onCommit: (m: number) => void;
  onClose: () => void;
}) {
  // Pinned where it opened (the label moves as the length changes, the field should not), and kept on screen.
  const [s] = useState(() => {
    const p = toScreen(edgeLabelAt(room, idx, px, fontSize, ppm));
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(Math.max(lo, hi), v));
    return { x: clamp(p.x, 72, bounds.w - 72), y: clamp(p.y, 24, bounds.h - 24) };
  });
  const len = edgeLengthsM(room.polygon, ppm)[idx];
  return (
    <div className="edge-input" style={{ left: s.x, top: s.y }} onBlur={onClose}>
      <NumberField value={len} label="Edge length in metres" autoFocus onCommit={onCommit} onDone={onClose} />
      <span>m</span>
    </div>
  );
}
