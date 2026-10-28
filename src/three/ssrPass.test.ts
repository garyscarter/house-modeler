import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { reflectance } from "./ssrPass";

const std = (roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ roughness, metalness });

describe("reflectance", () => {
  it("is strongest for mirrors and polished metal, then gloss by roughness", () => {
    const mirror = reflectance(std(0.04, 1), false);
    const metal = reflectance(std(0.3, 0.8), false);
    const gloss = reflectance(std(0.2), false);
    const porcelain = reflectance(std(0.24), false);
    const tile = reflectance(std(0.3), false);
    expect(mirror).toBeGreaterThan(metal);
    expect(metal).toBeGreaterThan(gloss);
    expect(gloss).toBeGreaterThan(porcelain);
    expect(porcelain).toBeGreaterThan(tile);
    expect(tile).toBeGreaterThan(0);
    expect(mirror).toBeLessThanOrEqual(1);
  });
  it("leaves matt and satin finishes, walls and non-standard materials alone", () => {
    expect(reflectance(std(0.5), true)).toBe(0);
    expect(reflectance(std(0.92), true)).toBe(0);
    expect(reflectance(new THREE.MeshBasicMaterial(), true)).toBe(0);
    expect(reflectance(new THREE.ShaderMaterial(), true)).toBe(0);
  });
  it("includes window glass only when asked", () => {
    const glass = new THREE.MeshPhysicalMaterial({ roughness: 0.02, transmission: 1 });
    const film = new THREE.MeshPhysicalMaterial({ roughness: 0.02 });
    film.userData.litMask = { value: new Uint32Array(4) };
    expect(reflectance(glass, true)).toBeGreaterThan(0);
    expect(reflectance(glass, false)).toBe(0);
    expect(reflectance(film, false)).toBe(0);
  });
  it("rounds to twentieths, so the mask shares a few materials", () => {
    for (const r of [0, 0.07, 0.13, 0.21, 0.29]) expect(Math.round(reflectance(std(r), false) * 20)).toBeCloseTo(reflectance(std(r), false) * 20, 9);
  });
});
