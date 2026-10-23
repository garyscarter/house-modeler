import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { fitCam, panCam, zoomCam, type Cam, type Rect, type Size } from "../lib/planMath";
import { wheelClassifier, wheelPixels } from "../lib/wheelGesture";

/**
 * Camera for the plan editor: tracks the element's size, fits `home` when
 * `fitKey` changes (a different floor), pans on a trackpad two-finger swipe and
 * zooms at the cursor on the mouse wheel or a trackpad pinch. Scale limits: from 1 m filling about 2000 screen
 * px to the whole image at a third of the element.
 */
export function usePlanCamera(el: RefObject<HTMLElement | null>, home: Rect, fitKey: string, pxPerM: number, imageSize: Size) {
  const [size, setSize] = useState<Size | null>(null);
  const [cam, setCam] = useState<Cam | null>(null);
  const limits = useRef({ min: 0, max: Infinity });
  limits.current = size
    ? { min: pxPerM / 2000, max: Math.max(imageSize.w / size.w, imageSize.h / size.h) * 3 }
    : { min: 0, max: Infinity };

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [el]);

  const hasSize = size !== null;
  const homeRef = useRef(home);
  homeRef.current = home;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  // Fit once the element has a size, and again whenever a different floor is shown.
  useEffect(() => {
    if (sizeRef.current) setCam(fitCam(homeRef.current, sizeRef.current));
  }, [fitKey, hasSize]);

  const fit = useCallback((r?: Rect) => {
    if (sizeRef.current) setCam(fitCam(r ?? homeRef.current, sizeRef.current));
  }, []);

  const zoomBy = useCallback((factor: number, at?: { x: number; y: number }) => {
    const s = sizeRef.current;
    if (!s) return;
    setCam((c) => c && zoomCam(c, at ?? { x: s.w / 2, y: s.h / 2 }, factor, limits.current.min, limits.current.max));
  }, []);

  // React's onWheel is passive, so the page would scroll too; listen natively.
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const intentOf = wheelClassifier();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { dx, dy } = wheelPixels(e);
      // A two-finger swipe moves the plan; a pinch or a mouse wheel zooms.
      if (intentOf(e, e.timeStamp) === "pan") {
        setCam((c) => c && panCam(c, -dx, -dy));
        return;
      }
      const r = node.getBoundingClientRect();
      // Trackpad pinches arrive as ctrl+wheel with small deltas; give them more punch.
      const k = e.ctrlKey ? 0.01 : 0.0015;
      zoomBy(Math.exp(-dy * k), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [el, zoomBy]);

  return { size, cam, setCam, fit, zoomBy, limits };
}
