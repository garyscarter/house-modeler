import { useMemo, useRef, useState } from "react";
import { VARIANT_LABEL, type Floor, type Photo, type Room, type VariantKey } from "../types";
import type { V2 } from "../lib/geometry";
import { useStore } from "../store";
import { SunControls } from "../components/SunControls";
import { Viewer } from "./Viewer";
import { ViewCube } from "./ViewCube";
import "./Wipe.css";

export interface WipeCompareProps {
  photos: Photo[];
  showLabels: boolean;
  showCeilings: boolean;
  doorsOpen: boolean;
  selectedRoomId: string | null;
  onSelectRoom: (floor: Floor, room: Room, variant: VariantKey) => void;
  /** Decorate: a click on a wall face in either view (see Viewer's onPickWall), with the layout it was in. */
  onPickWall?: (floor: Floor, hit: V2, normal: V2, bays: { id: string; poly: V2[] }[] | undefined, variant: VariantKey) => void;
  maxLevel: number | null;
  showExterior: boolean;
}

const MIN = 0.05;
const MAX = 0.95;
const STEP = 0.05;
const clamp = (x: number) => Math.min(MAX, Math.max(MIN, x));

/**
 * As listed and Proposed in the same box, from one camera. Two canvases are
 * stacked; the Proposed one is clipped to the right of a draggable divider, so
 * a drag left of the line orbits both and a drag right of it does too (the
 * cameras are linked, see cameraLink.ts). The divider position is written to a
 * CSS variable while dragging, so moving it never re-renders the canvases.
 */
export function WipeCompare(p: WipeCompareProps) {
  const variants = useStore((s) => s.variants);
  const [pos, setPos] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const divider = useRef<HTMLDivElement>(null);
  const live = useRef(0.5);

  const write = (x: number) => {
    live.current = clamp(x);
    root.current?.style.setProperty("--wipe", String(live.current));
    divider.current?.setAttribute("aria-valuenow", String(Math.round(live.current * 100)));
  };
  const fromEvent = (e: React.PointerEvent) => {
    const r = root.current!.getBoundingClientRect();
    return r.width > 0 ? (e.clientX - r.left) / r.width : 0.5;
  };

  // Per-layout handlers, kept stable so the viewers' memoised floors don't re-render when the divider moves.
  const { onSelectRoom, onPickWall } = p;
  const handlers = useMemo(() => {
    const per = (k: VariantKey) => ({
      select: (f: Floor, r: Room) => onSelectRoom(f, r, k),
      wall: onPickWall && ((f: Floor, hit: V2, normal: V2, bays?: { id: string; poly: V2[] }[]) => onPickWall(f, hit, normal, bays, k)),
    });
    return { current: per("current"), proposed: per("proposed") };
  }, [onSelectRoom, onPickWall]);

  const { current, proposed } = variants;
  if (!current || !proposed) {
    const k: VariantKey = proposed ? "proposed" : "current";
    const model = proposed ?? current;
    return (
      <div className="wipe">
        {model && (
          <Viewer
            model={model}
            variant={k}
            photos={p.photos}
            showLabels={p.showLabels}
            showCeilings={p.showCeilings}
            doorsOpen={p.doorsOpen}
            selectedRoomId={p.selectedRoomId}
            onSelectRoom={handlers[k].select}
            onPickWall={handlers[k].wall}
            maxLevel={p.maxLevel}
            showExterior={p.showExterior}
            chrome={false}
          />
        )}
        <ViewCube />
        <SunControls />
      </div>
    );
  }

  const shared = {
    photos: p.photos,
    showLabels: p.showLabels,
    showCeilings: p.showCeilings,
    doorsOpen: p.doorsOpen,
    selectedRoomId: p.selectedRoomId,
    maxLevel: p.maxLevel,
    showExterior: p.showExterior,
    chrome: false,
  };

  return (
    <div ref={root} className={`wipe${dragging ? " dragging" : ""}`} style={{ "--wipe": pos } as React.CSSProperties}>
      <Viewer {...shared} model={current} variant="current" captureId="wipe-current" onSelectRoom={handlers.current.select} onPickWall={handlers.current.wall} />
      <div className="wipe-top">
        <Viewer {...shared} model={proposed} variant="proposed" captureId="wipe-proposed" onSelectRoom={handlers.proposed.select} onPickWall={handlers.proposed.wall} />
      </div>

      <span className="wipe-label before" aria-hidden>
        <i />
        {VARIANT_LABEL.current}
      </span>
      <span className="wipe-label after" aria-hidden>
        <i />
        {VARIANT_LABEL.proposed}
      </span>

      <div
        ref={divider}
        className="wipe-divider"
        role="slider"
        tabIndex={0}
        aria-label="Wipe position"
        aria-orientation="horizontal"
        aria-valuemin={5}
        aria-valuemax={95}
        aria-valuenow={Math.round(pos * 100)}
        aria-valuetext={`${Math.round(pos * 100)}% ${VARIANT_LABEL.current}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          write(fromEvent(e));
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) write(fromEvent(e));
        }}
        onPointerUp={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
          setPos(live.current);
        }}
        onPointerCancel={() => {
          setDragging(false);
          setPos(live.current);
        }}
        onKeyDown={(e) => {
          const d = e.key === "ArrowLeft" ? -STEP : e.key === "ArrowRight" ? STEP : 0;
          const to = e.key === "Home" ? MIN : e.key === "End" ? MAX : d ? live.current + d : null;
          if (to === null) return;
          e.preventDefault();
          e.stopPropagation();
          write(to);
          setPos(live.current);
        }}
      >
        <span className="wipe-line" />
        <span className="wipe-handle" aria-hidden>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
          </svg>
        </span>
      </div>

      <ViewCube />
      <SunControls />
    </div>
  );
}
