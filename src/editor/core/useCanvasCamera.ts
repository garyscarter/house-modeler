import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { clampScale, frameOf, liveTransform, resizeCam, WHEEL_COMMIT_MS, wheelZoomFactor, type Frame } from "../../lib/editorCore";
import { fitCamInset, INSPECTOR_INSET, panCam, zoomCam, type Cam, type Rect, type Size } from "../../lib/planMath";
import { wheelClassifier, wheelPixels } from "../../lib/wheelGesture";
import type { Pt } from "../../types";

export interface CameraOptions {
  /** The model rect "Fit" shows (plan: the rooms or the image; site: the plot). */
  home: Rect;
  /** Fit again when this changes (plan: floor id; site: a constant). */
  fitKey: string;
  /** Model units per metre: plan floor.pxPerM; site 1. */
  unitsPerM: number;
  limits: (size: Size) => { minS: number; maxS: number };
  /** What a resize keeps in place: the top-left (plan, default) or the centre (site). */
  anchor?: "topLeft" | "centre";
  /** Width the floating inspector card covers on the right. Default: INSPECTOR_INSET when the enclosing main has one. */
  insetRight?: () => number;
  /** Height the phone's bottom sheet and dock cover at the bottom. Default 0. */
  insetBottom?: () => number;
  /** Width the tool rail covers on the left (the phone, where the plan has no room to spare). Default 0. */
  insetLeft?: () => number;
  /** Padding Fit adds around `home`, as a fraction of its larger side. Default 0.06 (the plan); the site passes 0. */
  padFrac?: number;
}

export interface CanvasCamera {
  size: Size | null;
  /** The committed camera (React state). */
  cam: Cam | null;
  /** The committed scale, 1 before the first fit. */
  px: number;
  /** The committed SVG viewBox. */
  viewBox: string;
  /** Put this on the root `<g>` holding everything in model units: it takes the live transform during a gesture. */
  layerRef: RefObject<SVGGElement | null>;
  /** From the LIVE camera: use it for every pointer conversion. */
  frame(): Frame;
  /** The live camera (the committed one at rest). Added to the plan's API so the drag hook can start a pan. */
  live(): Cam | null;
  /** The scale limits for the current size. */
  limits(): { minS: number; maxS: number };
  fit(r?: Rect): void;
  zoomBy(factor: number, at?: Pt): void;
  setCam(c: Cam): void;
  gesture: { begin(): void; update(c: Cam): void; commit(): void; cancel(): void };
}

const sameCam = (a: Cam, b: Cam) => a.x === b.x && a.y === b.y && a.s === b.s;

/**
 * The camera for a 2D canvas. At rest it is the SVG viewBox. During a gesture (pan, pinch, wheel burst) the
 * live camera is held in a ref and shown as a transform on the layer `<g>`, so nothing re-renders; the gesture
 * commits on release (the wheel after WHEEL_COMMIT_MS of quiet) and the transform is cleared in a layout effect
 * keyed on the committed camera, so no frame shows a double offset.
 */
