import { useStore } from "../store";
import { ask } from "./Dialogs";
import { applyProject, syncNow, useSyncStatus } from "../lib/sync";
import { statusText } from "../lib/syncLogic";
import { Loader } from "./Loader";

const QUALITY: [string, string, string][] = [
  ["high", "High", "Ambient occlusion and soft shadows"],
  ["balanced", "Balanced", "Soft shadows"],
  ["low", "Low", "Fastest"],
];

/** Render quality as a three-way switch (House menu, Settings). */
export function RenderQuality() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  return (
    <div className="seg" role="group" aria-label="Render quality">
      {QUALITY.map(([k, label, hint]) => (
        <button key={k} className={settings.quality === k ? "active" : ""} title={hint} onClick={() => setSettings({ quality: k as typeof settings.quality })}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Export JSON, Import JSON and Clear all (House menu, Project). */
export function ProjectActions({ onDone }: { onDone?: () => void }) {
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
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      window.alert("That file is not valid JSON.");
      return;
    }
    if (!applyProject(data)) window.alert("That file does not contain a Storey project.");
  };

  return (
    <div className="row project-actions">
      <button
        onClick={() => {
          exportJson();
          onDone?.();
        }}
      >
        Export JSON
      </button>
      <label className="file">
        Import JSON…
        <input
          type="file"
          accept="application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = "";
            onDone?.();
          }}
        />
      </label>
      <button
        className="danger"
        onClick={async () => {
          onDone?.();
          if (await ask("Clear both models, the site and all photos? Undo can bring them back.", { ok: "Clear", danger: true })) reset();
        }}
      >
        Clear all…
      </button>
    </div>
  );
}

/** The sync status line with a Sync now button; nothing when sync is off. */
export function SyncStatus() {
  const sync = useSyncStatus((s) => s.status);
  if (sync.kind === "off") return null;
  return (
    <p className="small muted sync-status" role="status">
      <span>
        {sync.kind === "saving" && <Loader kind="lift" size={14} />}
        {statusText(sync)}
      </span>
      <button onClick={syncNow} disabled={sync.kind === "saving"}>
        Sync now
      </button>
    </p>
  );
}
