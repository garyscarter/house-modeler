import { useStore } from "../store";
import { MODELS } from "../ai/client";

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const variants = useStore((s) => s.variants);
  const photos = useStore((s) => s.photos);
  const setVariant = useStore((s) => s.setVariant);
  const addPhotos = useStore((s) => s.addPhotos);
  const reset = useStore((s) => s.reset);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ variants, photos }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "house-model.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    const data = JSON.parse(await file.text());
    reset();
    if (data.variants?.current) setVariant("current", data.variants.current);
    if (data.variants?.proposed) setVariant("proposed", data.variants.proposed);
    if (Array.isArray(data.photos)) addPhotos(data.photos);
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
        safety system it is automatically retried on Claude Opus 4.8.
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
            if (window.confirm("Clear both models and all photos?")) reset();
          }}
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
