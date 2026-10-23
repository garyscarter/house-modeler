import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { SITE_EDIT_ID, useStore } from "../store";
import { buildCommands, defaultCommands, isMacPlatform, rankCommands } from "../lib/commands";
import { goToSavedView, saveCurrentView } from "./savedViewActions";
import { usePanelPrefs } from "./panelPrefs";
import { OPEN_PALETTE } from "../lib/studio";
import "./CommandPalette.css";

/** Split a hint like "⌘⇧Z" or "Ctrl+Z" into keycaps. */
const hintKeys = (h: string): string[] => (h.includes("+") ? h.split("+") : (h.match(/[⌘⇧]|[^⌘⇧]+/g) ?? [h]));

/** ⌘K / Ctrl+K command palette: search every room and action in the app. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(OPEN_PALETTE, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(OPEN_PALETTE, onOpen);
    };
  }, []);

  return open ? <Palette close={() => setOpen(false)} /> : null;
}

function Palette({ close }: { close: () => void }) {
  const s = useStore(
    useShallow((st) => ({
      activeVariant: st.activeVariant,
      doorsOpen: st.doorsOpen,
      mode: st.mode,
      redo: st.redo,
      savedViews: st.savedViews,
      selectedRoomId: st.selectedRoomId,
      setMode: st.setMode,
      setSettings: st.setSettings,
      setUi: st.setUi,
      settings: st.settings,
      showCeilings: st.showCeilings,
      showExterior: st.showExterior,
      showLabels: st.showLabels,
      showSite: st.showSite,
      tab: st.tab,
      undo: st.undo,
      updateRoom: st.updateRoom,
      variants: st.variants,
      viewMode: st.viewMode,
    })),
  );
  const look = usePanelPrefs((p) => p.look);
  const setPrefs = usePanelPrefs((p) => p.setPrefs);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const all = buildCommands({
      variants: s.variants,
      activeVariant: s.activeVariant,
      tab: s.tab,
      viewMode: s.viewMode,
      mode: s.mode,
      setMode: s.setMode,
      look,
      setLook: (l) => setPrefs({ look: l }),
      selectedRoomId: s.selectedRoomId,
      showLabels: s.showLabels,
      showCeilings: s.showCeilings,
      doorsOpen: s.doorsOpen,
      showExterior: s.showExterior,
      showSite: s.showSite,
      quality: s.settings.quality,
      siteEditId: SITE_EDIT_ID,
      isMac: isMacPlatform(),
      setUi: s.setUi as (p: Record<string, unknown>) => void,
      updateRoom: s.updateRoom,
      setSettings: s.setSettings,
      undo: s.undo,
      redo: s.redo,
      dispatch: (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail })),
      savedViews: s.savedViews.map((v) => ({ id: v.id, name: v.name })),
      saveView: () => void saveCurrentView(),
      goToView: (id) => {
        const v = useStore.getState().savedViews.find((x) => x.id === id);
        if (v) void goToSavedView(v);
      },
    });
    return query.trim() ? rankCommands(query, all, 30) : defaultCommands(all);
  }, [query, s, look, setPrefs]);

  const idx = Math.min(active, Math.max(0, results.length - 1));
  useEffect(() => {
    listRef.current?.children[idx]?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const run = (i: number) => {
    const c = results[i];
    if (!c) return;
    close();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(idx + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(idx - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(idx);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="cmdk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cmdk-panel" role="dialog" aria-label="Command palette" onKeyDown={onKeyDown}>
        <input
          className="cmdk-input"
          autoFocus
          placeholder="Search rooms and commands"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
        {results.length === 0 ? (
          <div className="cmdk-empty">No matching commands</div>
        ) : (
          <ul className="cmdk-list" ref={listRef} role="listbox">
            {results.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === idx} className={`cmdk-row${i === idx ? " active" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => run(i)}>
                <span className="cmdk-title">{c.title}</span>
                {c.hint && (
                  <span className="shortcuts-keys">
                    {hintKeys(c.hint).map((k, j) => (
                      <kbd className="keycap" key={j}>
                        {k}
                      </kbd>
                    ))}
                  </span>
                )}
                <span className="cmdk-group">{c.group}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
