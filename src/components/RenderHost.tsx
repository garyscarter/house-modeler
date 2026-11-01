import { lazy, Suspense, useEffect } from "react";
import { captureIds } from "../three/captureRegistry";
import { closeRender, openRender, useRenderRequest } from "./renderRequest";
import { Loader } from "./Loader";
import { Modal } from "./Modal";

// The dialog (and what it imports) loads the first time a still is asked for, not with the app shell.
const RenderDialog = lazy(() => import("./RenderDialog").then((m) => ({ default: m.RenderDialog })));

/** Mounted once in the app: opens the Render dialog for a request, and answers the palette's "house:render" event. */
export function RenderHost() {
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
  if (!request) return null;
  return (
    <Suspense
      fallback={
        <Modal title={`Render: ${request.label}`} onClose={closeRender} width={380}>
          <p className="render-progress" role="status">
            <Loader kind="lift" size={18} /> Opening the renderer
          </p>
        </Modal>
      }
    >
      {/* A fresh key per request, so a second render starts clean. */}
      <RenderDialog key={seq} request={request} />
    </Suspense>
  );
}
