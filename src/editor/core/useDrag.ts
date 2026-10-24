import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { CLICK_SLOP_PX, IDLE, pinchOf, reduceDrag, type DragEffect, type DragEvent, type DragPhase } from "../../lib/editorCore";
import { panCam, pinchCam, type Cam } from "../../lib/planMath";
import { holdUndo, useStore } from "../../store";
import type { Pt } from "../../types";
import type { CanvasCamera } from "./useCanvasCamera";

/** A primary press: model point `at`, element-local px `local`, client px `client`. */
export interface Press {
  pointerId: number;
  pointerType: string;
  client: Pt;
  local: Pt;
  at: Pt;
  time: number;
  shift: boolean;
  alt: boolean;
  mod: boolean;
}

/** `delta` is model units since the press; `screen` is px since the press. */
export interface Move {
  client: Pt;
  local: Pt;
  at: Pt;
  delta: Pt;
  screen: Pt;
  shift: boolean;
  alt: boolean;
  mod: boolean;
}

export interface DragSpec<K extends string = string, D = unknown> {
  kind: K;
  data: D;
  /** Default true: snapshot the store and hold undo, so the drag is one undo step and Esc restores it. */
  undo?: boolean;
  /** Screen px before the drag starts moving; default CLICK_SLOP_PX. 0 moves from the first event. */
  slop?: number;
  start?(d: ActiveDrag<K, D>): void;
  /** At most once per animation frame, with the newest move. */
  move?(m: Move, d: ActiveDrag<K, D>): void;
  /** After a real drag. */
  end?(m: Move, d: ActiveDrag<K, D>): void;
  /** Released within the slop. */
  tap?(m: Move, d: ActiveDrag<K, D>): void;
  /** After the snapshot was restored. */
  cancelled?(d: ActiveDrag<K, D>): void;
}
export type ActiveDrag<K extends string = string, D = unknown> = DragSpec<K, D> & { press: Press; moved: boolean };

export interface DragOptions {
  svg: RefObject<SVGSVGElement | null>;
  camera: CanvasCamera;
  /** A press on the background: a spec (plan marquee, site rectangle) or null for a pan. */
  background(p: Press): DragSpec | null;
  /** A pan released within the slop. */
  backgroundTap?(m: Move): void;
  /** Pointer moves with no press; null on leave. */
  hover?(m: Move | null): void;
  /** e.g. peek: presses are ignored. */
  disabled?(): boolean;
}

export interface DragApi {
  /** Start a drag from a press on a child: stops propagation, captures the pointer, snapshots, holds undo. */
  begin(e: React.PointerEvent, spec: DragSpec): void;
  /** Start a pan from a press on a child (the site: pressing an unselected item). */
  beginPan(e: React.PointerEvent, opts?: { tap?: (m: Move) => void }): void;
  /** Esc-style cancel: false when nothing cancellable runs. */
  cancel(): boolean;
  active(): ActiveDrag | null;
  /** The running drag's kind, as React state set on start and end only. */
  kind: string | null;
  svgProps: Pick<
    React.SVGProps<SVGSVGElement>,
    "onPointerDownCapture" | "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture" | "onPointerLeave"
  >;
}

interface Run {
  d: ActiveDrag;
  snapshot: Record<string, unknown> | null;
  pending: Move | null;
  raf: number;
  last: Move;
}

/** True for a left-button mouse press, or any touch or pen press; a right press is left alone so contextmenu fires. */
const isPrimary = (e: { button: number; pointerType: string }) => e.pointerType !== "mouse" || e.button === 0;

/** The store parts a drag can change, restored by Esc. */
function snapshotStore() {
  const { variants, sites, past, future } = useStore.getState();
  return { variants, sites, past, future };
}

/**
 * The pointer machine for one editor: pan and pinch are built in, everything else is a DragSpec. Pointer capture
 * is on the SVG root at every primary press (so native click and dblclick are never used); moves are coalesced to
 * one per animation frame; Esc (capture phase), window blur, a second pointer and unmount cancel and restore.
 */
