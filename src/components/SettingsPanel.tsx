import { useStore } from "../store";
import { ask } from "./Dialogs";
import { applyProject, syncNow, useSyncStatus } from "../lib/sync";
import { statusText } from "../lib/syncLogic";

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const variants = useStore((s) => s.variants);
  const photos = useStore((s) => s.photos);
  const sites = useStore((s) => s.sites);
  const costRates = useStore((s) => s.costRates);
  const reset = useStore((s) => s.reset);
  const sync = useSyncStatus((s) => s.status);

  const exportJson = () => {
    // `sites` holds each layout's own plot; older exports had one shared `site`, which import still reads.
    const blob = new Blob([JSON.stringify({ variants, photos, sites, costRates }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "house-model.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      window.alert("That file is not valid JSON.");
      return;
    }
    if (!applyProject(data)) window.alert("That file does not contain a House Modeler project.");
  };

  return (
    <div className="panel">
      <h3>Settings</h3>
      <label>
        Render quality
        <select value={settings.quality} onChange={(e) => setSettings({ quality: e.target.value as typeof settings.quality })}>
          <option value="high">High (ambient occlusion, soft shadows)</option>
          <option value="balanced">Balanced</option>
          <option value="low">Low (fastest, for phones)</option>
        </select>
      </label>
      <hr />
      <h4>Project</h4>
      <div className="row">
        <button onClick={exportJson}>Export JSON</button>
        <label className="file">
          Import JSON
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="danger"
          onClick={async () => {
            if (await ask("Clear both models, the site and all photos? Undo can bring them back.", { ok: "Clear", danger: true })) reset();
          }}
        >
          Clear all
        </button>
      </div>
      {sync.kind !== "off" && (
        <p className="small muted sync-status" role="status">
          {statusText(sync)}{" "}
          <button onClick={syncNow} disabled={sync.kind === "saving"}>
            Sync now
          </button>
        </p>
      )}
    </div>
  );
}
