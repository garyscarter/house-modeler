import { useMemo, useRef, useState } from "react";
import type { Floor, Opening, Pt, Room, VariantKey } from "../types";
import { uid } from "../types";
import { useStore } from "../store";
import { bbox, pointInPolygon } from "../lib/geometry";
import { roomColor } from "../three/House";

type Tool = "select" | "door" | "window" | "calibrate" | "room";

/**
 * 2D check-and-fix view: the extracted geometry drawn over the source image.
 * Drag vertices, rename rooms, add openings, calibrate the scale.
 */
export function PlanEditor({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  const updateFloor = useStore((s) => s.updateFloor);
  const updateRoom = useStore((s) => s.updateRoom);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  const setUi = useStore((s) => s.setUi);
  const [tool, setTool] = useState<Tool>("select");
  const [calib, setCalib] = useState<Pt[]>([]);
  const [newRoom, setNewRoom] = useState<Pt[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ roomId: string; idx: number } | { openingId: string } | null>(null);

  const view = useMemo(() => {
    const all = floor.rooms.flatMap((r) => r.polygon);
    if (!all.length) return { x: 0, y: 0, w: floor.imageW, h: floor.imageH };
    const b = bbox(all);
    const pad = Math.max(b.w, b.h) * 0.08;
    return { x: b.x0 - pad, y: b.y0 - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  }, [floor]);

  const toImage = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const stroke = view.w / 400;
  const handleR = view.w / 120;

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = toImage(e);
    if ("roomId" in drag.current) {
      const { roomId, idx } = drag.current;
      updateFloor(variant, floor.id, (f) => ({
        ...f,
        rooms: f.rooms.map((r) =>
          r.id === roomId ? { ...r, polygon: r.polygon.map((v, i) => (i === idx ? p : v)) } : r,
        ),
      }));
    } else {
      const { openingId } = drag.current;
      updateFloor(variant, floor.id, (f) => ({
        ...f,
        openings: f.openings.map((o) => (o.id === openingId ? { ...o, x: p.x, y: p.y } : o)),
      }));
    }
  };

  const onClickCanvas = (e: React.MouseEvent) => {
    const p = toImage(e);
    if (tool === "door" || tool === "window") {
      // Guess orientation from the nearest room edge.
      const orientation = nearestEdgeOrientation(floor.rooms, p);
      const op: Opening = {
        id: uid(),
        kind: tool,
        x: p.x,
        y: p.y,
        orientation,
        widthM: tool === "door" ? 0.85 : 1.2,
      };
      updateFloor(variant, floor.id, (f) => ({ ...f, openings: [...f.openings, op] }));
    } else if (tool === "calibrate") {
      const next = [...calib, p];
      if (next.length === 2) {
        const px = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
        const m = parseFloat(window.prompt("Real-world distance between those two points, in metres:", "3.0") ?? "");
        if (m > 0) updateFloor(variant, floor.id, { pxPerM: px / m });
        setCalib([]);
      } else setCalib(next);
    } else if (tool === "room") {
      setNewRoom([...newRoom, p]);
    } else {
      const hit = [...floor.rooms].reverse().find((r) => pointInPolygon(p, r.polygon));
      setUi({ selectedRoomId: hit?.id ?? null });
    }
  };

  const finishRoom = () => {
    if (newRoom.length >= 3) {
      const name = window.prompt("Room name:", "New room") ?? "New room";
      const room: Room = { id: uid(), name, polygon: newRoom };
      updateFloor(variant, floor.id, (f) => ({ ...f, rooms: [...f.rooms, room] }));
    }
    setNewRoom([]);
    setTool("select");
  };

  const selected = floor.rooms.find((r) => r.id === selectedRoomId);

  return (
    <div className="plan-editor">
      <div className="toolbar">
        {(
          [
            ["select", "Select / drag"],
            ["door", "Add door"],
            ["window", "Add window"],
            ["room", "Draw room"],
            ["calibrate", "Calibrate scale"],
          ] as [Tool, string][]
        ).map(([t, label]) => (
          <button key={t} className={tool === t ? "active" : ""} onClick={() => { setTool(t); setCalib([]); setNewRoom([]); }}>
            {label}
          </button>
        ))}
        {tool === "room" && newRoom.length >= 3 && <button onClick={finishRoom}>Finish room</button>}
        <span className="hint">
          {tool === "select" && "Click a room to select it. Drag corners or openings to fix positions."}
          {tool === "door" && "Click on a wall to place a door."}
          {tool === "window" && "Click on a wall to place a window."}
          {tool === "room" && "Click corners in order, then Finish room."}
          {tool === "calibrate" && `Click two points a known distance apart (${calib.length}/2).`}
        </span>
        <span className="hint right">Scale: {floor.pxPerM.toFixed(1)} px/m</span>
      </div>

      <div className="editor-body">
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
          onClick={onClickCanvas}
        >
          <image href={floor.image} x={0} y={0} width={floor.imageW} height={floor.imageH} opacity={0.9} />
          {floor.rooms.map((r) => (
            <g key={r.id}>
              <polygon
                points={r.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={roomColor(r)}
                fillOpacity={r.id === selectedRoomId ? 0.75 : 0.45}
                stroke={r.id === selectedRoomId ? "#d97706" : "#1f2937"}
                strokeWidth={stroke * (r.id === selectedRoomId ? 2.5 : 1.5)}
              />
              <text
                x={r.polygon.reduce((s, p) => s + p.x, 0) / r.polygon.length}
                y={r.polygon.reduce((s, p) => s + p.y, 0) / r.polygon.length}
                fontSize={view.w / 45}
                textAnchor="middle"
                fill="#111"
                style={{ pointerEvents: "none", fontWeight: 600 }}
              >
                {r.name}
              </text>
              {tool === "select" &&
                r.polygon.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={handleR}
                    fill="#fff"
                    stroke="#2563eb"
                    strokeWidth={stroke * 1.5}
                    style={{ cursor: "move" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      drag.current = { roomId: r.id, idx: i };
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ))}
            </g>
          ))}
          {floor.openings.map((o) => (
            <g key={o.id}>
              <rect
                x={o.x - (o.orientation === "h" ? (o.widthM * floor.pxPerM) / 2 : stroke * 4)}
                y={o.y - (o.orientation === "v" ? (o.widthM * floor.pxPerM) / 2 : stroke * 4)}
                width={o.orientation === "h" ? o.widthM * floor.pxPerM : stroke * 8}
                height={o.orientation === "v" ? o.widthM * floor.pxPerM : stroke * 8}
                fill={o.kind === "door" ? "#f59e0b" : "#3b82f6"}
                stroke="#fff"
                strokeWidth={stroke}
                style={{ cursor: "move" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (tool === "select") drag.current = { openingId: o.id };
                }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.filter((x) => x.id !== o.id) }));
                }}
              >
                <title>{o.kind} ({o.widthM} m). Drag to move, double-click to delete.</title>
              </rect>
            </g>
          ))}
          {floor.stairs && (
            <text x={floor.stairs.x} y={floor.stairs.y} fontSize={view.w / 50} textAnchor="middle" fill="#7c3aed" style={{ pointerEvents: "none" }}>
              stairs
            </text>
          )}
          {calib.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={handleR} fill="#ef4444" />
          ))}
          {newRoom.length > 0 && (
            <polyline points={newRoom.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#16a34a" strokeWidth={stroke * 2} />
          )}
        </svg>

        <div className="side">
          {selected ? (
            <RoomInspector variant={variant} floor={floor} room={selected} onChange={(p) => updateRoom(variant, floor.id, selected.id, p)} />
          ) : (
            <p className="muted">Select a room to rename it, set its printed size, or delete it.</p>
          )}
          <hr />
          <FloorInspector variant={variant} floor={floor} />
        </div>
      </div>
    </div>
  );
}

