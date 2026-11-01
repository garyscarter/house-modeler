import { describe, expect, it } from "vitest";
import { blurValue, typedValue } from "./numberInput";

describe("typedValue", () => {
  it("commits valid numbers and ignores half-typed text", () => {
    expect(typedValue("0.8", { min: 0.5, max: 20 })).toBe(0.8);
    expect(typedValue("", {})).toBeUndefined();
    expect(typedValue("-", {})).toBeUndefined();
    expect(typedValue("3.", {})).toBe(3);
  });
  it("does not commit values outside the range while typing", () => {
    expect(typedValue("4", { min: 5, max: 60 })).toBeUndefined();
    expect(typedValue("45", { min: 5, max: 60 })).toBe(45);
    expect(typedValue("90", { min: 5, max: 60 })).toBeUndefined();
  });
  it("is positive by default and takes zero or negatives when asked", () => {
    expect(typedValue("0")).toBeUndefined();
    expect(typedValue("0", { min: 0 })).toBe(0);
    expect(typedValue("-1.5", { min: -Infinity })).toBe(-1.5);
  });
});

describe("blurValue", () => {
  it("clamps an out-of-range number", () => {
    expect(blurValue("90", { min: 5, max: 60 })).toBe(60);
    expect(blurValue("1", { min: 5, max: 60 })).toBe(5);
    expect(blurValue("0.0001", { min: 0.5 })).toBe(0.5);
    expect(blurValue("-3", { min: 0 })).toBe(0);
    expect(blurValue("90", {})).toBeUndefined();
  });
  it("reverts, not commits, a non-positive value when no min is given", () => {
    expect(blurValue("0")).toBeUndefined();
    expect(blurValue("-2", { max: 10 })).toBeUndefined();
    expect(blurValue("0", { min: 0 })).toBeUndefined();
  });
  it("leaves valid, empty and unreadable text alone", () => {
    expect(blurValue("45", { min: 5, max: 60 })).toBeUndefined();
    expect(blurValue("", {})).toBeUndefined();
    expect(blurValue("e", {})).toBeUndefined();
  });
});
