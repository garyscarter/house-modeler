import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useStore } from "../store";
import { BRAND_TEAL } from "../lib/brand";
import { CLICK_SLOP_PX, isClick, isSloped, legCorner, measure, measureLabel, snapToVertex, type P3 } from "../lib/measure3d";
import { Icon } from "../components/icons";
import "./Measure.css";

const shown = (o: THREE.Object3D | null) => {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
};

/** Glass, ghosts, halos and pools: see-through surfaces a click should pass through. */
const seeThrough = (m: THREE.Material | THREE.Material[]) => {
  const mats = Array.isArray(m) ? m : [m];
  return mats.every((x) => !x.visible || (x.transparent && x.opacity < 0.6) || x.blending === THREE.AdditiveBlending);
};

const noRaycast = () => {};

/**
 * The 3D view's tape measure. While the store's `measureTool` is on, a click (not a camera drag) on the model places a
 * point; the second draws a line with its length, and for a sloped line its level and plumb legs. A third click starts
 * a new one; Esc clears it (and, with nothing drawn, puts the tape away). Lives inside the Canvas.
 */
export function Measure() {
  const armed = useStore((s) => s.measureTool);
  const { gl, camera, scene, size, invalidate } = useThree();
  const [points, setPoints] = useState<P3[]>([]);
  const [hover, setHover] = useState<P3 | null>(null);
  const live = useRef({ points });
  live.current = { points };

  // Put the tape away: drop the points.
  useEffect(() => {
    if (!armed) {
      setPoints([]);
      setHover(null);
    }
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    const el = gl.domElement;
    const host = el.parentElement;
    if (!host) return;
    el.classList.add("measuring");
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const m4 = new THREE.Matrix4();
    const inst = new THREE.Matrix4();

    /** The model point under a client position, snapped to a nearby corner of the hit triangle. */
    const pick = (cx: number, cy: number): P3 | null => {
      const rect = el.getBoundingClientRect();
      ndc.set(((cx - rect.left) / (rect.width || 1)) * 2 - 1, -((cy - rect.top) / (rect.height || 1)) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      for (const h of ray.intersectObjects(scene.children, true)) {
        const o = h.object as THREE.Mesh;
        if (h.distance <= camera.near || !o.isMesh || o.userData.noMeasure || !shown(o) || seeThrough(o.material)) continue;
        const pos = o.geometry?.getAttribute("position");
        if (!h.face || !pos || (pos as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return { x: h.point.x, y: h.point.y, z: h.point.z };
        m4.copy(o.matrixWorld);
        if ((o as THREE.InstancedMesh).isInstancedMesh && h.instanceId !== undefined) {
          (o as THREE.InstancedMesh).getMatrixAt(h.instanceId, inst);
          m4.multiply(inst);
        }
        return snapToVertex(h.point, (pos as THREE.BufferAttribute).array, { matrix: m4.elements, indices: [h.face.a, h.face.b, h.face.c] }).point;
      }
      return null;
    };

    let down: { x: number; y: number; id: number } | null = null;
    let pointers = 0;
    let multi = false;
    let swallow = false;
    let frame = 0;
    const onDown = (e: PointerEvent) => {
      if (e.target !== el) return;
      pointers++;
      if (pointers > 1) multi = true;
      down = e.button === 0 && !multi ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    };
    const onUp = (e: PointerEvent) => {
      pointers = Math.max(0, pointers - 1);
      const d = down;
      down = null;
      if (pointers === 0) {
        const wasMulti = multi;
        multi = false;
        if (wasMulti) return;
      }
      if (!d || d.id !== e.pointerId || e.target !== el || !isClick(d, { x: e.clientX, y: e.clientY }, e.pointerType === "touch" ? CLICK_SLOP_PX * 2 : CLICK_SLOP_PX)) return;
      // This click measures: it must not also select the room under it.
      swallow = true;
      const p = pick(e.clientX, e.clientY);
      if (!p) return;
      const prev = live.current.points;
      setPoints(prev.length === 1 ? [prev[0], p] : [p]);
      setHover(null);
    };
    const onCancel = () => {
      pointers = Math.max(0, pointers - 1);
      down = null;
    };
    const onClick = (e: MouseEvent) => {
      if (!swallow || e.target !== el) return;
      swallow = false;
      e.stopPropagation();
    };
    // With one point down, a rubber line follows the pointer (a mouse; a touch has no hover).
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.target !== el || live.current.points.length !== 1 || e.buttons) return;
      const { clientX, clientY } = e;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setHover(pick(clientX, clientY)));
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      setHover(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || document.querySelector(".dialog-backdrop, .modal-backdrop")) return;
      if (live.current.points.length) setPoints([]);
      else useStore.getState().setUi({ measureTool: false });
      setHover(null);
    };
    host.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    host.addEventListener("click", onClick, true);
    host.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      el.classList.remove("measuring");
      host.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      host.removeEventListener("click", onClick, true);
      host.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKey);
    };
  }, [armed, gl, camera, scene]);

  const a = points[0];
  const b = points[1] ?? hover ?? undefined;
  const colour = useMemo(() => {
    const css = getComputedStyle(gl.domElement).getPropertyValue("--accent").trim();
    return css || BRAND_TEAL;
  }, [gl]);
  useEffect(() => invalidate(), [points, hover, armed, invalidate]);

  if (!armed || !a) return null;
  return (
    <group>
      {b && <Tape a={a} b={b} colour={colour} resolution={[size.width, size.height]} final={points.length === 2} />}
      <End at={a} />
      {points[1] && <End at={points[1]} />}
    </group>
  );
}

