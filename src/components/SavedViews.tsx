import { useState } from "react";
import { useStore } from "../store";
import { VARIANT_LABEL, type SavedView, type VariantKey } from "../types";
import { shotTargets, viewsCoverAll } from "../lib/savedViews";
import { captureIds, useCaptureIds } from "../three/captureRegistry";
import { frames } from "./savedViewActions";
import "./SavedViews.css";

// Loaded on demand, like the report's snapshots, so the 3D libraries stay out of the app shell.
const captureAt = async (...a: Parameters<typeof import("../three/capture").captureAt>) => (await import("../three/capture")).captureAt(...a);

const KEYS: VariantKey[] = ["current", "proposed"];

export interface ViewShot {
  label: string;
  src: string;
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/**
 * A picture of every saved view in each layout that has a 3D viewer on screen, keyed by view id.
 * Changes the floor cap per view while it works and puts it back afterwards.
 */
export async function renderSavedViews(views: SavedView[]): Promise<Record<string, ViewShot[]>> {
  const st = useStore.getState();
  const present = KEYS.filter((k) => st.variants[k]);
  const targets = shotTargets(captureIds(), present, st.activeVariant);
  const out: Record<string, ViewShot[]> = {};
  const original = st.maxLevel;
  let level = original;
  try {
    for (const v of views) {
      const want = v.maxLevel ?? null;
      if (want !== level) {
        useStore.getState().setUi({ maxLevel: want });
        level = want;
        await frames(2);
      }
      const shots: ViewShot[] = [];
      for (const t of targets) {
        const blob = await captureAt(t.id, v);
        shots.push({ label: VARIANT_LABEL[t.variant], src: await blobToDataUrl(blob) });
      }
      out[v.id] = shots;
    }
  } finally {
    if (level !== original) useStore.getState().setUi({ maxLevel: original });
  }
  return out;
}

/** Review section: every saved view, photographed in each layout. Pictures are made on request and not kept. */
export function SavedViewsSection({ views }: { views: SavedView[] }) {
  const variants = useStore((s) => s.variants);
  const active = useStore((s) => s.activeVariant);
  const setUi = useStore((s) => s.setUi);
  const ids = useCaptureIds();
  const [pictures, setPictures] = useState<Record<string, ViewShot[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const present = KEYS.filter((k) => variants[k]);
  const targets = shotTargets(ids, present, active);
  const covered = viewsCoverAll(targets, present);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      setPictures(await renderSavedViews(views));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sv-review">
      <div className="sv-review-bar">
        <button className="primary" onClick={() => void make()} disabled={busy || ids.length === 0}>
          {busy ? "Making pictures…" : "Make pictures"}
        </button>
        {ids.length === 0 ? (
          <span className="muted small">
            <button
              className="link"
              onClick={() => {
                useStore.getState().leaveReview();
                setUi({ tab: "3d" });
              }}
            >
              Open the 3D view
            </button>{" "}
            to make the pictures.
          </span>
        ) : !covered ? (
          <span className="muted small">
            Pictures come from the 3D views on screen.{" "}
            <button className="link" onClick={() => setUi({ tab: "3d", viewMode: "side-by-side" })}>
              Show both layouts side by side
            </button>
          </span>
        ) : null}
      </div>
      {error && <p className="sv-error">{error}</p>}
      <div className="sv-review-list">
        {views.map((v) => (
          <div key={v.id} className="sv-review-view">
            <h3>{v.name}</h3>
            <div className="sv-figures">
              {present.map((k) => {
                const shot = pictures[v.id]?.find((s) => s.label === VARIANT_LABEL[k]);
                return (
                  <figure key={k}>
                    {shot ? <img src={shot.src} alt={`${v.name}, ${VARIANT_LABEL[k]}`} /> : <div className="sv-blank" />}
                    <figcaption>{VARIANT_LABEL[k]}</figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
