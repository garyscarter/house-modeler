import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { isListingDesign } from "../lib/presetActions";
import { useSyncStatus } from "../lib/sync";
import { Icon } from "./icons";
import { usePanelPrefs } from "./panelPrefs";
import { useListingUpdateCount } from "./ImportPanel";
import { openListingReview } from "./ListingUpdatesDialog";
import { openLayouts } from "./LayoutsDialog";
import { openPhotos } from "./PhotosDialog";
import { ProjectActions, RenderQuality, SyncStatus } from "./SettingsPanel";
import "./HouseMenu.css";

/** The house name in the top bar; opens everything that is about the project rather than the view. */
export function HouseMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const photos = useStore((s) => s.photos.length);
  const proposed = useStore((s) => s.variants.proposed);
  const updates = useListingUpdateCount("proposed");
  const look = usePanelPrefs((s) => s.look);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  const syncOff = useSyncStatus((s) => s.status.kind === "off");

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="house-menu" ref={root}>
      <button className={open ? "house-menu-btn active" : "house-menu-btn"} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <span>{name}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="popover house-pop" role="menu" aria-label="House menu">
          <button className="hm-item" role="menuitem" onClick={run(openLayouts)}>
            <Icon name="layers" />
            <span>Layouts…</span>
          </button>
          {proposed && isListingDesign(proposed) && (
            <button className="hm-item" role="menuitem" onClick={run(() => void openListingReview("proposed"))}>
              <Icon name="plus" />
              <span>Bring in updates…</span>
              <span className="hm-hint">{updates.all ? `${updates.all} available` : "up to date"}</span>
            </button>
          )}
          <button className="hm-item" role="menuitem" onClick={run(openPhotos)}>
            <Icon name="image" />
            <span>Photos ({photos})…</span>
          </button>

          <div className="hm-group">
            <h3>Settings</h3>
            <div className="hm-row">
              <span>Render quality</span>
              <RenderQuality />
            </div>
            <div className="hm-row">
              <span>Look</span>
              <div className="seg" role="group" aria-label="Look">
                <button className={look === "studio" ? "active" : ""} onClick={() => setPrefs({ look: "studio" })}>
                  Studio
                </button>
                <button className={look === "glass" ? "active" : ""} onClick={() => setPrefs({ look: "glass" })}>
                  Glass
                </button>
              </div>
            </div>
          </div>

          <div className="hm-group">
            <h3>Project</h3>
            <ProjectActions onDone={() => setOpen(false)} />
          </div>

          {!syncOff && (
            <div className="hm-foot">
              <SyncStatus />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