function nearestEdgeOrientation(rooms: Room[], p: Pt): "h" | "v" {
  let best = Infinity;
  let orient: "h" | "v" = "h";
  for (const r of rooms) {
    for (let i = 0; i < r.polygon.length; i++) {
      const a = r.polygon[i];
      const b = r.polygon[(i + 1) % r.polygon.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
      if (d < best) {
        best = d;
        orient = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
      }
    }
  }
  return orient;
}

function RoomInspector({
  variant,
  floor,
  room,
  onChange,
}: {
  variant: VariantKey;
  floor: Floor;
  room: Room;
  onChange: (p: Partial<Room>) => void;
}) {
  const updateFloor = useStore((s) => s.updateFloor);
  const photos = useStore((s) => s.photos);
  const setUi = useStore((s) => s.setUi);
  const roomPhotos = photos.filter((p) => p.floorName === floor.name && p.roomName === room.name);
  return (
    <div className="inspector">
      <label>
        Name
        <input value={room.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <label>
        Printed size (m)
        <span className="row">
          <input
            type="number"
            step="0.01"
            value={room.dims?.w ?? ""}
            placeholder="w"
            onChange={(e) => onChange({ dims: { w: parseFloat(e.target.value) || 0, h: room.dims?.h ?? 0 } })}
          />
          ×
          <input
            type="number"
            step="0.01"
            value={room.dims?.h ?? ""}
            placeholder="d"
            onChange={(e) => onChange({ dims: { w: room.dims?.w ?? 0, h: parseFloat(e.target.value) || 0 } })}
          />
        </span>
      </label>
      <label>
        Floor texture from photo
        <select value={room.floorPhotoId ?? ""} onChange={(e) => onChange({ floorPhotoId: e.target.value || undefined })}>
          <option value="">None (flat colour)</option>
          {photos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Colour
        <input type="color" value={room.color ?? roomColor(room)} onChange={(e) => onChange({ color: e.target.value })} />
      </label>
      {roomPhotos.length > 0 && (
        <div className="thumbs">
          {roomPhotos.map((p) => (
            <img key={p.id} src={p.dataUrl} title={p.description} onClick={() => setUi({ selectedPhotoId: p.id })} />
          ))}
        </div>
      )}
      <button
        className="danger"
        onClick={() => {
          if (!window.confirm(`Delete ${room.name}?`)) return;
          updateFloor(variant, floor.id, (f) => ({ ...f, rooms: f.rooms.filter((r) => r.id !== room.id) }));
          setUi({ selectedRoomId: null });
        }}
      >
        Delete room
      </button>
    </div>
  );
}

function FloorInspector({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  const updateFloor = useStore((s) => s.updateFloor);
  return (
    <div className="inspector">
      <label>
        Floor name
        <input value={floor.name} onChange={(e) => updateFloor(variant, floor.id, { name: e.target.value })} />
      </label>
      <label>
        Level (0 = ground)
        <input type="number" value={floor.level} onChange={(e) => updateFloor(variant, floor.id, { level: parseInt(e.target.value) || 0 })} />
      </label>
      <label>
        Stacking offset (m)
        <span className="row">
          <input type="number" step="0.1" value={floor.offset.x} onChange={(e) => updateFloor(variant, floor.id, { offset: { ...floor.offset, x: parseFloat(e.target.value) || 0 } })} />
          <input type="number" step="0.1" value={floor.offset.y} onChange={(e) => updateFloor(variant, floor.id, { offset: { ...floor.offset, y: parseFloat(e.target.value) || 0 } })} />
        </span>
      </label>
      <label>
        Scale (px per metre)
        <input type="number" step="0.1" value={floor.pxPerM.toFixed(1)} onChange={(e) => updateFloor(variant, floor.id, { pxPerM: parseFloat(e.target.value) || floor.pxPerM })} />
      </label>
    </div>
  );
}
