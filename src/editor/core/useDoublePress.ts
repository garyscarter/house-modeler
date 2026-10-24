import { useCallback, useRef } from "react";
import { isDoublePress, type PressRecord } from "../../lib/editorCore";

/**
 * Double press without native dblclick: call it on every press with a key naming what was pressed. It returns
 * true on the second press of the same key within DOUBLE_PRESS_MS and DOUBLE_PRESS_PX, then forgets.
 */
export function useDoublePress(): (key: string, e: React.PointerEvent) => boolean {
  const last = useRef<PressRecord | null>(null);
  return useCallback((key, e) => {
    const next: PressRecord = { key, at: e.timeStamp, x: e.clientX, y: e.clientY };
    const dbl = isDoublePress(last.current, next);
    last.current = dbl ? null : next;
    return dbl;
  }, []);
}
