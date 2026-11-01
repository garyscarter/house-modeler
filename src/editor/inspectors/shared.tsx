import { useEffect, useState } from "react";
import { useStore } from "../../store";

/** Mouse enter / leave handlers that light a room in the plan and in 3D (store.hoveredRoomId). */
const hoverRefs = new Map<string, (el: HTMLElement | null) => (() => void) | void>();
export function hoverRoom(id: string) {
  // A stable ref per id whose cleanup clears the hover when the element unmounts (no mouseleave fires then).
  let ref = hoverRefs.get(id);
  if (!ref) {
    ref = (el) => {
      if (!el) return;
      return () => {
        if (useStore.getState().hoveredRoomId === id) useStore.getState().setUi({ hoveredRoomId: null });
      };
    };
    hoverRefs.set(id, ref);
  }
  return {
    ref,
    onMouseEnter: () => useStore.getState().setUi({ hoveredRoomId: id }),
    onMouseLeave: () => {
      if (useStore.getState().hoveredRoomId === id) useStore.getState().setUi({ hoveredRoomId: null });
    },
  };
}

/**
 * A name input that commits when you leave it or press Enter (Escape undoes
 * the edit), so a rename is one undo step and never records a half-typed name.
 */
export function NameField({ value, onCommit, className, label }: { value: string; onCommit: (v: string) => void; className?: string; label?: string }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  const commit = () => {
    const v = text.trim();
    if (v && v !== value) onCommit(v);
    else setText(value);
  };
  return (
    <input
      className={className}
      aria-label={label}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(value);
          setFocused(false);
        }
      }}
    />
  );
}
