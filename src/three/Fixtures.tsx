import type { Floor } from "../types";
import { toWorld } from "../lib/geometry";
import { byId, type CatalogueItem } from "../lib/catalogue";

/** Simple primitive-built furniture and fixtures, placed from the plan. */
export function Fixtures({ floor }: { floor: Floor }) {
  return (
    <group>
      {(floor.fixtures ?? []).map((f) => {
        const item = byId(f.type);
        if (!item) return null;
        const p = toWorld(floor, { x: f.x, y: f.y });
        return (
          <group key={f.id} position={[p.x, 0, p.y]} rotation={[0, (-f.rot * Math.PI) / 180, 0]}>
            <FixtureMesh item={item} />
          </group>
        );
      })}
    </group>
  );
}

const white = "#f5f5f5";
const chrome = "#b8bcc2";

function FixtureMesh({ item }: { item: CatalogueItem }) {
  const { w, d, h, color } = item;
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, key: string, opacity?: number) => (
    <mesh key={key} position={[x, y, z]} castShadow>
      <boxGeometry args={[sx, sy, sz]} />
      {opacity !== undefined ? <meshPhysicalMaterial color={c} transparent opacity={opacity} roughness={0.1} /> : <meshStandardMaterial color={c} roughness={0.8} />}
    </mesh>
  );
  switch (item.symbol) {
    case "bed":
      return (
        <group>
          {box(0, 0.15, 0, w, 0.3, d, "#8a6d4b", "base")}
          {box(0, 0.4, d * 0.06, w - 0.06, 0.2, d - 0.12, color, "mattress")}
          {box(0, 0.4, -d / 2 + 0.1, w - 0.1, 0.12, 0.16, "#ffffff", "pillow")} {/* pillow strip at the head */}
          {box(0, 0.4, -d / 2 + 0.6, w - 0.06, 0.06, 0.06, "#ffffff", "sheet")} {/* sheet edge */}
          {box(0, h / 2 + 0.3, -d / 2 + 0.03, w, h + 0.3, 0.06, "#8a6d4b", "headboard")}
        </group>
      );
    case "toilet":
      return (
        <group>
          {box(0, 0.42, -d / 2 + 0.1, w, 0.84, 0.2, white, "cistern")}
          {box(0, 0.2, d * 0.12, w * 0.85, 0.4, d * 0.62, white, "bowl")}
        </group>
      );
    case "basin":
      return (
        <group>
          {box(0, 0.4, 0, w * 0.35, 0.8, d * 0.35, white, "pedestal")}
          {box(0, 0.8, 0, w, 0.12, d, white, "basin")}
          {box(0, 0.95, -d / 2 + 0.05, 0.03, 0.18, 0.03, chrome, "tap")}
        </group>
      );
    case "shower":
      return (
        <group>
          {box(0, 0.04, 0, w, 0.08, d, white, "tray")}
          {box(w / 2 - 0.01, 1.05, 0, 0.02, 1.95, d, "#bfe0ee", "side", 0.35)}
          {box(0, 1.05, d / 2 - 0.01, w, 1.95, 0.02, "#bfe0ee", "front", 0.35)}
          {box(0, 1.9, -d / 2 + 0.05, 0.04, 0.4, 0.04, chrome, "riser")}
        </group>
      );
    case "bath":
      return (
        <group>
          {box(0, h / 2, 0, w, h, d, white, "panel")}
          {box(0, h - 0.05, 0, w - 0.16, 0.12, d - 0.16, "#dbe9f0", "water")}
          {box(w / 2 - 0.12, h + 0.08, 0, 0.03, 0.16, 0.03, chrome, "tap")}
        </group>
      );
    case "sofa":
      return (
        <group>
          {box(0, 0.22, 0, w, 0.44, d, color, "seat")}
          {box(0, 0.6, -d / 2 + 0.12, w, 0.5, 0.24, color, "back")}
          {box(-w / 2 + 0.1, 0.5, 0, 0.2, 0.25, d - 0.2, color, "arm-l")}
          {box(w / 2 - 0.1, 0.5, 0, 0.2, 0.25, d - 0.2, color, "arm-r")}
        </group>
      );
    case "table":
      return (
        <group>
          {box(0, h - 0.02, 0, w, 0.04, d, color, "top")}
          {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.05), 0.06, h - 0.04, 0.06, color, `leg${sx}${sz}`)))}
        </group>
      );
    case "chair":
      return (
        <group>
          {box(0, 0.45, 0, w, 0.04, d, color, "seat")}
          {box(0, 0.68, -d / 2 + 0.02, w, 0.45, 0.04, color, "back")}
          {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(sx * (w / 2 - 0.03), 0.22, sz * (d / 2 - 0.03), 0.04, 0.44, 0.04, color, `leg${sx}${sz}`)))}
        </group>
      );
    case "car":
      return (
        <group>
          {box(0, 0.45, 0, w, 0.6, d, color, "body")}
          {box(0, 1.05, d * 0.05, w - 0.2, 0.6, d * 0.5, "#3b4652", "cabin")}
          {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(sx * (w / 2 - 0.05), 0.3, sz * (d * 0.32), 0.2, 0.6, 0.6, "#222", `wheel${sx}${sz}`)))}
        </group>
      );
    case "appliance":
      return box(0, h / 2, 0, w, h, d, color, "unit");
    default:
      return box(0, h / 2, 0, w, h, d, color, "box");
  }
}
