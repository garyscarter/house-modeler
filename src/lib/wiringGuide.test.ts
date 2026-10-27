import { describe, expect, it } from "vitest";
import { electricalLayerSvg, scheduleCsv, wiringGuideHtml } from "./wiringGuide";
import { listing91770873 } from "./houses/listing91770873";

describe("wiring guide (stubs until Dua Lipa's chunk)", () => {
  it("exports the guide, the layer and the CSV", () => {
    const model = listing91770873("");
    expect(wiringGuideHtml({ date: "27 October 2026", variantLabel: "Proposed", model })).toMatch(/^<!doctype html>/);
    expect(scheduleCsv(model).split("\r\n")[0]).toMatch(/^Floor,Room,Point/);
    expect(typeof electricalLayerSvg).toBe("function");
  });
});
