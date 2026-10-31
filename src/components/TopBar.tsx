import { useEffect } from "react";
import { useStore, type ViewMode } from "../store";
import { usePanelPrefs } from "./panelPrefs";
import { FEATURES, effectiveCompare } from "../lib/chassis";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { OPEN_PALETTE, houseName } from "../lib/studio";
import { isMacPlatform } from "../lib/commands";
import { HouseMenu } from "./HouseMenu";
import { ModeBar } from "./ModeBar";
import { Icon } from "./icons";
import { BrandMark } from "./BrandMark";
import { Wordmark } from "./Wordmark";
import { useChassis } from "./useChassis";

/**
 * The layout switch: As listed | Proposed | Compare. One control on every chassis. Compare is available when both layouts exist;
 * it opens the last compare style used (kept in panelPrefs) in 3D, and is active only while comparing.
 */
export function LayoutSwitch({ className = "" }: { className?: string }) {
  const variants = useStore((s) => s.variants);
  const activeVariant = useStore((s) => s.activeVariant);
  const viewMode = useStore((s) => s.viewMode);
  const tab = useStore((s) => s.tab);
  const setUi = useStore((s) => s.setUi);
  const both = !!variants.current && !!variants.proposed;
  const comparing = both && viewMode !== "single" && tab === "3d";
  return (
    <div className={`seg layout-switch ${className}`.trim()} role="group" aria-label="Layout">
      {(["current", "proposed"] as VariantKey[]).map((k) => (
        <button
          key={k}
          className={activeVariant === k && !comparing ? "active" : ""}
          aria-pressed={activeVariant === k && !comparing}
          disabled={!variants[k]}
          onClick={() => setUi({ activeVariant: k, viewMode: "single", selectedRoomId: null, selectedEdge: null })}
        >
          <span className="lay-full">{VARIANT_LABEL[k]}</span>
          <span className="lay-short" aria-hidden="true">
            {k === "current" ? "Listed" : VARIANT_LABEL[k]}
          </span>
        </button>
      ))}
      <button
        className={comparing ? "cmp active" : "cmp"}
        aria-pressed={comparing}
        aria-label="Compare"
        disabled={!both}
        title={both ? "Compare As listed and Proposed" : "Load both layouts to compare them"}
        onClick={() => setUi({ viewMode: usePanelPrefs.getState().compareMode, tab: "3d" })}
      >
        <span className="cmp-full">Compare</span>
        <span className="cmp-icon" aria-hidden="true">
          <Icon name="compare" />
        </span>
      </button>
    </div>
  );
}

const COMPARE_STYLES: [Exclude<ViewMode, "single">, string][] = [
  ["wipe", "Wipe"],
  ["side-by-side", "Side by side"],
  ["overlay", "Overlay"],
];

/** While comparing: Wipe | Side by side | Overlay, a small segment centred under the islands. */
function CompareStyle() {
  const viewMode = useStore((s) => s.viewMode);
  const tab = useStore((s) => s.tab);
  const both = useStore((s) => !!s.variants.current && !!s.variants.proposed);
  const setUi = useStore((s) => s.setUi);
  const chassis = useChassis((s) => s.chassis);
  if (!both || viewMode === "single" || tab !== "3d") return null;
  const shown = effectiveCompare<ViewMode>(viewMode, chassis, both, "single", "wipe", "side-by-side");
  return (
    <div className="seg compare-style float-card" role="group" aria-label="Compare style">
      {COMPARE_STYLES.filter(([k]) => FEATURES[chassis].sideBySide || k !== "side-by-side").map(([k, label]) => (
        <button key={k} className={shown === k ? "active" : ""} aria-pressed={shown === k} onClick={() => setUi({ viewMode: k })}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** The top bar: floating islands. Left: the mark and house menu. Centre: the modes. Right: the layout switch, undo, redo and the palette. */
export function TopBar() {
  const variants = useStore((s) => s.variants);
  const activeVariant = useStore((s) => s.activeVariant);
  const viewMode = useStore((s) => s.viewMode);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  const phone = useChassis((s) => s.chassis) === "phone";
  const mac = isMacPlatform();
  const cmd = mac ? "⌘" : "Ctrl+";
  const hasLayout = !!(variants.current || variants.proposed);
  const both = !!variants.current && !!variants.proposed;
  const open = (name: string) => window.dispatchEvent(new CustomEvent(name));

  // Remember the last compare style, so the Compare segment returns to it.
  useEffect(() => {
    if (viewMode !== "single") setPrefs({ compareMode: viewMode });
  }, [viewMode, setPrefs]);

  return (
    <header className="topbar">
      <div className="topbar-left island">
        {!phone && (
          <span className="brand" title="Storey">
            <BrandMark />
            <Wordmark height={16} className="brand-name" />
          </span>
        )}
        <HouseMenu name={houseName(variants[activeVariant] ?? variants.current ?? variants.proposed)} />
      </div>
      {hasLayout && !phone && (
        <div className="topbar-mid island">
          <ModeBar />
        </div>
      )}
      {hasLayout && phone && both && (
        <div className="topbar-mid island">
          <LayoutSwitch />
        </div>
      )}
      {hasLayout && (
        <div className="topbar-right island">
          {!phone && <LayoutSwitch />}
          {!phone && <span className="topbar-sep" aria-hidden="true" />}
          <button className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="Undo" title={`Undo (${cmd}Z)`}>
            <Icon name="undo" />
          </button>
          <button className="icon-btn" onClick={redo} disabled={!canRedo} aria-label="Redo" title={mac ? "Redo (⌘⇧Z)" : "Redo (Ctrl+Shift+Z)"}>
            <Icon name="redo" />
          </button>
          {!phone && (
            <button className="icon-btn palette-btn" onClick={() => open(OPEN_PALETTE)} aria-label="Command palette" title="Command palette">
              <Icon name="search" />
              <kbd className="keycap">{mac ? "⌘K" : "Ctrl K"}</kbd>
            </button>
          )}
        </div>
      )}
      {hasLayout && <CompareStyle />}
    </header>
  );
}
