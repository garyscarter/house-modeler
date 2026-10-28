import { useState } from "react";
import { del, delMany, get, getMany, keys } from "idb-keyval";
import { BrandMark } from "./BrandMark";
import { Loader } from "./Loader";
import { imgKeyPrefix, refIds } from "../lib/persist";
import { activeHouseId, houseKey, storageSuffix } from "../lib/house";
import { downloadPrefix } from "../lib/brand";
import { fileDate } from "../lib/fileNames";
import "./Recovery.css";

// The active house's saved project (the default house keeps the old names).
const STATE_KEY = houseKey("house-modeler");
const IMG_KEY_PREFIX = imgKeyPrefix(storageSuffix(activeHouseId()));

/** A readable line for whatever was thrown. */
export const errorText = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : typeof e === "string" ? e : e ? String(e) : "Unknown error");

/** The raw saved blob and the images it refers to, straight from IndexedDB, as a JSON string. */
async function rawSavedData(): Promise<string> {
  const raw = await get(STATE_KEY);
  const ids = typeof raw === "string" ? refIds(raw) : [];
  const urls = ids.length ? await getMany<string | undefined>(ids.map((id) => IMG_KEY_PREFIX + id)) : [];
  const images: Record<string, string> = {};
  ids.forEach((id, i) => {
    if (urls[i]) images[id] = urls[i]!;
  });
  return JSON.stringify({ format: "storey-raw-save", savedAt: new Date().toISOString(), raw: raw ?? null, images }, null, 2);
}

/**
 * Full-page screen for when the saved project can't be opened or the app itself hit a problem. It never relies
 * on the project store, so it works even when the saved data is what broke.
 */
export function Recovery({ error, kind = "render", onRetry }: { error: unknown; kind?: "open" | "render"; onRetry?: () => void }) {
  const [busy, setBusy] = useState<"download" | "clear" | null>(null);
  const [note, setNote] = useState("");

  const download = async () => {
    setBusy("download");
    setNote("");
    try {
      const json = await rawSavedData();
      const { downloadBlob } = await import("../lib/export");
      downloadBlob(new Blob([json], { type: "application/json" }), `${downloadPrefix("")}-saved-data-${fileDate()}.json`);
    } catch (e) {
      setNote(`Couldn't read the saved data: ${errorText(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const startEmpty = async () => {
    if (!window.confirm("Start with an empty project? Your saved project on this device will be deleted. Download the saved data first if you want to keep it.")) return;
    setBusy("clear");
    try {
      await del(STATE_KEY);
      const imgs = (await keys()).filter((k): k is string => typeof k === "string" && k.startsWith(IMG_KEY_PREFIX));
      if (imgs.length) await delMany(imgs);
      try {
        localStorage.removeItem(houseKey("house-modeler/sync"));
      } catch {
        // blocked storage: nothing to forget
      }
      location.reload();
    } catch (e) {
      setBusy(null);
      setNote(`Couldn't clear the saved data: ${errorText(e)}`);
    }
  };

  return (
    <div className="recovery" role="alert">
      <div className="empty">
        <BrandMark outline size={72} />
        <h2>{kind === "open" ? "Storey couldn't open your project" : "Storey hit a problem"}</h2>
        <p>
          {kind === "open"
            ? "The saved copy on this device couldn't be read. Nothing has been changed. Download it first, in case it can be repaired."
            : "Your saved project is untouched. Try again, or download a copy of it before doing anything else."}
        </p>
        <p className="muted small recovery-error">{errorText(error)}</p>
        <div className="recovery-actions">
          <button className="primary" onClick={download} disabled={busy !== null}>
            {busy === "download" && <Loader kind="lift" size={14} />}
            Download saved data
          </button>
          <button onClick={onRetry ?? (() => location.reload())} disabled={busy !== null}>
            Try again
          </button>
          <button className="danger" onClick={startEmpty} disabled={busy !== null}>
            {busy === "clear" && <Loader kind="lift" size={14} />}
            Start with an empty project
          </button>
        </div>
        {note && <p className="muted small">{note}</p>}
      </div>
    </div>
  );
}
