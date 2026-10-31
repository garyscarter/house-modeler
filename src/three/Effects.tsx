import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { Effect, ToneMappingMode } from "postprocessing";
import { Uniform } from "three";
import type * as THREE from "three";
import { useStore } from "../store";
import { exposureByRenderer } from "./walk/WalkExposure";

/**
 * N8AO re-detects transparent materials and then draws the scene twice to
 * keep the AO off glass. Window glass would always trigger it, so it is
 * switched off for good: a little more AO shows through panes.
 */
function noTransparency(pass: { configuration: { transparencyAware: boolean } } | null) {
  if (pass) pass.configuration.transparencyAware = false;
}

const EXPOSURE_FRAG = `uniform float exposure;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) { outputColor = vec4(inputColor.rgb * exposure, inputColor.a); }`;

/**
 * Eyes adjust on the high chain: scales the linear colour by the walk's exposure (WalkExposure writes it per renderer;
 * 1 outside the walk). The composer bypasses the renderer's toneMappingExposure, which is why this exists.
 */
class ExposureEffectImpl extends Effect {
  target: THREE.WebGLRenderer | null = null;
  constructor() {
    super("ExposureEffect", EXPOSURE_FRAG, { uniforms: new Map([["exposure", new Uniform(1)]]) });
  }
  update() {
    this.uniforms.get("exposure")!.value = (this.target && exposureByRenderer.get(this.target)?.factor) ?? 1;
  }
}

/**
 * Post-processing for the "high" quality setting: ambient occlusion to
 * ground the walls, fittings and furniture, with multisampled edges. The
 * composer renders in linear HDR, so tone mapping (otherwise done by the
 * renderer, see the Canvas) happens here as the last step.
 */
export function Effects() {
  const quality = useStore((s) => s.settings.quality);
  const gl = useThree((s) => s.gl);
  const effect = useMemo(() => new ExposureEffectImpl(), []);
  effect.target = gl;
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__exposureEffect = effect;
  if (quality !== "high") return null;
  return (
    <EffectComposer multisampling={2}>
      <N8AO aoRadius={1.2} distanceFalloff={0.6} intensity={3} aoSamples={16} denoiseSamples={4} denoiseRadius={10} halfRes ref={noTransparency} />
      {/* Just before ToneMapping, not first: N8AO multiplies by occlusion and exposure by a constant, so the order does not
          change the image, and next to ToneMapping postprocessing merges both into one pass (a future Bloom goes between). */}
      <primitive object={effect} dispose={null} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
