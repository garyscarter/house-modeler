import { useStore } from "../store";
import { ask } from "./Dialogs";
import { applyProject, syncNow, useSyncStatus } from "../lib/sync";
import { statusText } from "../lib/syncLogic";
import { useStorageStatus } from "../lib/persist";
import { Loader } from "./Loader";
import { BrandMark } from "./BrandMark";
import { BRAND_NAME, downloadPrefix } from "../lib/brand";
import { fileDate, slug } from "../lib/fileNames";
import { houseName } from "../lib/studio";
import "./SettingsPanel.css";

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

/**
 * The experimental passes, under the Render quality switch: screen-space
 * reflections and bounce light, off by default and on the high setting only.
 * Bounce light needs SSGI, which no library provides for this version of
 * three, so its box stays disabled and says so.
 */
export function ExperimentalEffectsToggles() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const high = settings.quality === "high";
  const effects = settings.effects ?? {};
  const set = (patch: { reflections?: boolean; gi?: boolean }) => setSettings({ effects: { ...effects, ...patch } });
  const needHigh = "Needs the High render quality";
  return (
    <div className="experimental-effects" role="group" aria-label="Experimental, high quality only">
      <span className="experimental-head">
        Experimental, high quality only <span className="beta-pill">beta</span>
      </span>
      <label className={high ? "" : "is-disabled"} title={high ? "Screen-space reflections in the glass and gloss surfaces" : needHigh}>
        <input type="checkbox" checked={!!effects.reflections} disabled={!high} onChange={(e) => set({ reflections: e.target.checked })} />
        Reflections
      </label>
      <label className="is-disabled" title="Bounce light: not available on this renderer">
        <input type="checkbox" checked={false} disabled onChange={() => {}} />
        Bounce light
      </label>
    </div>
  );
}

/** Export JSON, Import JSON and Clear all (House menu, Project). */
export function ProjectActions({ onDone }: { onDone?: () => void }) {
  const variants = useStore((s) => s.variants);
  const photos = useStore((s) => s.photos);
  const sites = useStore((s) => s.sites);
  const costRates = useStore((s) => s.costRates);
  const pieces = useStore((s) => s.pieces);
  const savedViews = useStore((s) => s.savedViews);
  const reset = useStore((s) => s.reset);

  const exportJson = () => {
    // `sites` holds each layout's own plot; older exports had one shared `site`, which import still reads.
    const blob = new Blob([JSON.stringify({ variants, photos, sites, costRates, pieces, savedViews }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const model = variants[useStore.getState().activeVariant] ?? variants.current ?? variants.proposed;
    a.download = `${downloadPrefix(model ? slug(houseName(model)) : "")}-project-${fileDate()}.json`;
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
          if (await ask("Clear both models, the site and all photos? Undo brings back the layouts, plot and photos, but not saved views.", { ok: "Clear", danger: true })) reset();
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

/** Says so when changes aren't being saved on this device; nothing when all is well. */
export function StorageStatus() {
  const s = useStorageStatus();
  if (s.kind === "ok" || s.kind === "idle") return null;
  const readonly = s.kind === "readonly";
  return (
    <p className="small muted sync-status" role="status">
      <span>
        {!readonly && <Loader kind="lift" size={14} />}
        {readonly ? s.message ?? "Another tab is saving this project; your next change here takes over" : `${s.message ?? "Couldn't save on this device"}. Trying again with your next change`}
      </span>
    </p>
  );
}

const BUILD_DATE = new Date(__BUILD_DATE__).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** A small muted "Storey · built date · commit" line for the bottom of Settings. */
export function AboutLine() {
  return (
    <p className="about-line">
      <BrandMark size={14} />
      <span>
        {BRAND_NAME} · built {BUILD_DATE} · {__BUILD_COMMIT__}
      </span>
    </p>
  );
}
