import { useEffect, useState } from "react";
import { useStore } from "../store";
import { progressLabel, samplesFor, stillSize } from "../lib/stills";
import { downloadBlob, fileDate, slug } from "../lib/export";
import { downloadPrefix } from "../lib/brand";
import { houseName } from "../lib/studio";
import { captureIds, getCapture } from "../three/captureRegistry";
import { frames } from "./savedViewActions";
import { Loader } from "./Loader";
import { Modal } from "./Modal";
import { stampMark } from "./stampMark";
import { closeRender, openRender, useRenderRequest, type RenderRequest } from "./renderRequest";
import "./RenderDialog.css";

// The tracer is its own lazy chunk: nothing loads until a still is asked for.
const loadTracer = () => import("../three/pathtrace");

type Phase = { kind: "running"; done: number; total: number; label: string } | { kind: "done"; blob: Blob; url: string } | { kind: "error"; text: string };

/** Mounted once in the app: the Render dialog, and the palette's "house:render" event. */
export function RenderDialogHost() {
  const request = useRenderRequest((s) => s.request);
  const seq = useRenderRequest((s) => s.seq);
  useEffect(() => {
    const onEvent = () => {
      const id = captureIds()[0];
      if (id) openRender({ id, pose: null, label: "3D view", stamp: false });
    };
    window.addEventListener("house:render", onEvent);
    return () => window.removeEventListener("house:render", onEvent);
  }, []);
  // A fresh key per request, so a second render starts clean.
  return request ? <RenderDialog key={seq} request={request} /> : null;
}

function RenderDialog({ request }: { request: RenderRequest }) {
  const [phase, setPhase] = useState<Phase>({ kind: "running", done: 0, total: 0, label: "Building the scene…" });

  useEffect(() => {
    const ctrl = new AbortController();
    const st = useStore.getState();
    const t = getCapture(request.id);
    const canvas = t?.gl.domElement;
    const { width, height } = stillSize(canvas?.clientWidth || 1200, canvas?.clientHeight || 800);
    const total = samplesFor(st.settings.quality);
    const level = st.maxLevel;
    const changeLevel = request.maxLevel !== undefined && request.maxLevel !== level;
    let started = 0;
    let url = "";
    let owned = false;
    void (async () => {
      try {
        // A remount straight after mounting (React's strict mode) aborts this run before it touches anything.
        await Promise.resolve();
        if (ctrl.signal.aborted) return;
        owned = true;
        if (changeLevel) {
          st.setUi({ maxLevel: request.maxLevel ?? null });
          await frames(2);
        }
        const { renderStill } = await loadTracer();
        if (ctrl.signal.aborted) return;
        // The viewer stops drawing on demand while the tracer owns its canvas.
        useStore.getState().setUi({ rendering: { id: request.id, done: 0, total } });
        await frames(1);
        const blob = await renderStill(
          request.id,
          request.pose,
          { width, height, samples: total },
          (done, all) => {
            if (done > 0 && !started) started = performance.now();
            const n = Math.floor(done);
            const cur = useStore.getState().rendering;
            if (cur && cur.done !== n) useStore.getState().setUi({ rendering: { id: request.id, done: n, total: all } });
            setPhase({ kind: "running", done, total: all, label: progressLabel(done, all, started ? performance.now() - started : 0) });
          },
          ctrl.signal,
        );
        url = URL.createObjectURL(blob);
        if (!ctrl.signal.aborted) setPhase({ kind: "done", blob, url });
      } catch (e) {
        if (!ctrl.signal.aborted) setPhase({ kind: "error", text: e instanceof Error ? e.message : String(e) });
      } finally {
        if (owned) finish();
      }
    })();
    function finish() {
      useStore.getState().setUi({ rendering: null, ...(changeLevel ? { maxLevel: level } : {}) });
      // The live view draws again once its loop is back on demand.
      void frames(1).then(() => getCapture(request.id)?.invalidate?.());
    }
    return () => {
      ctrl.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [request]);

  const save = async () => {
    if (phase.kind !== "done") return;
    const st = useStore.getState();
    const model = st.variants[st.activeVariant] ?? st.variants.current ?? st.variants.proposed;
    const blob = request.stamp ? await stampMark(phase.blob) : phase.blob;
    downloadBlob(blob, `${downloadPrefix(slug(houseName(model)))}-render-${slug(request.label)}-${fileDate()}.png`);
  };

  return (
    <Modal title={`Render: ${request.label}`} onClose={closeRender} width={phase.kind === "done" ? 640 : 380} className="render-dialog">
      {phase.kind === "running" && (
        <>
          <p className="render-progress">
            <Loader kind="fill" size={20} progress={phase.total ? phase.done / phase.total : undefined} />
            <span>{phase.label}</span>
          </p>
          <div className="row">
            <button onClick={closeRender}>Cancel</button>
          </div>
        </>
      )}
      {phase.kind === "done" && (
        <>
          <img className="render-preview" src={phase.url} alt={`Rendered still: ${request.label}`} />
          <div className="row">
            <button className="primary" onClick={() => void save()}>
              Save PNG
            </button>
            <button onClick={closeRender}>Close</button>
          </div>
        </>
      )}
      {phase.kind === "error" && (
        <>
          <p className="error small">{phase.text}</p>
          <div className="row">
            <button onClick={closeRender}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}
