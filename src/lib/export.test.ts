import { describe, expect, it } from "vitest";
import type { HouseModel, Opening } from "../types";
import { builtInHouse, builtInProposed, listingSite } from "../houses/default";
import { changesCsv, esc, fileDate, planExtent, planScale, planSvg, printHtml, slug, toCsv } from "./export";
import { MARK, WORDMARK } from "./brand";
import { areaReport, diffModels, roomNotes } from "./report";
import { floor, rect } from "./testing";

/**
 * A small well-formedness check (no DOM in the test environment): every tag
 * closes in order, attributes are quoted, text has no stray markup and no
 * number came out as NaN or Infinity.
 */
function assertWellFormed(xml: string) {
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, "");
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0;
  for (let m = tag.exec(body); m; m = tag.exec(body)) {
    const text = body.slice(last, m.index);
    expect(text, "stray markup in text").not.toMatch(/[<>]|&(?!(amp|lt|gt|quot|apos|#\d+);)/);
    last = m.index + m[0].length;
    const [, close, name, , self] = m;
    if (close) expect(stack.pop(), `closing ${name}`).toBe(name);
    else if (!self) stack.push(name);
  }
  expect(body.slice(last).trim()).toBe("");
  expect(stack).toEqual([]);
  expect(body).not.toMatch(/NaN|Infinity|undefined/);
}

describe("planSvg", () => {
  const model = builtInHouse("");
  const site = listingSite();
  const ground = model.floors.find((f) => f.level === 0)!;

  it("inserts the overlay inside the svg, before the title block", () => {
    let frame: { k: number } | undefined;
    const svg = planSvg(model, ground, { variant: "As listed", date: "d", title: "Wiring guide", overlay: (f) => ((frame = f), `<g id="overlay-marker"/>`) });
    assertWellFormed(svg);
    expect(frame!.k).toBeGreaterThan(0);
    const at = svg.indexOf("overlay-marker");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(svg.indexOf("Wiring guide"));
    expect(at).toBeLessThan(svg.lastIndexOf("</svg>"));
  });

  it("draws a valid, scaled plan with room names, a scale bar and a title block", () => {
    const svg = planSvg(model, ground, { variant: "As listed", date: "15 October 2026", site });
    assertWellFormed(svg);
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toMatch(/<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="[\d.]+mm" height="[\d.]+mm"/);
    for (const r of ground.rooms) expect(svg).toContain(`>${esc(r.name)}<`);
    expect(svg).toContain('id="scale-bar"');
    expect(svg).toContain("Scale 1:100");
    expect(svg).toContain("Ground Floor · As listed");
    expect(svg).toContain("15 October 2026");
    expect(svg).toContain('class="north-arrow"');
    // Brand column in the title block.
    expect(svg).toContain(MARK.roof);
    expect(svg).toContain(WORDMARK.small.d); // the outlined wordmark, not typed text
    expect(svg).not.toContain(">STOREY<");
    // Areas and printed sizes appear with the names.
    expect(svg).toMatch(/14\.8 m² · 160 ft²/);
    expect(svg).toMatch(/3\.36 × 4\.42 m/);
  });

  it("draws door swings, windows and stairs", () => {
    const svg = planSvg(model, ground, { variant: "As listed", date: "today" });
    expect(svg).toMatch(/<path d="M [-\d.]+ [-\d.]+ A /); // a swing arc
    expect(svg).toContain('class="stairs"');
    expect(svg).toContain(">Up<");
    // No site, no north arrow.
    expect(svg).not.toContain("north-arrow");
  });

  it("points the north arrow from the site's bearing", () => {
    // The front faces 162°, so north is 18° clockwise of straight up the plan.
    expect(planSvg(model, ground, { variant: "x", date: "d", site })).toContain("rotate(18)");
    expect(planSvg(model, ground, { variant: "x", date: "d", site: { ...site, frontBearing: 180 } })).toContain("rotate(0)");
  });

  it("escapes names and fits small rooms", () => {
    const f = floor([rect("Mum & Dad's <room>", 0, 0, 400, 300), rect("WC", 400, 0, 480, 120)]);
    const m: HouseModel = { floors: [f], ceilingHeight: 2.4, slabThickness: 0.25 };
    const svg = planSvg(m, f, { variant: "Proposed", date: "d" });
    assertWellFormed(svg);
    expect(svg).toContain("Mum &amp; Dad's &lt;room&gt;");
    expect(svg).toContain(">WC<");
  });

  it("chooses the largest scale that fits A4", () => {
    expect(planScale({ x0: 0, y0: 0, x1: 2, y1: 2 })).toBe(50);
    expect(planScale({ x0: 0, y0: 0, x1: 12, y1: 9 })).toBe(100);
    expect(planScale({ x0: 0, y0: 0, x1: 30, y1: 20 })).toBe(200);
    expect(planScale(planExtent([model, builtInProposed("")]))).toBe(100);
  });
});

describe("CSV", () => {
  it("quotes cells and defuses formulas", () => {
    expect(toCsv([["a,b", 'say "hi"', "=SUM(A1)", 1.234, undefined]])).toBe('"a,b","say ""hi""",\'=SUM(A1),1.23,\r\n');
  });

  it("lists every change with rates, costs and a rough total", () => {
    const changes = diffModels(builtInHouse(""), builtInProposed(""));
    const csv = changesCsv(changes, { newWindow: 900, contingency: 10 });
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Floor,Category,Description,Quantity,Unit,Rate (£),Cost (£),Structural advice");
    expect(lines).toHaveLength(1 + changes.length + 4);
    expect(lines.filter((l) => l.includes("New window"))).toEqual([expect.stringContaining(",1,each,900,900,"), expect.stringContaining(",1,each,900,900,")]);
    expect(lines.at(-1)).toBe(",,Rough estimate (from your own rates; not a quote),,,,1980");
  });
});

describe("printHtml", () => {
  it("includes areas, changes, costs, notes and a plan per floor of each variant", () => {
    const a = builtInHouse("");
    const b = builtInProposed("");
    b.floors[1].rooms.find((r) => r.name === "New Room")!.notes = "Check headroom & daylight";
    const changes = diffModels(a, b);
    const html = printHtml({
      date: "15 October 2026",
      variants: [
        { label: "As listed", model: a, notes: roomNotes(a) },
        { label: "Proposed", model: b, notes: roomNotes(b) },
      ],
      areas: areaReport(a, b),
      changes,
      rates: { newFloorArea: 2000 },
      site: listingSite(),
      snapshots: [{ caption: "3D view", src: "data:image/png;base64,AAAA" }],
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Floor areas");
    expect(html).toContain("Changes from As listed to Proposed");
    expect(html).toContain("New room: New Room");
    expect(html).toContain("Rough cost estimate");
    expect(html).toContain("not a quote");
    expect(html).toContain("Check headroom &amp; daylight");
    expect(html.match(/<section class="plan">/g)).toHaveLength(4);
    expect(html).not.toContain("<?xml");
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it("is branded: mark, wordmark, house name, title, footer and embedded font", () => {
    const a = builtInHouse("");
    const base = { date: "d", variants: [{ label: "As listed", model: a, notes: [] }], areas: areaReport(a), rates: {}, snapshots: [] };
    const html = printHtml({ ...base, houseName: "Test house", fontCss: "@font-face{font-family:X;src:url(data:font/woff2;base64,QQ==)}" });
    expect(html).toContain("Storey");
    expect(html).toContain(MARK.roof);
    expect(html).toContain(WORDMARK.small.d);
    expect(html).toContain("<h1>Test house</h1>");
    expect(html).toContain("<title>Test house report · Storey</title>");
    expect(html).toContain("Made with Storey · Test house · d");
    expect(html).toContain("@font-face{font-family:X;");
    expect(printHtml(base)).toContain("<title>Report · Storey</title>");
  });

  it("works with one variant (areas only)", () => {
    const a = builtInHouse("");
    const html = printHtml({ date: "d", variants: [{ label: "As listed", model: a, notes: [] }], areas: areaReport(a), rates: {}, snapshots: [] });
    expect(html).toContain("Floor areas");
    expect(html).not.toContain("Changes from");
    expect(html.match(/<section class="plan">/g)).toHaveLength(2);
  });
});

describe("printHtml saved views", () => {
  const a = builtInHouse("");
  const base = { date: "d", variants: [{ label: "As listed", model: a, notes: [] }], areas: areaReport(a), rates: {}, snapshots: [] };
  it("prints each view with escaped name and a picture per layout", () => {
    const html = printHtml({ ...base, views: [{ name: "Kitchen <b>& garden", shots: [{ label: "As listed", src: "data:image/png;base64,AAAA" }, { label: "Proposed", src: "data:image/png;base64,BBBB" }] }] });
    expect(html).toContain('<section class="views"><h2>Saved views</h2>');
    expect(html).toContain("Kitchen &lt;b&gt;&amp; garden");
    expect(html).not.toContain("<b>& garden");
    expect(html).toContain("base64,BBBB");
    expect(html).toContain("Proposed");
  });
  it("leaves the section out with no views", () => {
    expect(printHtml(base)).not.toContain('class="views"');
    expect(printHtml({ ...base, views: [] })).not.toContain('class="views"');
  });
});

describe("file names", () => {
  it("are safe and dated", () => {
    expect(slug("Floor 1 (Proposed)")).toBe("floor-1-proposed");
    expect(slug("***")).toBe("file");
    expect(fileDate(new Date(2026, 9, 5))).toBe("2026-10-05");
  });
});

// Keep the Opening import honest for the symbol switch: every kind draws something.
describe("opening symbols", () => {
  it("draws every kind of opening", () => {
    const kinds: Opening["kind"][] = ["door", "front", "window", "bay", "garage", "gap", "patio", "french", "bifold"];
    const f = floor(
      [rect("A", 0, 0, 1000, 400)],
      kinds.map((kind, i) => ({ id: kind, kind, x: 60 + i * 100, y: 400, orientation: "h" as const, widthM: 0.8 })),
    );
    const svg = planSvg({ floors: [f], ceilingHeight: 2.4, slabThickness: 0.25 }, f, { variant: "x", date: "d" });
    assertWellFormed(svg);
    expect(svg.match(/<g transform="matrix\(/g)).toHaveLength(kinds.length);
  });
});
