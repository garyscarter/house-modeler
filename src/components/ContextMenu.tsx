import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChassis } from "./useChassis";

export type MenuItem = { label: string; hint?: string; danger?: boolean; disabled?: boolean; run: () => void } | "sep";
export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

/** A right-click menu at a viewport point, clamped to the window. Arrows move, Enter runs, Esc / outside click / wheel / blur close. */
export function ContextMenu({ menu, onClose }: { menu: MenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const sheet = useChassis((s) => s.chassis) === "phone";
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Measure once rendered, then clamp into the viewport.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)), top: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)) });
  }, [menu]);

  // Focus the first item once the menu is visible.
  useEffect(() => {
    if (pos) ref.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
  }, [pos]);

  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("pointerdown", down, true);
    if (!sheet) window.addEventListener("wheel", onClose, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      if (!sheet) window.removeEventListener("wheel", onClose, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("keydown", key, true);
    };
  }, [menu, onClose, sheet]);

  if (!menu) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    e.stopPropagation();
    const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? []);
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
    btns[next].focus();
  };

  return createPortal(
    <div
      ref={ref}
      className={sheet ? "ctx-menu ctx-sheet" : "ctx-menu"}
      role="menu"
      style={sheet ? undefined : { left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? "visible" : "hidden" }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((it, i) =>
        it === "sep" ? (
          <hr key={i} role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={it.danger ? "danger" : undefined}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.run();
            }}
          >
            <span>{it.label}</span>
            {it.hint && <span className="ctx-hint">{it.hint}</span>}
          </button>
        ),
      )}
      {sheet && (
        <button type="button" role="menuitem" className="ctx-cancel" onClick={onClose}>
          <span>Cancel</span>
        </button>
      )}
    </div>,
    document.body,
  );
}
