import type { CatalogueItem } from "../lib/catalogue";

/**
 * Plan symbol for a catalogue item, drawn in a local frame centred on (0,0)
 * with the item's footprint in px (w × d). Rotation is applied by the caller.
 */
export function FixtureSymbol({ item, w, d, stroke, selected, ghost }: { item: CatalogueItem; w: number; d: number; stroke: number; selected?: boolean; ghost?: boolean }) {
  const outline = selected ? "#d97706" : ghost ? "#16a34a" : "#374151";
  const sw = stroke * (selected ? 2 : 1.2);
  const fill = ghost ? "#16a34a" : item.color;
  const fo = ghost ? 0.25 : 0.85;
  const r = Math.min(w, d) * 0.08;
  const common = { stroke: outline, strokeWidth: sw, fill: "none" as const };
  const body = <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={r} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw} />;

  switch (item.symbol) {
    case "bed": {
      const pillowD = d * 0.18;
      return (
        <g>
          {body}
          <rect x={-w / 2 + w * 0.06} y={-d / 2 + d * 0.04} width={w * 0.88} height={pillowD} rx={r} {...common} />
          {w > 1.1 && <line x1={0} y1={-d / 2 + d * 0.04} x2={0} y2={-d / 2 + d * 0.04 + pillowD} {...common} />}
          <line x1={-w / 2} y1={-d / 2 + d * 0.28} x2={w / 2} y2={-d / 2 + d * 0.28} {...common} />
        </g>
      );
    }
    case "toilet":
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d * 0.28} rx={r} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw} />
          <ellipse cx={0} cy={d * 0.18} rx={w * 0.42} ry={d * 0.32} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw} />
        </g>
      );
    case "basin":
      return (
        <g>
          {body}
          <ellipse cx={0} cy={0} rx={w * 0.34} ry={d * 0.3} {...common} />
        </g>
      );
    case "shower":
      return (
        <g>
          {body}
          <line x1={-w / 2} y1={-d / 2} x2={w / 2} y2={d / 2} {...common} />
          <line x1={w / 2} y1={-d / 2} x2={-w / 2} y2={d / 2} {...common} />
          <circle cx={0} cy={0} r={Math.min(w, d) * 0.08} {...common} />
        </g>
      );
    case "bath":
      return (
        <g>
          {body}
          <rect x={-w / 2 + w * 0.07} y={-d / 2 + d * 0.14} width={w * 0.86} height={d * 0.72} rx={d * 0.3} {...common} />
          <circle cx={w / 2 - w * 0.14} cy={0} r={d * 0.06} {...common} />
        </g>
      );
    case "sofa":
      return (
        <g>
          {body}
          <line x1={-w / 2} y1={-d / 2 + d * 0.3} x2={w / 2} y2={-d / 2 + d * 0.3} {...common} />
          <line x1={-w / 2 + w * 0.12} y1={-d / 2 + d * 0.3} x2={-w / 2 + w * 0.12} y2={d / 2} {...common} />
          <line x1={w / 2 - w * 0.12} y1={-d / 2 + d * 0.3} x2={w / 2 - w * 0.12} y2={d / 2} {...common} />
        </g>
      );
    case "table":
      return body;
    case "chair":
      return (
        <g>
          {body}
          <line x1={-w / 2} y1={-d / 2 + d * 0.2} x2={w / 2} y2={-d / 2 + d * 0.2} {...common} />
        </g>
      );
    case "car":
      return (
        <g>
          <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={w * 0.2} fill={fill} fillOpacity={fo} stroke={outline} strokeWidth={sw} />
          <rect x={-w / 2 + w * 0.12} y={-d / 2 + d * 0.22} width={w * 0.76} height={d * 0.5} rx={w * 0.1} {...common} />
        </g>
      );
    case "appliance":
      return (
        <g>
          {body}
          <circle cx={0} cy={0} r={Math.min(w, d) * 0.22} {...common} />
        </g>
      );
    default:
      return body;
  }
}
