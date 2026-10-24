import { useEffect, useRef } from "react";
import { keyBelongsElsewhere } from "../../lib/nudge";
import { useStore } from "../../store";

/**
 * One window keydown listener (bubble phase) that reads the latest handler through a ref, so it is attached once.
 * It ignores the event when the key belongs to a field or dialog, or while peeking at the other layout.
 * (InspectorCard must keep no role="dialog", or every editor key dies while the card is open.)
 */
export function useEditorKeys(handler: (e: KeyboardEvent) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (keyBelongsElsewhere(e.target, document) || useStore.getState().peek) return;
      ref.current(e);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}
