import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useStore } from "../store";

/**
 * Post-processing for the "high" quality setting: ambient occlusion to
 * ground the walls, fittings and furniture, with multisampled edges. The
 * composer renders in linear HDR, so tone mapping (otherwise done by the
 * renderer, see the Canvas) happens here as the last step.
 */
export function Effects() {
  const quality = useStore((s) => s.settings.quality);
  if (quality !== "high") return null;
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={1.2} distanceFalloff={0.6} intensity={2.2} aoSamples={16} denoiseSamples={4} denoiseRadius={10} halfRes />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
