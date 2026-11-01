import { useStore } from "../store";
import { useChassis } from "../components/useChassis";
import { resolveQuality, type Quality } from "../lib/quality";

/** The render quality in force: the saved setting resolved against the chassis ("auto" depends on the screen). */
export function useQuality(): Quality {
  const setting = useStore((s) => s.settings.quality);
  const chassis = useChassis((s) => s.chassis);
  return resolveQuality(setting, chassis);
}

/** The same for non-React code (event handlers, render loops). */
export function currentQuality(): Quality {
  return resolveQuality(useStore.getState().settings.quality, useChassis.getState().chassis);
}
