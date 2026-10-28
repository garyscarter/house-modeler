/**
 * The physical sky on the CPU: a port of the Preetham sky shader in three-stdlib's `Sky` (the dome drawn behind
 * the house and baked into the environment), so the sun's colour and the environment's brightness come from
 * the same model. Colours are linear RGB triples.
 */

export type RGB = [number, number, number];
export type Vec3 = readonly [number, number, number];

/** The Sky shader's uniforms for a sun altitude (degrees): the same values the backdrop and the bake use. */
export interface SkyParams {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
}

export function skyParams(altitude: number): SkyParams {
  return { turbidity: 5, rayleigh: altitude > 0 ? 1.4 : 2.5, mieCoefficient: 0.004, mieDirectionalG: 0.85 };
}

// Constants of the Sky shader.
const TOTAL_RAYLEIGH: RGB = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST: RGB = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF = 1.6110731556870734;
const STEEPNESS = 1.5;
const EE = 1000;
const RAYLEIGH_ZENITH = 8.4e3;
const MIE_ZENITH = 1.25e3;
const DEG = Math.PI / 180;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const luminance = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Unit vector to a sun at this altitude (degrees), azimuth along +x. */
export function sunDirection(altitude: number): Vec3 {
  const a = altitude * DEG;
  return [Math.cos(a), Math.sin(a), 0];
}

interface Atmosphere {
  betaR: RGB;
  betaM: RGB;
  sunE: number;
  sunfade: number;
}

function atmosphere(sun: Vec3, p: SkyParams): Atmosphere {
  const sunE = EE * Math.max(0, 1 - Math.exp(-((CUTOFF - Math.acos(clamp(sun[1], -1, 1))) / STEEPNESS)));
  const sunfade = 1 - clamp(1 - Math.exp(sun[1] / 450000), 0, 1);
  const rc = p.rayleigh - (1 - sunfade);
  const mie = 0.434 * (0.2 * p.turbidity * 10e-18) * p.mieCoefficient;
  return {
    betaR: TOTAL_RAYLEIGH.map((b) => b * rc) as RGB,
    betaM: MIE_CONST.map((m) => m * mie) as RGB,
    sunE,
    sunfade,
  };
}

/** Optical path lengths (Rayleigh, Mie) along a direction whose height above the horizon is `y` (sine). */
function opticalLength(y: number): [number, number] {
  const zenith = Math.acos(Math.max(0, y));
  const inv = 1 / (Math.cos(zenith) + 0.15 * Math.pow(93.885 - zenith / DEG, -1.253));
  return [RAYLEIGH_ZENITH * inv, MIE_ZENITH * inv];
}

function extinction(a: Atmosphere, y: number): RGB {
  const [sR, sM] = opticalLength(y);
  return [0, 1, 2].map((i) => Math.exp(-(a.betaR[i] * sR + a.betaM[i] * sM))) as RGB;
}

/**
 * Ground the environment sees below the horizon, as a share of the horizon's luminance (linear RGB): the
 * gradient's ground over its horizon, so the bake keeps the same warm ground bounce. The shader mirrors this.
 */
export const GROUND_SHARE: RGB = [0.27, 0.235, 0.17];

/**
 * Radiance of the physical sky in a direction (unit vector, y up), without the sun's disc (the key light is the
 * sun). Below the horizon, the horizon's light reflected by a warm ground (`GROUND_SHARE`), faded in over the
 * first quarter of the lower hemisphere as the bake shader does.
 */
export function skyRadiance(dir: Vec3, sun: Vec3, p: SkyParams): RGB {
  const a = atmosphere(sun, p);
  const fex = extinction(a, dir[1]);
  const cosT = dir[0] * sun[0] + dir[1] * sun[1] + dir[2] * sun[2];
  const rc = cosT * 0.5 + 0.5;
  const rPhase = 0.05968310365946075 * (1 + rc * rc);
  const g = p.mieDirectionalG;
  const mPhase = 0.07957747154594767 * ((1 - g * g) / Math.pow(1 - 2 * g * cosT + g * g, 1.5));
  const blend = clamp(Math.pow(1 - sun[1], 5), 0, 1);
  const exponent = 1 / (1.2 + 1.2 * a.sunfade);
  const out: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const ratio = (a.betaR[i] * rPhase + a.betaM[i] * mPhase) / (a.betaR[i] + a.betaM[i]);
    let lin = Math.pow(a.sunE * ratio * (1 - fex[i]), 1.5);
    lin *= 1 + (Math.pow(a.sunE * ratio * fex[i], 0.5) - 1) * blend;
    const tex = (lin + 0.1 * fex[i]) * 0.04 + [0, 0.0003, 0.00075][i];
    out[i] = Math.pow(tex, exponent);
  }
  if (dir[1] < 0) {
    const l = luminance(out);
    const t = smooth(0, 0.25, -dir[1]);
    for (let i = 0; i < 3; i++) out[i] += (GROUND_SHARE[i] * l - out[i]) * t;
  }
  return out;
}