function End({ at }: { at: P3 }) {
  return (
    <Html position={[at.x, at.y, at.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <span className="measure-end" />
    </Html>
  );
}

/** A fat line: the colour over a pale halo so it reads on any finish. Drawn over everything (no depth test). */
function useFatLine(width: number, colour: string, resolution: [number, number], dashed: boolean, order: number) {
  const line = useMemo(() => {
    const mat = new LineMaterial({ color: colour, linewidth: width, depthTest: false, depthWrite: false, transparent: true, dashed, dashSize: 0.08, gapSize: 0.06 });
    const l = new Line2(new LineGeometry(), mat);
    l.renderOrder = order;
    l.frustumCulled = false;
    l.raycast = noRaycast;
    l.userData.noMeasure = true;
    return l;
  }, [width, colour, dashed, order]);
  useEffect(
    () => () => {
      line.geometry.dispose();
      line.material.dispose();
    },
    [line],
  );
  line.material.resolution.set(resolution[0], resolution[1]);
  return line;
}

function Polyline({ pts, width, colour, resolution, dashed = false, order }: { pts: P3[]; width: number; colour: string; resolution: [number, number]; dashed?: boolean; order: number }) {
  const line = useFatLine(width, colour, resolution, dashed, order);
  const key = pts.map((p) => `${p.x},${p.y},${p.z}`).join(";");
  useMemo(() => {
    line.geometry.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
    line.computeLineDistances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, key]);
  return <primitive object={line} />;
}

function Tape({ a, b, colour, resolution, final }: { a: P3; b: P3; colour: string; resolution: [number, number]; final: boolean }) {
  const m = measure(a, b);
  const label = measureLabel(m);
  const sloped = isSloped(m);
  const c = legCorner(a, b);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  const halo = "#ffffff";
  return (
    <group>
      {sloped && final && <Polyline pts={[a.y <= b.y ? a : b, c, a.y <= b.y ? b : a]} width={1.5} colour={colour} resolution={resolution} dashed order={997} />}
      <Polyline pts={[a, b]} width={6} colour={halo} resolution={resolution} order={998} />
      <Polyline pts={[a, b]} width={3} colour={colour} resolution={resolution} order={999} />
      {m.distance > 0 && (
        <Html position={[mid.x, mid.y, mid.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className={`measure-label${final ? "" : " preview"}`} role="status">
            <strong>{label.main}</strong>
            {label.parts && <span>{label.parts}</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

/** The chrome button that arms the tape (M). */
export function MeasureButton() {
  const armed = useStore((s) => s.measureTool);
  const setUi = useStore((s) => s.setUi);
  return (
    <button
      type="button"
      className={`measure-btn float-card${armed ? " on" : ""}`}
      aria-pressed={armed}
      aria-label="Measure"
      title={armed ? "Measuring: click two points (Esc to clear, M to stop)" : "Measure (M)"}
      onClick={() => setUi({ measureTool: !armed })}
    >
      <Icon name="measure" size={16} />
    </button>
  );
}
