import { describe, expect, it } from "vitest";
import { DEFAULT_PRINT, FRAME_W, PRINTS, pictureSize, pictureSizeOf } from "./art";

describe("pictures", () => {
  it("has a default print that exists and frames with a moulding width", () => {
    expect(PRINTS.some((p) => p.id === DEFAULT_PRINT)).toBe(true);
    expect(FRAME_W.black).toBeGreaterThan(0);
    expect(FRAME_W.none).toBe(0);
  });
  it("sizes a standard print either way up and recognises it again", () => {
    expect(pictureSize("a2", "portrait")).toEqual({ w: 0.42, h: 0.594 });
    expect(pictureSize("a2", "landscape")).toEqual({ w: 0.594, h: 0.42 });
    expect(pictureSizeOf(0.42, 0.594)).toEqual({ id: "a2", orientation: "portrait" });
    expect(pictureSizeOf(0.7, 0.5)).toEqual({ id: "50x70", orientation: "landscape" });
    expect(pictureSizeOf(0.6, 0.6)).toBeUndefined();
    expect(pictureSize("huge", "portrait")).toBeUndefined();
  });
});
