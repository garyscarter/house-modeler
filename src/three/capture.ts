import { useEffect, useSyncExternalStore } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

export interface CaptureTarget {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}

const registry = new Map<string, CaptureTarget>();
const listeners = new Set<() => void>();
let ids: string[] = [];
const changed = () => {
  ids = [...registry.keys()];
  listeners.forEach((l) => l());
};

/** Registers a viewer's renderer, scene and camera so exports can reach them. */
export function CaptureBridge({ id }: { id: string }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    registry.set(id, { gl, scene, camera });
    changed();
    return () => {
      registry.delete(id);
      changed();
    };
  }, [id, gl, scene, camera]);
  return null;
}

/** The registered viewer with this id, or the first one. */
export function getCapture(id?: string): CaptureTarget | undefined {
  if (id) return registry.get(id);
  return registry.values().next().value;
}

/** Ids of the 3D viewers on screen ("main", or "current" and "proposed" side by side), for the export buttons. */
export function useCaptureIds(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ids,
  );
}

/** Largest side of a snapshot, px; beyond this some iPads fail to allocate the buffer. */
const MAX_SIDE = 4096;

/**
 * A PNG of a viewer at `scale` times its on-screen size. The scene is
 * rendered at that resolution and copied out straight away, because the
 * WebGL drawing buffer is not kept between frames. Post-processing is
 * skipped; labels are HTML and not part of the picture.
 */
export async function captureImage(id: string | undefined, scale: number): Promise<Blob> {
  const t = getCapture(id);
  if (!t) throw new Error("Open the 3D view to take a snapshot.");
  const { gl, scene, camera } = t;
  const size = gl.getSize(new THREE.Vector2());
  const ratio = gl.getPixelRatio();
  const s = Math.min(scale, MAX_SIDE / Math.max(size.x, size.y, 1));
  const out = document.createElement("canvas");
  // With post-processing on, the composer switches the renderer's tone mapping off and applies it itself; a direct render needs it back.
  const toneMapping = gl.toneMapping;
  try {
    if (toneMapping === THREE.NoToneMapping) gl.toneMapping = THREE.NeutralToneMapping;
    gl.setPixelRatio(s);
    gl.setSize(size.x, size.y, false);
    gl.render(scene, camera);
    out.width = gl.domElement.width;
    out.height = gl.domElement.height;
    out.getContext("2d")!.drawImage(gl.domElement, 0, 0);
  } finally {
    gl.toneMapping = toneMapping;
    gl.setPixelRatio(ratio);
    gl.setSize(size.x, size.y, false);
  }
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the snapshot."))), "image/png"));
}

/** Meshes this many metres across are the sky dome and the far ground, not the model. */
const BACKDROP_SIZE = 150;

/** Whether an object belongs in a model export: no lights, cameras, helpers, sprites, sky or render-target effects. */
function exportable(o: THREE.Object3D): boolean {
  if ((o as THREE.Light).isLight || (o as THREE.Camera).isCamera || o.type.endsWith("Helper") || (o as THREE.Sprite).isSprite) return false;
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh) return true;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    // Shader materials (sky, sun-hours overlay) have no glTF equivalent; render-target maps (contact shadows) can't be read back.
    if ((m as THREE.ShaderMaterial).isShaderMaterial) return false;
    const map = (m as THREE.MeshStandardMaterial).map;
    if (map && ((map as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture || !map.image)) return false;
  }
  const g = mesh.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  return !g.boundingSphere || g.boundingSphere.radius < BACKDROP_SIZE;
}

/**
 * The scene of a viewer as a binary glTF (.glb): house, roof, furniture and
 * site, without the sky, lights or helpers. Objects are hidden for the
 * export and shown again afterwards.
 */
export async function exportGlb(id: string | undefined): Promise<Blob> {
  const t = getCapture(id);
  if (!t) throw new Error("Open the 3D view to export the model.");
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const hidden: THREE.Object3D[] = [];
  t.scene.traverse((o) => {
    if (o !== t.scene && o.visible && !exportable(o)) hidden.push(o);
  });
  hidden.forEach((o) => (o.visible = false));
  try {
    const result = await new GLTFExporter().parseAsync(t.scene, { binary: true, onlyVisible: true });
    return new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
  } finally {
    hidden.forEach((o) => (o.visible = true));
  }
}
