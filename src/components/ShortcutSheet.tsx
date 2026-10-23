import { useEffect, useState } from "react";
import { isMacPlatform } from "../lib/commands";
import { SHORTCUT_GROUPS } from "../lib/shortcuts";
import { OPEN_SHORTCUTS } from "../lib/studio";
import "./CommandPalette.css";

/** Overlay listing the keyboard shortcuts; opened with ? when focus is not in a field. */
export function ShortcutSheet() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SHORTCUTS, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SHORTCUTS, onOpen);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [open]);
  if (!open) return null;
  return (
    <div className="cmdk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="shortcuts-panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <h2>Keyboard shortcuts</h2>
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.title}>
            <h2>{g.title}</h2>
            {g.items.map((it) => (
              <div className="shortcuts-row" key={it.action}>
                <span>{it.action}</span>
                <span className="shortcuts-keys">
                  {it.keys.map((k, i) => (
                    <kbd className="keycap" key={i}>
                      {k === "⌘/Ctrl" ? (isMacPlatform() ? "⌘" : "Ctrl") : k}
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