export function useCanvasCamera(el: RefObject<HTMLElement | null>, o: CameraOptions): CanvasCamera {
  const [size, setSize] = useState<Size | null>(null);
  const [cam, setCamState] = useState<Cam | null>(null);
  const opts = useRef(o);
  opts.current = o;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const camRef = useRef(cam);
  camRef.current = cam;
  const liveRef = useRef<Cam | null>(null);
  const layerRef = useRef<SVGGElement | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const limitsNow = useCallback(() => {
    const s = sizeRef.current;
    return s ? opts.current.limits(s) : { minS: 0, maxS: Infinity };
  }, []);

  const coveredRight = useCallback(() => {
    const custom = opts.current.insetRight;
    if (custom) return custom();
    const main = el.current?.closest("main");
    return main?.querySelector(".inspector-card") ? INSPECTOR_INSET : 0;
  }, [el]);

  const coveredBottom = useCallback(() => opts.current.insetBottom?.() ?? 0, []);
  const coveredLeft = useCallback(() => opts.current.insetLeft?.() ?? 0, []);

  const writeTransform = useCallback(() => {
    const g = layerRef.current;
    const c = camRef.current;
    const l = liveRef.current;
    if (!g || !c || !l) return;
    const t = liveTransform(c, l);
    if (t) g.setAttribute("transform", t);
    else g.removeAttribute("transform");
  }, []);

  // Track the element's size; a hidden (0 x 0) element is ignored. A resize keeps the anchor point still.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!(width > 0 && height > 0)) return;
      const next = { w: width, h: height };
      const prev = sizeRef.current;
      const c = camRef.current;
      if (prev && c) {
        const moved = resizeCam(c, prev, next, opts.current.anchor ?? "topLeft");
        if (!sameCam(moved, c)) {
          liveRef.current = moved;
          setCamState(moved);
        }
      }
      setSize(next);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [el]);

  // Fit once the element has a size, and again whenever fitKey changes.
  const hasSize = size !== null;
  useEffect(() => {
    const s = sizeRef.current;
    if (!s) return;
    const c = fitCamInset(opts.current.home, s, coveredRight(), opts.current.padFrac, coveredBottom(), coveredLeft());
    liveRef.current = c;
    setCamState(c);
  }, [o.fitKey, hasSize, coveredRight, coveredBottom, coveredLeft]);

  // A committed camera replaces the live transform in the same commit.
  useLayoutEffect(() => {
    liveRef.current = cam;
    layerRef.current?.removeAttribute("transform");
  }, [cam]);

  useEffect(() => () => clearTimeout(wheelTimer.current), []);

  const gesture = useMemo<CanvasCamera["gesture"]>(
    () => ({
      begin() {
        clearTimeout(wheelTimer.current);
        if (!liveRef.current) liveRef.current = camRef.current;
      },
      update(c) {
        const s = sizeRef.current;
        const { minS, maxS } = limitsNow();
        liveRef.current = s ? clampScale(c, minS, maxS, { x: s.w / 2, y: s.h / 2 }) : c;
        writeTransform();
      },
      commit() {
        clearTimeout(wheelTimer.current);
        const l = liveRef.current;
        const c = camRef.current;
        if (l && c && !sameCam(l, c)) setCamState(l);
        else {
          liveRef.current = c;
          writeTransform();
        }
      },
      cancel() {
        clearTimeout(wheelTimer.current);
        liveRef.current = camRef.current;
        layerRef.current?.removeAttribute("transform");
      },
    }),
    [limitsNow, writeTransform],
  );

  const setCam = useCallback((c: Cam) => {
    clearTimeout(wheelTimer.current);
    liveRef.current = c;
    setCamState(c);
  }, []);

  const fit = useCallback(
    (r?: Rect) => {
      const s = sizeRef.current;
      if (s) setCam(fitCamInset(r ?? opts.current.home, s, coveredRight(), opts.current.padFrac, coveredBottom(), coveredLeft()));
    },
    [coveredRight, coveredBottom, coveredLeft, setCam],
  );

  const zoomBy = useCallback(
    (factor: number, at?: Pt) => {
      const s = sizeRef.current;
      const base = liveRef.current ?? camRef.current;
      if (!s || !base) return;
      const { minS, maxS } = limitsNow();
      setCam(zoomCam(base, at ?? { x: s.w / 2, y: s.h / 2 }, factor, minS, maxS));
    },
    [limitsNow, setCam],
  );

  // React's onWheel is passive, so the page would scroll too; listen natively.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const intentOf = wheelClassifier();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const base = liveRef.current ?? camRef.current;
      if (!base) return;
      const { dx, dy } = wheelPixels(e);
      gesture.begin();
      if (intentOf(e, e.timeStamp) === "pan") {
        gesture.update(panCam(base, -dx, -dy));
      } else {
        const r = node.getBoundingClientRect();
        const { minS, maxS } = limitsNow();
        gesture.update(zoomCam(base, { x: e.clientX - r.left, y: e.clientY - r.top }, wheelZoomFactor(dy, e.ctrlKey), minS, maxS));
      }
      clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => gesture.commit(), WHEEL_COMMIT_MS);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [el, gesture, limitsNow]);

  const frame = useCallback((): Frame => {
    const c = liveRef.current ?? camRef.current ?? { x: 0, y: 0, s: 1 };
    const r = el.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return frameOf(c, r, opts.current.unitsPerM);
  }, [el]);

  const live = useCallback(() => liveRef.current ?? camRef.current, []);

  const viewBox = cam && size ? `${cam.x} ${cam.y} ${size.w * cam.s} ${size.h * cam.s}` : "0 0 1 1";

  return { size, cam, px: cam?.s ?? 1, viewBox, layerRef, frame, live, limits: limitsNow, fit, zoomBy, setCam, gesture };
}
