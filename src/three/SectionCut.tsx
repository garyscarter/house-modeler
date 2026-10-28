import { useLayoutEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store";

/**
 * The section cut: one horizontal plane, normal pointing down, that hides
 * everything above `sectionHeight` (world y; the ground floor sits at 0).
 *
 * three's global planes (`gl.clippingPlanes`) never reach the shadow pass, so
 * the plane goes on the materials as a local plane with `clipShadows` on: the
 * shadow map then follows the cut too. Materials come from module-wide caches
 * shared by every viewer (the wipe draws two), so the plane and its array are
 * module-wide too and every viewer shows the same cut. Materials are tagged as
 * they appear while the cut is on, never cloned or disposed. Once tagged they
 * keep the plane; switching the cut off parks it far overhead, so toggling
 * does not recompile every shader. Shader materials (the sky) are left alone:
 * their `clipping` flag is off, and the dome must stay whole. The plot and the
 * neighbours are cut at the same height as the house: left whole, the
 * attached neighbour hides half the house from the home view.
 */
const OFF = 1e5;
const PLANE = new THREE.Plane(new THREE.Vector3(0, -1, 0), OFF);
const PLANES = [PLANE];
const tagged = new WeakSet<THREE.Material>();

function tag(m: THREE.Material) {
  if (tagged.has(m)) return;
  tagged.add(m);
  if ((m as THREE.ShaderMaterial).isShaderMaterial) return;
  // Someone else's clipping: leave it be.
  if (m.clippingPlanes && m.clippingPlanes.length) return;
  m.clippingPlanes = PLANES;
  m.clipShadows = true;
}

export function SectionCut() {
  const height = useStore((s) => s.sectionHeight);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const on = height !== null;

  useLayoutEffect(() => {
    if (on) gl.localClippingEnabled = true;
    PLANE.constant = on ? height : OFF;
    invalidate();
  }, [gl, on, height, invalidate]);

  // Before each frame while the cut is on: put the plane on anything new (a floor shown, an async texture's material).
  useFrame(() => {
    if (!on) return;
    const visit = (o: THREE.Object3D) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      if (Array.isArray(mat)) mat.forEach(tag);
      else tag(mat);
    };
    scene.traverse(visit);
  });
  return null;
}
