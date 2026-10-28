import { lazy, Suspense } from "react";
import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useStore } from "../store";

/** The experimental passes (reflections, bounce light) are a chunk of their own, loaded only while a toggle is on. */
const loadExperimental = () => import("./ExperimentalEffects");
const Experimental = lazy(() => loadExperimental().then((m) => ({ default: m.ExperimentalEffects })));

/**
 * N8AO re-detects transparent materials and then draws the scene twice to
 * keep the AO off glass. Window glass would always trigger it, so it is
 * switched off for good: a little more AO shows through panes.
 */
function noTransparency(pass: { configuration: { transparencyAware: boolean } } | null) {
  if (pass) pass.configuration.transparencyAware = false;
}

/**
 * Post-processing for the "high" quality setting: ambient occlusion to
 * ground the walls, fittings and furniture, with multisampled edges. The
 * composer renders in linear HDR, so tone mapping (otherwise done by the
 * renderer, see the Canvas) happens here as the last step. The experimental
 * passes, when switched on, go between the AO and the tone mapping.
 */
export function Effects() {
  const quality = useStore((s) => s.settings.quality);
  const reflections = useStore((s) => !!s.settings.effects?.reflections);
  if (quality !== "high") return null;
  return (
    <EffectComposer multisampling={2}>
      <N8AO aoRadius={1.2} distanceFalloff={0.6} intensity={3} aoSamples={16} denoiseSamples={4} denoiseRadius={10} halfRes ref={noTransparency} />
      {reflections && (
        <Suspense fallback={null}>
          <Experimental reflections />
        </Suspense>
      )}
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
