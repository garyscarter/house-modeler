import { useContext, useEffect, useLayoutEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import { EffectComposerContext } from "@react-three/postprocessing";
import * as THREE from "three";
import { ReflectionsPass } from "./ssrPass";

/**
 * The experimental passes on the high setting, a lazy chunk of their own that
 * Effects mounts between the ambient occlusion and the tone mapping while a
 * toggle is on. Only screen-space reflections are available: realism-effects
 * (SSGI with bounce light) imports `WebGLMultipleRenderTargets`, which three
 * removed in r172, so it does not build against three 0.185. Reflections come
 * from three's own SSRPass (see ssrPass.ts) and are worked out afresh every
 * frame, so the on-demand frame loop needs nothing extra.
 */
export function ExperimentalEffects({ reflections }: { reflections: boolean }) {
  const composer = useContext(EffectComposerContext);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  // Made in an effect, not a memo, so the pass that is disposed is never the one still in the composer.
  const [pass, setPass] = useState<ReflectionsPass | null>(null);
  useEffect(() => {
    if (!reflections) return;
    const p = new ReflectionsPass(gl, scene, camera as THREE.PerspectiveCamera);
    setPass(p);
    return () => {
      setPass(null);
      p.dispose();
    };
  }, [reflections, gl, scene, camera]);
  // The composer reads its passes when it renders, so tell it this one arrived (or left) and draw a frame.
  const rebuild = composer?.requestRebuild;
  useLayoutEffect(() => {
    rebuild?.();
    invalidate();
    return () => {
      rebuild?.();
      invalidate();
    };
  }, [pass, rebuild, invalidate]);
  return pass ? <primitive object={pass} /> : null;
}
