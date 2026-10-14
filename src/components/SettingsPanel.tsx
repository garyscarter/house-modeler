import { useStore } from "../store";
import type { HouseModel, Photo, Site } from "../types";
import { MODELS } from "../ai/client";

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const variants = useStore((s) => s.variants);
  const photos = useStore((s) => s.photos);
  const site = useStore((s) => s.site);
  const costRates = useStore((s) => s.costRates);
  const reset = useStore((s) => s.reset);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ variants, photos, site, costRates }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "house-model.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    let data: { variants?: Record<string, HouseModel>; photos?: Photo[]; site?: Site; costRates?: Record<string, number> };
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
    useStore.getState().setVariant("current", looksLikeModel(current) ? current : undefined);
    useStore.getState().setVariant("proposed", looksLikeModel(proposed) ? proposed : undefined);
    useStore.setState({ photos: Array.isArray(data.photos) ? data.photos : [], site: data.site });
  };

  return (
    <div className="panel">
      <h3>Settings</h3>
      <label>
        Anthropic API key
        <input
          type="password"
          value={settings.apiKey}
          placeholder="sk-ant-…"
          onChange={(e) => setSettings({ apiKey: e.target.value })}
          autoComplete="off"
        />
      </label>
      <p className="muted small">
        Stored only in this browser. Calls go straight from the page to the Anthropic API. If a request is declined by the model's
        safety system, the API retries it on a fallback model automatically.
      </p>
      <label>
        Model
        <select value={settings.model} onChange={(e) => setSettings({ model: e.target.value })}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
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
          onClick={() => {
            if (window.confirm("Clear both models, the site and all photos? (Undo can bring them back.)")) reset();
          }}
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
