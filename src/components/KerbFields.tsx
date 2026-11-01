import { KERBS, kerbOf } from "../lib/gardenCatalogue";
import { NumberField } from "./inspector";
import type { KerbStyle, SiteSurface } from "../types";

const STYLES = Object.keys(KERBS) as KerbStyle[];

/**
 * The edge of a lawn or a bed: its kerb style and how far it stands above the surface (cm).
 * Nothing for other surfaces, which take no kerb. `onChange` gets the fields to set; a style change
 * clears the height so the style's own default applies.
 */
export function KerbFields({ surface, onChange }: { surface: SiteSurface; onChange: (patch: Pick<SiteSurface, "kerb" | "kerbHeight">) => void }) {
  if (surface.kind !== "lawn" && surface.kind !== "bed") return null;
  const k = kerbOf(surface);
  return (
    <>
      <label>
        Edging
        <select aria-label="Kerb style" value={k.style} onChange={(e) => onChange({ kerb: e.target.value as KerbStyle, kerbHeight: undefined })}>
          {STYLES.map((s) => (
            <option key={s} value={s}>
              {KERBS[s].label}
            </option>
          ))}
        </select>
      </label>
      {k.style !== "none" && (
        <label>
          Kerb height (cm)
          <NumberField value={Math.round(k.height * 100)} step={1} min={0} max={60} label="Kerb height in centimetres" onCommit={(cm) => onChange({ kerb: k.style, kerbHeight: cm / 100 })} />
        </label>
      )}
    </>
  );
}
