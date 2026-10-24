import { useStore } from "../store";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { OPEN_PALETTE, OPEN_SHORTCUTS, houseName } from "../lib/studio";
import { isMacPlatform } from "../lib/commands";
import { HouseMenu } from "./HouseMenu";
import { ModeBar } from "./ModeBar";
import { Icon } from "./icons";
import { BrandMark } from "./BrandMark";
import { Wordmark } from "./Wordmark";

/** The top bar: the Storey wordmark, the house menu, the five modes, the layout switch, undo and redo, and the palette and shortcut buttons. */
export function TopBar() {
  const variants = useStore((s) => s.variants);
  const activeVariant = useStore((s) => s.activeVariant);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const setUi = useStore((s) => s.setUi);
  const mac = isMacPlatform();
  const cmd = mac ? "⌘" : "Ctrl+";
  const hasLayout = !!(variants.current || variants.proposed);
  const open = (name: string) => window.dispatchEvent(new CustomEvent(name));

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="brand" title="Storey">
          <BrandMark />
          <Wordmark height={16} className="brand-name" />
        </span>
        <HouseMenu
          name={houseName(
            variants[activeVariant] ?? variants.current ?? variants.proposed,
          )}
        />
      </div>
      <ModeBar />
      <div className="topbar-right">
        {hasLayout && (
          <>
            <div className="seg" role="group" aria-label="Layout">
              {(["current", "proposed"] as VariantKey[]).map((k) => (
                <button
                  key={k}
                  className={activeVariant === k ? "active" : ""}
                  aria-pressed={activeVariant === k}
                  disabled={!variants[k]}
                  onClick={() =>
                    setUi({
                      activeVariant: k,
                      selectedRoomId: null,
                      selectedEdge: null,
                    })
                  }
                >
                  <span className="lay-full">{VARIANT_LABEL[k]}</span>
                  <span className="lay-short" aria-hidden="true">
                    {k === "current" ? "Listed" : VARIANT_LABEL[k]}
                  </span>
                </button>
              ))}
            </div>
            <span className="topbar-sep" aria-hidden="true" />
            <button
              className="icon-btn"
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo"
              title={`Undo (${cmd}Z)`}
            >
              <Icon name="undo" />
            </button>
            <button
              className="icon-btn"
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo"
              title={mac ? "Redo (⌘⇧Z)" : "Redo (Ctrl+Shift+Z)"}
            >
              <Icon name="redo" />
            </button>
            <button
              className="icon-btn palette-btn"
              onClick={() => open(OPEN_PALETTE)}
              aria-label="Command palette"
              title="Command palette"
            >
              <Icon name="search" />
              <kbd className="keycap">{mac ? "⌘K" : "Ctrl K"}</kbd>
            </button>
            <button
              className="icon-btn"
              onClick={() => open(OPEN_SHORTCUTS)}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              ?
            </button>
          </>
        )}
      </div>
    </header>
  );
}
