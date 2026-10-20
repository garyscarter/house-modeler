import { useStore } from "../store";
import { ask } from "./Dialogs";
import type { HouseModel, Photo } from "../types";
import { sitesFromImport } from "../lib/sites";

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const variants = useStore((s) => s.variants);
  const photos = useStore((s) => s.photos);
  const sites = useStore((s) => s.sites);
  const costRates = useStore((s) => s.costRates);
  const reset = useStore((s) => s.reset);

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
    let data: { variants?: Record<string, HouseModel>; photos?: Photo[]; sites?: unknown; site?: unknown; costRates?: Record<string, number> };
    try {
      data = JSON.parse(await file.text());
    } catch {
      window.alert("That file is not valid JSON.");
      return;
    }
    const looksLikeModel = (m: unknown) => !!m && Array.isArray((m as HouseModel).floors);
    const current = data.variants?.current;
    const proposed = data.variants?.proposed;
    if (!looksLikeModel(current) && !looksLikeModel(proposed)) {
      window.alert("That file does not contain a House Modeler project.");
      return;
    }
    // One undoable step: replace everything at once.
    useStore.setState({ costRates: data.costRates ?? costRates });
    const models = { current: looksLikeModel(current) ? current : undefined, proposed: looksLikeModel(proposed) ? proposed : undefined };
    useStore.getState().setVariant("current", models.current);
    useStore.getState().setVariant("proposed", models.proposed);
    useStore.setState({ photos: Array.isArray(data.photos) ? data.photos : [], sites: sitesFromImport({ sites: data.sites, site: data.site, variants: models }) });
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
    </div>
  );
}