export function useDrag(o: DragOptions): DragApi {
  const opts = useRef(o);
  opts.current = o;
  const [kind, setKind] = useState<string | null>(null);

  const pointers = useRef(new Map<number, Pt>());
  const phase = useRef<DragPhase>(IDLE);
  const run = useRef<Run | null>(null);
  const pinch = useRef<{ c0: Cam; m0: Pt; d0: number } | null>(null);

  /** Client px to px local to the camera's element (the frame the Cam is in), not the SVG's own box. */
  const localOf = (c: Pt): Pt => {
    const frame = opts.current.camera.frame();
    return frame.toScreen(frame.fromClient({ clientX: c.x, clientY: c.y }));
  };

  const moveOf = (e: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }, press: Press | null): Move => {
    const frame = opts.current.camera.frame();
    const at = frame.fromClient(e);
    return {
      client: { x: e.clientX, y: e.clientY },
      local: frame.toScreen(at),
      at,
      delta: press ? { x: at.x - press.at.x, y: at.y - press.at.y } : { x: 0, y: 0 },
      screen: press ? { x: e.clientX - press.client.x, y: e.clientY - press.client.y } : { x: 0, y: 0 },
      shift: e.shiftKey,
      alt: e.altKey,
      mod: e.ctrlKey || e.metaKey,
    };
  };

  const pressOf = (e: React.PointerEvent): Press => {
    const m = moveOf(e, null);
    return { pointerId: e.pointerId, pointerType: e.pointerType, client: m.client, local: m.local, at: m.at, time: e.timeStamp, shift: m.shift, alt: m.alt, mod: m.mod };
  };

  const releaseCapture = (id: number) => {
    try {
      opts.current.svg.current?.releasePointerCapture(id);
    } catch {
      /* already released */
    }
  };

  /** Carry out the reducer's effects for the running drag. */
  const dispatch = (ev: DragEvent) => {
    const r = reduceDrag(phase.current, ev);
    phase.current = r.phase;
    const cur = run.current;
    if (!cur) return;
    const { d } = cur;
    for (const fx of r.effects as DragEffect[]) {
      switch (fx) {
        case "start":
          d.moved = true;
          setKind(d.kind);
          d.start?.(d);
          break;
        case "move":
          cur.pending = cur.last;
          if (!cur.raf) {
            cur.raf = requestAnimationFrame(() => {
              cur.raf = 0;
              const m = cur.pending;
              cur.pending = null;
              if (m && run.current === cur) d.move?.(m, d);
            });
          }
          break;
        case "flush":
          if (cur.raf) cancelAnimationFrame(cur.raf);
          cur.raf = 0;
          if (cur.pending) d.move?.(cur.pending, d);
          cur.pending = null;
          break;
        case "end":
          d.end?.(cur.last, d);
          break;
        case "tap":
          d.tap?.(cur.last, d);
          break;
        case "restore":
          if (cur.snapshot) useStore.setState(cur.snapshot);
          break;
        case "finish":
          if (cur.raf) cancelAnimationFrame(cur.raf);
          cur.raf = 0;
          cur.pending = null;
          if (cur.snapshot) holdUndo(false);
          releaseCapture(d.press.pointerId);
          run.current = null;
          setKind(null);
          break;
        case "cancelled":
          d.cancelled?.(d);
          break;
      }
    }
  };

  const startSpec = (e: React.PointerEvent, spec: DragSpec) => {
    const press = pressOf(e);
    const snapshot = spec.undo !== false ? snapshotStore() : null;
    if (snapshot) holdUndo(true);
    try {
      opts.current.svg.current?.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    const d: ActiveDrag = { ...spec, press, moved: false };
    run.current = { d, snapshot, pending: null, raf: 0, last: moveOf(e, press) };
    dispatch({ type: "press", pointerId: e.pointerId, client: press.client, slop: spec.slop ?? CLICK_SLOP_PX });
  };

  const panSpec = (tap?: (m: Move) => void): DragSpec => {
    const cam = opts.current.camera;
    const cam0 = cam.live();
    return {
      kind: "pan",
      data: null,
      undo: false,
      start: () => cam.gesture.begin(),
      move: (m) => cam0 && cam.gesture.update(panCam(cam0, m.screen.x, m.screen.y)),
      end: () => cam.gesture.commit(),
      tap: tap ? (m) => tap(m) : undefined,
      cancelled: () => cam.gesture.cancel(),
    };
  };

  const endPinch = (commit: boolean) => {
    if (!pinch.current) return;
    pinch.current = null;
    if (commit) opts.current.camera.gesture.commit();
    else opts.current.camera.gesture.cancel();
  };

  const cancel = useCallback((): boolean => {
    if (pinch.current) {
      endPinch(false);
      return true;
    }
    if (!run.current) return false;
    dispatch({ type: "cancel" });
    return true;
  }, []);

  const begin = (e: React.PointerEvent, spec: DragSpec) => {
    if (!isPrimary(e) || pinch.current || run.current || !opts.current.camera.cam) return;
    e.stopPropagation();
    startSpec(e, spec);
  };

  const beginPan = (e: React.PointerEvent, popts?: { tap?: (m: Move) => void }) => begin(e, panSpec(popts?.tap));

  const onPointerDownCapture = (e: React.PointerEvent) => {
    if (opts.current.disabled?.()) {
      e.stopPropagation();
      return;
    }
    // A mouse has one pointer; clear any press whose release happened off the canvas.
    if (e.pointerType === "mouse") pointers.current.clear();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && !pinch.current && opts.current.camera.cam) {
      // A second pointer cancels whatever the first began and pinches instead; the press never reaches a handle.
      e.stopPropagation();
      cancel();
      // cancel() released the first pointer; take it back (and the new one) before the browser processes the
      // release, so no lostpointercapture arrives to end the pinch it is part of.
      for (const id of pointers.current.keys()) {
        try {
          opts.current.svg.current?.setPointerCapture(id);
        } catch {
          /* the pointer is already gone */
        }
      }
      const [a, b] = [...pointers.current.values()];
      const { m, d } = pinchOf(a, b);
      const c0 = opts.current.camera.live();
      if (!c0) return;
      opts.current.camera.gesture.begin();
      pinch.current = { c0, m0: localOf(m), d0: d };
    } else if (pinch.current) {
      e.stopPropagation();
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Only a press on the background (or on something that doesn't handle it) gets here.
    if (opts.current.disabled?.() || !isPrimary(e) || pinch.current || run.current || !opts.current.camera.cam) return;
    const press = pressOf(e);
    const spec = opts.current.background(press) ?? panSpec(opts.current.backgroundTap);
    startSpec(e, spec);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (opts.current.disabled?.()) return;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pz = pinch.current;
    if (pz) {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const { m, d } = pinchOf(a, b);
      const { minS, maxS } = opts.current.camera.limits();
      opts.current.camera.gesture.update(pinchCam(pz.c0, pz.m0, localOf(m), pz.d0, d, minS, maxS));
      return;
    }
    const cur = run.current;
    if (cur) {
      if (e.pointerId !== cur.d.press.pointerId) return;
      cur.last = moveOf(e, cur.d.press);
      dispatch({ type: "move", pointerId: e.pointerId, client: cur.last.client });
      return;
    }
    opts.current.hover?.(moveOf(e, null));
  };

  const finishPointer = (e: React.PointerEvent, type: "up" | "lost") => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) endPinch(true);
      return;
    }
    const cur = run.current;
    if (!cur || e.pointerId !== cur.d.press.pointerId) return;
    cur.last = moveOf(e, cur.d.press);
    dispatch({ type, pointerId: e.pointerId });
  };

  // Esc (capture phase, so it runs before menus and the editors' own Esc handling) and window blur cancel the drag.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !run.current) return;
      if (cancel()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onBlur = () => {
      cancel();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [cancel]);

  // Unmount cancels and makes sure undo is not left held.
  useEffect(
    () => () => {
      pinch.current = null;
      if (run.current) dispatch({ type: "cancel" });
      holdUndo(false);
    },
    [],
  );

  const svgProps = useMemo<DragApi["svgProps"]>(
    () => ({
      onPointerDownCapture,
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => finishPointer(e, "up"),
      onPointerCancel: (e) => finishPointer(e, "lost"),
      onLostPointerCapture: (e) => {
        // Only the SVG's own capture counts (the event bubbles from any child that captured), and a pinch keeps
        // its pointers until they lift: a lost capture there is the release cancel() made, not the finger going.
        if (e.target !== e.currentTarget || pinch.current) return;
        finishPointer(e, "lost");
      },
      onPointerLeave: () => {
        if (!run.current && !pinch.current) opts.current.hover?.(null);
      },
    }),
    // The handlers read everything through refs, so they stay the same object for the life of the editor.
    [],
  );

  return {
    begin,
    beginPan,
    cancel,
    active: () => run.current?.d ?? null,
    kind,
    svgProps,
  };
}
