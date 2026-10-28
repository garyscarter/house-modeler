import * as THREE from "three";

/**
 * Variance shadow maps leak light where one caster sits in front of another, or a wall meets the
 * ground it shades: the blurred depth there has a large variance, and Chebyshev's bound reads it as
 * partly lit. Three trims the bound's bottom 30%; a stronger cut keeps those shadows solid while the
 * penumbra (where the bound runs to 1) stays soft. Runs once, at import, before any canvas compiles.
 */
const STOCK = "p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );";
const CUT = "p_max = smoothstep( 0.5, 0.95, p_max );";

const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
if (chunk.includes(STOCK)) THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(STOCK, CUT);
else if (import.meta.env.DEV) console.warn("softShadows: three's VSM chunk changed; light-bleed cut not applied");
