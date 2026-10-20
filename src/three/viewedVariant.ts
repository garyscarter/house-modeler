import { createContext, useContext } from "react";
import type { VariantKey } from "../types";
import { useSite, useStore } from "../store";

/**
 * The variant a 3D view shows. Each Viewer provides it (r3f bridges context
 * into the Canvas), so the site, the sun and the lighting inside it follow
 * that view's layout: side by side, each view has its own plot.
 */
export const ViewedVariant = createContext<VariantKey | undefined>(undefined);

/** The variant this view shows, or the active one outside a Viewer. */
export function useViewedVariant(): VariantKey {
  const k = useContext(ViewedVariant);
  const active = useStore((s) => s.activeVariant);
  return k ?? active;
}

/** The plot this view shows. */
export const useViewedSite = () => useSite(useViewedVariant());
