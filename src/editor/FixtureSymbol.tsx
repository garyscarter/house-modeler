import { createElement, memo, type ReactNode } from "react";
import { burners, radiatorPanels, wardrobeDoorCount, type CatalogueItem } from "../lib/catalogue";

/**
 * Plan symbol for a catalogue item, drawn in a local frame centred on (0,0)
 * with the item's footprint in px (w × d) and its back along the top edge.
 * Rotation is applied by the caller. `stroke` is one screen pixel in image px
 * so lines stay crisp at any zoom; `m` is one metre in image px for details
 * with a real size (seat depth, burners, panel widths).
 */
export const FixtureSymbol = memo(function FixtureSymbol({
  item,
  w,
  d,
  m,
  stroke,
  color,
  selected,
  clash,
  ghost,
}: {
  item: CatalogueItem;
  w: number;
  d: number;
  m: number;
  stroke: number;
  color?: string;
  selected?: boolean;
  clash?: boolean;
  ghost?: boolean;
}) {
  const outline = selected ? "#d97706" : clash ? "#dc2626" : ghost ? "#16a34a" : "#374151";
  const sw = stroke * (selected ? 2.2 : 1.2);
  const fill = ghost ? "#16a34a" : clash ? "#fca5a5" : color ?? item.color;
  // Wall-hung items above worktop height are dashed, as on architects' plans.
  const high = (item.mount ?? 0) >= 1;
  const fo = ghost ? 0.25 : high ? 0.35 : 0.85;
  const dash = high ? `${stroke * 5} ${stroke * 3}` : undefined;
  const r = Math.min(w, d) * 0.06;
  // Burner rings show light on a dark hob or range and dark on a white cooker.
  const burnerInk = isDark(fill) ? "#e5e7eb" : outline;
  const line = { stroke: outline, strokeWidth: sw * 0.8, fill: "none" as const };
  const thin = { stroke: outline, strokeWidth: sw * 0.5, fill: "none" as const, strokeOpacity: 0.7 };
  const body = (rx = r) => <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={rx} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw} strokeDasharray={dash} />;
  const x0 = -w / 2;
  const y0 = -d / 2;
  const x1 = w / 2;
  const y1 = d / 2;
  /** Vertical dividers every `pitch` metres (cabinet doors, bookcase bays). */
  const dividers = (pitch: number, from = y0, to = y1, style = thin) => {
    const n = Math.max(1, Math.round(w / (pitch * m)));
    return Array.from({ length: n - 1 }, (_, i) => {
      const x = x0 + ((i + 1) * w) / n;
      return <line key={i} x1={x} y1={from} x2={x} y2={to} {...style} />;
    });
  };
  const front = (inset: number) => <line x1={x0} y1={y1 - inset} x2={x1} y2={y1 - inset} {...thin} />;
  // Children passed as arguments, not an array, so the fixed parts need no keys.
  const g = (...kids: ReactNode[]) => createElement("g", null, ...kids);

  switch (item.symbol) {
    case "bed": {
      const pillowD = d * 0.18;
      return g(
        body(),
        <rect key="p" x={x0 + w * 0.06} y={y0 + d * 0.04} width={w * 0.88} height={pillowD} rx={r} {...line} />,
        w > 1.1 * m && <line key="s" x1={0} y1={y0 + d * 0.04} x2={0} y2={y0 + d * 0.04 + pillowD} {...line} />,
        <line key="t" x1={x0} y1={y0 + d * 0.28} x2={x1} y2={y0 + d * 0.28} {...line} />,
      );
    }
    case "cot": {
      const bars = Math.max(4, Math.round(w / (0.1 * m)));
      return g(
        body(0),
        <rect key="m" x={x0 + 0.03 * m} y={y0 + 0.03 * m} width={w - 0.06 * m} height={d - 0.06 * m} {...line} />,
        ...Array.from({ length: bars - 1 }, (_, i) => {
          const x = x0 + ((i + 1) * w) / bars;
          return <line key={i} x1={x} y1={y1 - 0.03 * m} x2={x} y2={y1} {...thin} />;
        }),
      );
    }
    case "toilet":
      return g(
        <rect key="c" x={x0} y={y0} width={w} height={d * 0.28} rx={r} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw} />,
        <ellipse key="b" cx={0} cy={d * 0.18} rx={w * 0.42} ry={d * 0.32} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw} />,
      );
    case "basin":
      return g(body(), <ellipse key="b" cx={0} cy={d * 0.04} rx={w * 0.34} ry={d * 0.3} {...line} />);
    case "vanity":
      return g(
        body(),
        <rect key="b" x={-w * 0.36} y={y0 + d * 0.22} width={w * 0.72} height={d * 0.62} rx={d * 0.25} {...line} />,
        <circle key="t" cx={0} cy={y0 + d * 0.1} r={0.02 * m} {...line} />,
      );
    case "shower":
      return g(
        body(),
        <line key="a" x1={x0} y1={y0} x2={x1} y2={y1} {...thin} />,
        <line key="b" x1={x1} y1={y0} x2={x0} y2={y1} {...thin} />,
        <circle key="w" cx={0} cy={0} r={0.05 * m} {...line} />,
      );
    case "quadrant": {
      // Two straight sides in the back-left corner and a curved glass front.
      const path = `M ${x0} ${y0} L ${x1} ${y0} A ${w} ${d} 0 0 1 ${x0} ${y1} Z`;
      return g(
        <path key="t" d={path} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw} />,
        <path key="g" d={`M ${x1 - 0.04 * m} ${y0} A ${w - 0.04 * m} ${d - 0.04 * m} 0 0 1 ${x0} ${y1 - 0.04 * m}`} {...thin} />,
        <circle key="w" cx={x0 + w * 0.3} cy={y0 + d * 0.3} r={0.04 * m} {...line} />,
      );
    }
    case "bath":
      return g(
        body(),
        <rect key="i" x={x0 + w * 0.06} y={y0 + d * 0.13} width={w * 0.88} height={d * 0.74} rx={d * 0.3} {...line} />,
        <circle key="p" cx={x1 - w * 0.13} cy={0} r={0.035 * m} {...line} />,
      );
    case "mirror":
    case "mirror-lit":
    case "mirror-round":
    case "mirror-cabinet": {
      // A thin line along the wall with diagonal hatching for glass; round ones bulge, cabinets show their doors.
      const tick = Math.min(0.06 * m, w * 0.1);
      const at = [0.3, 0.42, 0.54].map((f) => x0 + w * f);
      const mid = item.symbol === "mirror-cabinet" ? y0 + d / 2 : y1 + 0.03 * m;
      return g(
        item.symbol === "mirror-round" ? <path key="r" d={`M ${x0} ${y1} A ${w / 2} ${0.06 * m} 0 0 0 ${x1} ${y1}`} {...line} /> : null,
        body(0),
        item.symbol === "mirror-cabinet" && w > 0.5 * m ? <line key="c" x1={0} y1={y0} x2={0} y2={y1} {...thin} /> : null,
        item.symbol === "mirror-lit" ? <line key="l" x1={x0} y1={y1 + 0.02 * m} x2={x1} y2={y1 + 0.02 * m} stroke="#f59e0b" strokeWidth={sw * 0.8} strokeOpacity={0.8} /> : null,
        ...at.map((x) => <line key={x} x1={x - tick} y1={mid + tick * 0.8} x2={x + tick} y2={mid - tick * 0.8} {...line} />),
      );
    }
    case "towel-rail":
      return g(body(0), ...[0.25, 0.5, 0.75].map((f) => <line key={f} x1={x0 + w * f} y1={y0} x2={x0 + w * f} y2={y1} {...thin} />));
    case "sofa": {
      const back = Math.min(0.22 * m, d * 0.3);
      const arm = Math.min(0.2 * m, w * 0.15);
      return g(
        body(),
        <line key="b" x1={x0} y1={y0 + back} x2={x1} y2={y0 + back} {...line} />,
        <line key="l" x1={x0 + arm} y1={y0 + back} x2={x0 + arm} y2={y1} {...line} />,
        <line key="r" x1={x1 - arm} y1={y0 + back} x2={x1 - arm} y2={y1} {...line} />,
      );
    }
    case "corner-sofa": {
      // L shape: a full-width run along the back and a return down the left side.
      const s = Math.min(0.95 * m, w * 0.45, d * 0.5);
      const back = Math.min(0.22 * m, s * 0.3);
      const arm = Math.min(0.2 * m, s * 0.25);
      const pts = [
        [x0, y0],
        [x1, y0],
        [x1, y0 + s],
        [x0 + s, y0 + s],
        [x0 + s, y1],
        [x0, y1],
      ];
      return g(
        <polygon key="o" points={pts.map((p) => p.join(",")).join(" ")} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw} strokeLinejoin="round" />,
        <polyline key="b" points={`${x1 - arm},${y0 + back} ${x0 + back},${y0 + back} ${x0 + back},${y1 - arm}`} {...line} />,
        <line key="ra" x1={x1 - arm} y1={y0 + back} x2={x1 - arm} y2={y0 + s} {...line} />,
        <line key="ba" x1={x0 + back} y1={y1 - arm} x2={x0 + s} y2={y1 - arm} {...line} />,
      );
    }
    case "table":
      return body(r * 0.5);
    case "chair":
      return g(body(), <line key="b" x1={x0} y1={y0 + d * 0.2} x2={x1} y2={y0 + d * 0.2} {...line} />);
    case "car":
      return g(
        <rect key="b" x={x0} y={y0} width={w} height={d} rx={w * 0.2} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw} />,
        <rect key="c" x={x0 + w * 0.12} y={y0 + d * 0.22} width={w * 0.76} height={d * 0.5} rx={w * 0.1} {...line} />,
      );
    case "washer":
      return g(body(), <circle key="d" cx={0} cy={0} r={Math.min(w, d) * 0.3} {...line} />, front(0.04 * m));
    case "appliance":
      return g(body(), <rect key="p" x={x0 + w * 0.15} y={y1 - 0.12 * m} width={w * 0.7} height={0.06 * m} {...thin} />, front(0.03 * m));
    case "cabinet":
      return g(body(r * 0.3), front(0.03 * m), ...dividers(0.6, y1 - 0.03 * m, y1));
    case "worktop":
      return g(body(r * 0.3), front(0.03 * m), ...dividers(0.6, y0, y1));
    case "wall-cabinet":
      return g(body(0), <line key="x" x1={x0} y1={y0} x2={x1} y2={y1} {...thin} strokeDasharray={dash} />, ...dividers(0.6, y0, y1, { ...thin }));
    case "sink": {
      const bw = Math.min(w * 0.5, 0.5 * m);
      return g(
        body(r * 0.3),
        <rect key="b" x={x0 + 0.06 * m} y={y0 + 0.1 * m} width={bw} height={d - 0.18 * m} rx={0.05 * m} {...line} />,
        <circle key="w" cx={x0 + 0.06 * m + bw / 2} cy={0} r={0.025 * m} {...thin} />,
        ...[0.25, 0.4, 0.55].map((f) => (
          <line key={f} x1={x0 + 0.12 * m + bw} y1={y0 + d * f} x2={x1 - 0.06 * m} y2={y0 + d * f} {...thin} />
        )),
        <circle key="t" cx={x0 + 0.06 * m + bw / 2} cy={y0 + 0.05 * m} r={0.02 * m} {...line} />,
      );
    }
    case "hob":
      return g(
        body(r * 0.5),
        ...[
          [-0.3, -0.25, 0.08],
          [0.3, -0.25, 0.06],
          [-0.3, 0.25, 0.06],
          [0.3, 0.25, 0.09],
        ].map(([fx, fy, rr], i) => <circle key={i} cx={fx * w} cy={fy * d} r={rr * m} stroke={burnerInk} strokeWidth={sw * 0.6} fill="none" />),
      );
    case "range":
      return g(
        body(r * 0.3),
        ...burners(w / m).map(([fx, fy], i) => <circle key={i} cx={fx * w} cy={fy * d} r={0.07 * m} stroke={burnerInk} strokeWidth={sw * 0.6} fill="none" />),
        front(0.03 * m),
      );
    case "oven":
      return g(
        body(0),
        <line key="a" x1={x0} y1={y0} x2={x1} y2={y1} {...thin} />,
        <line key="b" x1={x1} y1={y0} x2={x0} y2={y1} {...thin} />,
        <rect key="o" x={x0 + w * 0.2} y={y1 - d * 0.25} width={w * 0.6} height={d * 0.15} {...line} />,
      );
    case "tall":
      return g(body(0), <line key="a" x1={x0} y1={y0} x2={x1} y2={y1} {...thin} />, <line key="b" x1={x1} y1={y0} x2={x0} y2={y1} {...thin} />);
    case "island": {
      // Units on the front side; the back is a breakfast-bar overhang with stools.
      const over = Math.min(0.3 * m, d * 0.35);
      return g(
        body(r * 0.3),
        <line key="o" x1={x0} y1={y0 + over} x2={x1} y2={y0 + over} {...thin} strokeDasharray={`${stroke * 4} ${stroke * 3}`} />,
        ...dividers(0.6, y1 - 0.03 * m, y1),
        front(0.03 * m),
      );
    }
    case "shelves":
      return g(body(0), front(0.02 * m), ...dividers(0.4, y0, y1));
    case "dresser":
      return g(
        body(r * 0.3),
        <rect key="m" x={x0 + w * 0.2} y={y0} width={w * 0.6} height={0.04 * m} fill={outline} fillOpacity={0.5} stroke="none" />,
        <line key="k" x1={x0 + w * 0.3} y1={y0} x2={x0 + w * 0.3} y2={y1} {...thin} />,
      );
    case "fitted-wardrobe":
    case "shaker-wardrobe":
      // Door joints across a thin front strip, and the hanging rail dashed along the middle.
      return g(
        body(0),
        front(0.03 * m),
        ...dividers(w / (wardrobeDoorCount(item.symbol, w / m) * m), y1 - 0.03 * m, y1),
        <line key="r" x1={x0 + 0.04 * m} y1={y0 + d * 0.4} x2={x1 - 0.04 * m} y2={y0 + d * 0.4} {...thin} strokeDasharray={`${stroke * 5} ${stroke * 3}`} />,
      );
    case "radiator": {
      // A thin strip against the wall, hatched across, with a line along each panel's face and a valve
      // at each end, as radiators are drawn on heating plans.
      const pitch = 0.08 * m;
      const n = Math.max(2, Math.round(w / pitch));
      const faces = radiatorPanels(d / m) === 2 ? [y0 + d * 0.45, y1] : [y1];
      return g(
        body(0),
        ...Array.from({ length: n }, (_, i) => {
          const x = x0 + (i * w) / n;
          return <line key={i} x1={x} y1={y1} x2={x + w / n} y2={y0} {...thin} />;
        }),
        ...faces.map((y) => <line key={`f${y}`} x1={x0} y1={y} x2={x1} y2={y} {...line} />),
        ...[x0, x1].map((x) => <circle key={`v${x}`} cx={x} cy={y1 - d * 0.3} r={Math.min(0.025 * m, d * 0.45)} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw * 0.6} />),
      );
    }
    case "column-radiator": {
      // A row of round columns between the headers.
      const n = Math.max(3, Math.round(w / (0.065 * m)));
      const rr = Math.min((w / n) * 0.35, d * 0.3);
      return g(
        body(0),
        ...Array.from({ length: n }, (_, i) => <circle key={i} cx={x0 + ((i + 0.5) * w) / n} cy={0} r={rr} {...thin} />),
      );
    }
    case "boiler":
      return g(body(r * 0.5), <circle key="f" cx={0} cy={y0 + d * 0.3} r={Math.min(w, d) * 0.15} {...line} />);
    case "hood": {
      // Canopy (dashed, overhead) with its grille, and the line of the cabinet front above it.
      const cab = Math.min(d, 0.33 * m);
      return g(
        body(0),
        <rect key="g" x={x0 + 0.04 * m} y={y0 + d * 0.2} width={w - 0.08 * m} height={d * 0.6} {...thin} strokeDasharray={dash} />,
        <line key="c" x1={x0} y1={y0 + cab} x2={x1} y2={y0 + cab} {...thin} strokeDasharray={dash} />,
      );
    }
    case "fireplace": {
      // Marble hearth across the footprint, the surround against the wall and the fire set into it.
      const surW = w * 0.9;
      const sd = Math.min(0.14 * m, d * 0.4);
      const fw = Math.min(0.5 * m, surW * 0.45);
      return g(
        <rect key="h" x={x0} y={y0} width={w} height={d} fill={ghost || clash ? fill : "#ece6da"} fillOpacity={fo} stroke={outline} strokeWidth={sw} />,
        <rect key="s" x={-surW / 2} y={y0} width={surW} height={sd} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw} />,
        <rect key="f" x={-fw / 2} y={y0 + 0.02 * m} width={fw} height={0.1 * m} fill={ghost || clash ? fill : "#c8a24a"} fillOpacity={fo} stroke={outline} strokeWidth={sw * 0.6} />,
      );
    }
    default:
      return body();
  }
});

/** Whether a #rrggbb colour is dark enough to need light detail drawn on it. */
function isDark(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 110;
}
