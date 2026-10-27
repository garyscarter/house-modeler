import type { Fixture } from "../types";

/** Rug patterns: fixed-colour designs a Rug fixture can carry. They are drawn in three/rugTextures.ts. */
export const RUG_PATTERNS: { id: string; label: string }[] = [{ id: "leopard", label: "Pastel leopard" }];

/** The ground colour of the rug's body in 3D, under the printed face. */
export const RUG_GROUND: Record<string, string> = { leopard: "#d8d0bd" };

/** The rug's pattern id, or undefined for a plain rug (or an unknown id). */
export function rugPattern(f: Pick<Fixture, "rug">): string | undefined {
  return f.rug && RUG_GROUND[f.rug] ? f.rug : undefined;
}

/** Spot colours for the plan symbol of a patterned rug. */
export const RUG_SPOTS: Record<string, string[]> = { leopard: ["#7e6f85", "#8a9270", "#d9a884", "#b9a23d", "#aab8b5"] };