/** `n` directions spread evenly over the sphere (a Fibonacci lattice). */
export function sphereDirections(n: number): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out.push([Math.cos(golden * i) * r, y, Math.sin(golden * i) * r]);
  }
  return out;
}

/** Mean luminance over the whole sphere of a radiance function: the ambient level an environment gives. */
export function meanLuminance(radiance: (dir: Vec3) => readonly number[], n = 256): number {
  let sum = 0;
  for (const d of sphereDirections(n)) sum += luminance(radiance(d));
  return sum / n;
}

/** Mean luminance of the physical sky with the sun at this altitude (degrees). */
export function skyMeanLuminance(altitude: number, n = 256): number {
  const sun = sunDirection(altitude);
  const p = skyParams(altitude);
  return meanLuminance((d) => skyRadiance(d, sun, p), n);
}

/**
 * Radiance of the environment gradient (zenith, horizon, ground; linear RGB) in a direction: a port of
 * `skyGradientMaterial`'s fragment shader.
 */
export function gradientRadiance(dir: Vec3, top: readonly number[], horizon: readonly number[], ground: readonly number[]): RGB {
  const h = dir[1];
  const t = h > 0 ? Math.pow(smooth(0, 1, h), 0.6) : smooth(0, 0.25, -h);
  const to = h > 0 ? top : ground;
  return [0, 1, 2].map((i) => horizon[i] + (to[i] - horizon[i]) * t) as RGB;
}

/** Sun altitude (degrees) at which the physical sky is calibrated to the gradient, and the sun colour normalised. */
export const CALIBRATION_ALTITUDE = 50;

/**
 * Factor on the physical sky's radiance that makes its mean luminance at `CALIBRATION_ALTITUDE` equal the
 * gradient's: the same ambient level at midday, with the sky's own falloff and colour at other altitudes.
 */
export function skyCalibration(top: readonly number[], horizon: readonly number[], ground: readonly number[]): number {
  return gradientMeanLuminance(top, horizon, ground) / skyMeanLuminance(CALIBRATION_ALTITUDE);
}

/** Mean luminance of the environment gradient: its ambient level. */
export function gradientMeanLuminance(top: readonly number[], horizon: readonly number[], ground: readonly number[]): number {
  return meanLuminance((d) => gradientRadiance(d, top, horizon, ground));
}

/** Transmittance of sunlight through the atmosphere (Rayleigh and Mie extinction) with the sun at this altitude. */
export function sunTransmittance(altitude: number): RGB {
  const sun = sunDirection(altitude);
  return extinction(atmosphere(sun, skyParams(altitude)), sun[1]);
}

/** Below this altitude (degrees) the sun's colour holds: the model's sun on the horizon is a pure, garish red. */
export const REDDEST_SUN = 2;

/**
 * Colour of the sun's light at this altitude (degrees, linear RGB): the atmosphere's transmittance relative to
 * that at `CALIBRATION_ALTITUDE`, applied to `white` (the colour at that altitude), brightest channel kept at
 * white's, so the colour warms as the sun falls (to REDDEST_SUN). The intensity is set elsewhere (by the daylight curve); the
 * colour fades to black as the sun sets, over the degree below the horizon.
 */
export function sunColour(altitude: number, white: readonly number[] = [1, 1, 1]): RGB {
  const ref = sunTransmittance(CALIBRATION_ALTITUDE);
  const t = sunTransmittance(Math.max(altitude, REDDEST_SUN));
  const c = [0, 1, 2].map((i) => (white[i] * t[i]) / ref[i]);
  const k = (Math.max(...white) / Math.max(...c)) * smooth(-1, 0, altitude);
  return c.map((v) => v * k) as RGB;
}
