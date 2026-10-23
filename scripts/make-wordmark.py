# Outline the Storey wordmark: "storey" in Bricolage Grotesque, weight 250, letter spacing 0.05 em,
# in two optical sizes (small for the top bar and other uses under ~40 px; large for display).
# Writes src/lib/wordmark.json, read by src/lib/brand.ts and server/page.mjs.
# Usage: pip install fonttools brotli uharfbuzz && python3 scripts/make-wordmark.py
import io, json, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import uharfbuzz as hb

SRC = "node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-standard-normal.woff2"
TEXT, WGHT, TRACK = "storey", 250, 0.05

def outline(opsz):
    f = TTFont(SRC)
    inst = instancer.instantiateVariableFont(f, {"opsz": opsz, "wght": WGHT, "wdth": 100})
    inst.flavor = None
    buf = io.BytesIO(); inst.save(buf); data = buf.getvalue()
    upm = inst["head"].unitsPerEm
    face = hb.Face(data); font = hb.Font(face)
    b = hb.Buffer(); b.add_str(TEXT); b.guess_segment_properties()
    hb.shape(font, b, {"kern": True, "liga": True})
    gs = inst.getGlyphSet(); order = inst.getGlyphOrder()
    pen = SVGPathPen(gs, lambda v: f"{round(v, 1):g}")
    bounds = BoundsPen(gs)
    x = 0
    n = len(b.glyph_infos)
    for i, (info, pos) in enumerate(zip(b.glyph_infos, b.glyph_positions)):
        name = order[info.codepoint]
        t = (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)  # flip y: SVG y down, baseline at 0
        gs[name].draw(TransformPen(pen, t)); gs[name].draw(TransformPen(bounds, t))
        x += pos.x_advance + (TRACK * upm if i < n - 1 else 0)
    x0, y0, x1, y1 = bounds.bounds
    # viewBox: the ink's left and right edges; top and bottom from the t's ascent and the y's descent. Baseline at y = 0.
    return {"opsz": opsz, "d": pen.getCommands(), "viewBox": [round(x0, 1), round(y0, 1), round(x1 - x0, 1), round(y1 - y0, 1)]}

out = {"text": TEXT, "weight": WGHT, "tracking": TRACK, **{k: outline(v) for k, v in (("small", 18), ("large", 96))}}
with open(sys.argv[1] if len(sys.argv) > 1 else "src/lib/wordmark.json", "w") as fh:
    json.dump(out, fh, indent=1)
    fh.write("\n")
for k in ("small", "large"): print(k, out[k]["opsz"], out[k]["viewBox"], len(out[k]["d"]))
