import { useEffect, useRef, useState, type ReactNode } from "react";

/** A small "i" button that explains something: shows on hover (after 150 ms) or focus, and stays on click. Esc or an outside click closes it. */
export function Info({ children, label = "More about this" }: { children: ReactNode; label?: string }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLSpanElement>(null);
  const open = hover || focus || pinned;

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setHover(false);
      setFocus(false);
      setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  return (
    <span
      className="info"
      ref={root}
      onPointerEnter={() => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setHover(true), 150);
      }}
      onPointerLeave={() => {
        window.clearTimeout(timer.current);
        setHover(false);
      }}
    >
      <button type="button" className="info-btn" aria-label={label} aria-expanded={open} onClick={() => setPinned((p) => !p)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}>
        i
      </button>
      {open && (
        <span className="info-pop popover" role="tooltip">
          {children}
        </span>
      )}
    </span>
  );
}
