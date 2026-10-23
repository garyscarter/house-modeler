import { useState } from "react";
import { useStore } from "../store";
import { cleanViewName, nextViewName } from "../lib/savedViews";
import { Popover } from "./ViewMenu";
import { Icon } from "./icons";
import { goToSavedView, saveCurrentView, updateViewToCurrent } from "./savedViewActions";
import "./SavedViewsMenu.css";

/** Dock popover: save the camera under a name, jump back to it later, rename, replace or delete. */
export function SavedViewsMenu() {
  const views = useStore((s) => s.savedViews);
  const updateSavedView = useStore((s) => s.updateSavedView);
  const removeSavedView = useStore((s) => s.removeSavedView);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const save = () => {
    if (saveCurrentView(name)) setName("");
  };
  const commit = (id: string, raw: string, old: string) => {
    updateSavedView(id, { name: cleanViewName(raw, old) });
    setEditing(null);
  };

  return (
    <Popover className="dock-views" label="Views" title="Saved camera views">
      <div className="saved-views">
        <div className="sv-save">
          <input
            aria-label="Name for this view"
            placeholder={nextViewName(views)}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          <button className="primary" onClick={save}>
            Save this view
          </button>
        </div>
        {views.length === 0 ? (
          <p className="muted small sv-empty">No saved views yet. Frame the camera, name it and save it. Saved views show both layouts in Review.</p>
        ) : (
          <div className="compare-rows sv-list">
            {views.map((v) => (
              <div key={v.id} className="sv-row">
                {editing === v.id ? (
                  <input
                    className="sv-rename"
                    aria-label="Rename view"
                    autoFocus
                    defaultValue={v.name}
                    maxLength={60}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => editing === v.id && commit(v.id, e.target.value, v.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit(v.id, e.currentTarget.value, v.name);
                      else if (e.key === "Escape") {
                        // Cancel the rename only; the popover's own Esc handler skips events that are already handled.
                        e.preventDefault();
                        setEditing(null);
                      }
                    }}
                  />
                ) : (
                  <button data-pick className="compare-row sv-name" title={`Go to ${v.name}`} onClick={() => void goToSavedView(v)}>
                    {v.name}
                  </button>
                )}
                <button className="icon-btn" aria-label={`Rename ${v.name}`} title="Rename" onClick={() => setEditing(v.id)}>
                  <Icon name="pencil" size={14} />
                </button>
                <button className="sv-update" title="Replace with the current camera" onClick={() => updateViewToCurrent(v.id)}>
                  Update
                </button>
                <button className="icon-btn" aria-label={`Delete ${v.name}`} title="Delete view" onClick={() => removeSavedView(v.id)}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Popover>
  );
}
