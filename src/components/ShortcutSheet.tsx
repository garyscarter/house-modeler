import { useEffect, useState } from "react";
import { SHORTCUT_GROUPS } from "../lib/shortcuts";
import "./CommandPalette.css";

/** Overlay listing the keyboard shortcuts; opened with ? when focus is not in a field. */
export function ShortcutSheet() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!open) return null;
  return (
    <div className="cmdk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="shortcuts-panel" role="dialog" aria-label="Keyboard shortcuts">
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.title}>
            <h2>{g.title}</h2>
            {g.items.map((it) => (
              <div className="shortcuts-row" key={it.action}>
                <span>{it.action}</span>
                <span className="shortcuts-keys">
                  {it.keys.map((k, i) => (
                    <kbd className="keycap" key={i}>
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
