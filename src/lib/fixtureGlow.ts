import * as THREE from "three";
import type { Fixture } from "../types";

/** Which glowing part of a lamp: its bulb or lens, or the shade fabric the light comes through. */
export type GlowRole = "bulb" | "fabric";
/** A part's colour, finish and (when not its own colour) emissive colour. */
export type Look = { c: string; f: "lamp" | "shade" | "matt"; e?: string };

/** The warm glow of a lit table lamp, floor lamp or lit mirror. */
export const GLOW = "#fff1d6";
/** Dimmer steps for a glow colour, so a dimmer drag mints at most ten materials per colour. */
export const DIM_STEPS = 10;

/** The emissive colour of a light fitting's glow: its light colour scaled by the dimmer, in whole steps, never below one. */
export function glowEmissive(color: string, dim: number): string {
  return "#" + new THREE.Color(color).multiplyScalar(Math.max(1, Math.round(dim * DIM_STEPS)) / DIM_STEPS).getHexString();
}

/**
 * The look of a glowing part when lit. `off` is its unlit colour (a fabric's own colour). With `light` (a light
 * fitting) the part glows in the light's colour, dimmed; without it (a lamp or lit mirror) it glows warm or in its own colour.
 */
export function litLook(role: GlowRole, off: string, light?: { color: string; dim: number }): Look {
  if (role === "bulb") return light ? { c: light.color, f: "lamp", e: glowEmissive(light.color, light.dim) } : { c: GLOW, f: "lamp" };
  return light ? { c: off, f: "shade", e: glowEmissive(light.color, light.dim) } : { c: off, f: "shade" };
}

/**
 * A key for everything about a floor's fixtures that shapes their geometry: the fixtures without the lit state
 * (`on`, `dim`, `warmth`), which only change a material. Top-level keys only: other keys may nest.
 */
export function fixtureGeometryKey(fixtures: readonly Fixture[] | undefined): string {
  return JSON.stringify(
    (fixtures ?? []).map((f) => {
      const { on: _on, dim: _dim, warmth: _warmth, ...rest } = f;
      return rest;
    }),
  );
}
