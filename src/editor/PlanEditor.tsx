import { useEffect, useMemo, useRef, useState } from "react";
import type { Floor, Opening, Pt, Room, VariantKey, Wall } from "../types";
import { uid } from "../types";
import { useStore } from "../store";
import { bbox, estimatePxPerM, pointInPolygon } from "../lib/geometry";
import { STAIRS_DIR_LABEL, type StairsDir } from "../types";
import { roomColor } from "../three/House";

type Tool = "select" | "rect" | "room" | "door" | "window" | "gap" | "wall" | "calibrate";

/**
 * 2D check-and-fix view: the geometry drawn over the source image. Used both
 * to correct an AI extraction and to trace a plan entirely by hand.
 */
export function PlanEditor({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  const updateFloor = useStore((s) => s.updateFloor);
  const updateRoom = useStore((s) => s.updateRoom);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  const setUi = useStore((s) => s.setUi);
  const [tool, setTool] = useState<Tool>(floor.rooms.length ? "select" : "rect");
  const [calib, setCalib] = useState<Pt[]>([]);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  // Fit the view to the rooms (useful on multi-floor images) or the whole image (tracing).
  const [fit, setFit] = useState<"rooms" | "image">(floor.rooms.length ? "rooms" : "image");
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ roomId: string; idx: number } | { openingId: string } | { stairs: true } | { wallId: string; end: "a" | "b" } | null>(null);

  const view = useMemo(() => {
    const all = floor.rooms.flatMap((r) => r.polygon);
    if (fit === "image" || all.length < 3) return { x: 0, y: 0, w: floor.imageW, h: floor.imageH };
    const b = bbox(all);
    const pad = Math.max(b.w, b.h) * 0.08;
    return { x: b.x0 - pad, y: b.y0 - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  }, [floor, fit]);

  const stroke = view.w / 400;
  const handleR = view.w / 120;
  const snapTol = view.w / 60;

  const toImage = (e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  /** Snap to existing corners, then to their x / y lines, so walls line up. */
  const snap = (p: Pt, exclude?: { roomId: string; idx: number }): Pt => {
    let best: Pt | null = null;
    let bestD = snapTol;
    let sx: number | null = null;
    let sy: number | null = null;
    const walls = floor.walls ?? [];
    const candidates = [
      ...floor.rooms.flatMap((r) => r.polygon.map((v, i) => ({ v, id: r.id, i }))),
      ...walls.flatMap((w) => [
        { v: w.a, id: w.id, i: -1 },
        { v: w.b, id: w.id, i: -2 },
      ]),
    ];
    {
      candidates.forEach(({ v, id, i }) => {
        if (exclude && exclude.roomId === id && exclude.idx === i) return;
        const d = Math.hypot(v.x - p.x, v.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = v;
        }
        if (Math.abs(v.x - p.x) < snapTol) sx = v.x;
        if (Math.abs(v.y - p.y) < snapTol) sy = v.y;
      });
    }
    if (best) return best;
    return { x: sx ?? p.x, y: sy ?? p.y };
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft([]);
        setCalib([]);
        setSelectedOpeningId(null);
        setSelectedWallId(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !(e.target instanceof HTMLInputElement)) {
        if (selectedOpeningId) {
          updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.filter((o) => o.id !== selectedOpeningId) }));
          setSelectedOpeningId(null);
        } else if (selectedWallId) {
          updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).filter((w) => w.id !== selectedWallId) }));
          setSelectedWallId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedOpeningId, selectedWallId, updateFloor, variant, floor.id]);

  const onPointerMove = (e: React.PointerEvent) => {
    const raw = toImage(e);
    if (!drag.current) {
      setHover(tool === "rect" || tool === "room" || tool === "wall" ? snap(raw) : raw);
      return;
    }
    if ("wallId" in drag.current) {
      const { wallId, end } = drag.current;
      const p = snap(raw, { roomId: wallId, idx: end === "a" ? -1 : -2 });
      updateFloor(variant, floor.id, (f) => ({
        ...f,
        walls: (f.walls ?? []).map((w) => (w.id === wallId ? { ...w, [end]: p } : w)),
      }));
      return;
    }
    if ("roomId" in drag.current) {
      const { roomId, idx } = drag.current;
      const p = snap(raw, { roomId, idx });
      updateFloor(variant, floor.id, (f) => ({
        ...f,
        rooms: f.rooms.map((r) => (r.id === roomId ? { ...r, polygon: r.polygon.map((v, i) => (i === idx ? p : v)) } : r)),
      }));
    } else if ("stairs" in drag.current) {
      updateFloor(variant, floor.id, { stairs: raw });
    } else {
      const { openingId } = drag.current;
      updateFloor(variant, floor.id, (f) => ({
        ...f,
        openings: f.openings.map((o) => (o.id === openingId ? { ...o, x: raw.x, y: raw.y } : o)),
      }));
    }
  };

  const addRoom = (polygon: Pt[]) => {
    const name = window.prompt("Room name:", `Room ${floor.rooms.length + 1}`);
    if (name === null) return;
    const room: Room = { id: uid(), name: name || `Room ${floor.rooms.length + 1}`, polygon };
    updateFloor(variant, floor.id, (f) => ({ ...f, rooms: [...f.rooms, room] }));
    setUi({ selectedRoomId: room.id });
  };

  const onClickCanvas = (e: React.MouseEvent) => {
    const raw = toImage(e);
    if (tool === "door" || tool === "window" || tool === "gap") {
      const orientation = nearestEdgeOrientation(floor, raw);
      const op: Opening = { id: uid(), kind: tool, x: raw.x, y: raw.y, orientation, widthM: tool === "door" ? 0.85 : tool === "gap" ? 1.5 : 1.2 };
      updateFloor(variant, floor.id, (f) => ({ ...f, openings: [...f.openings, op] }));
      setSelectedOpeningId(op.id);
      setSelectedWallId(null);
      setUi({ selectedRoomId: null });
    } else if (tool === "wall") {
      const p = snap(raw);
      if (draft.length === 0) setDraft([p]);
      else {
        const a = draft[0];
        setDraft([]);
        if (Math.hypot(a.x - p.x, a.y - p.y) < snapTol) return;
        const wall: Wall = { id: uid(), a, b: p };
        updateFloor(variant, floor.id, (f) => ({ ...f, walls: [...(f.walls ?? []), wall] }));
        setSelectedWallId(wall.id);
        setSelectedOpeningId(null);
        setUi({ selectedRoomId: null });
      }
    } else if (tool === "calibrate") {
      const next = [...calib, raw];
      if (next.length === 2) {
        const px = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
        const m = parseFloat(window.prompt("Real-world distance between those two points, in metres:", "3.0") ?? "");
        if (m > 0) updateFloor(variant, floor.id, { pxPerM: px / m });
        setCalib([]);
      } else setCalib(next);
    } else if (tool === "rect") {
      const p = snap(raw);
      if (draft.length === 0) setDraft([p]);
      else {
        const a = draft[0];
        setDraft([]);
        if (Math.abs(a.x - p.x) < snapTol || Math.abs(a.y - p.y) < snapTol) return;
        addRoom([
          { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y) },
          { x: Math.max(a.x, p.x), y: Math.min(a.y, p.y) },
          { x: Math.max(a.x, p.x), y: Math.max(a.y, p.y) },
          { x: Math.min(a.x, p.x), y: Math.max(a.y, p.y) },
        ]);
      }
    } else if (tool === "room") {
      const p = snap(raw);
      // Clicking the first point again closes the polygon.
      if (draft.length >= 3 && Math.hypot(p.x - draft[0].x, p.y - draft[0].y) < snapTol) {
        addRoom(draft);
        setDraft([]);
      } else setDraft([...draft, p]);
    } else {
      const hit = [...floor.rooms].reverse().find((r) => pointInPolygon(raw, r.polygon));
      setUi({ selectedRoomId: hit?.id ?? null });
      setSelectedOpeningId(null);
      setSelectedWallId(null);
    }
  };

  const finishRoom = () => {
    if (draft.length >= 3) addRoom(draft);
    setDraft([]);
  };

  const selected = floor.rooms.find((r) => r.id === selectedRoomId);
  const selectedOpening = floor.openings.find((o) => o.id === selectedOpeningId);
  const selectedWall = (floor.walls ?? []).find((w) => w.id === selectedWallId);
  // Draw the selected room last so its outline and drag handles sit above its neighbours.
  const orderedRooms = [...floor.rooms.filter((r) => r.id !== selectedRoomId), ...(selected ? [selected] : [])];
  const pick = (t: Tool) => {
    setTool(t);
    setCalib([]);
    setDraft([]);
  };

  return (
    <div className="plan-editor">
      <div className="toolbar">
        {(
          [
            ["select", "Select / drag"],
            ["rect", "Rectangle room"],
            ["room", "Polygon room"],
            ["door", "Add door"],
            ["window", "Add window"],
            ["gap", "Add gap"],
            ["wall", "Draw wall"],
            ["calibrate", "Calibrate scale"],
          ] as [Tool, string][]
        ).map(([t, label]) => (
          <button key={t} className={tool === t ? "active" : ""} onClick={() => pick(t)}>
            {label}
          </button>
        ))}
        {tool === "room" && draft.length >= 3 && <button onClick={finishRoom}>Finish room</button>}
        <span className="hint">
          {tool === "select" && "Click a room or opening to select it. Drag corners, small midpoints add a corner, double-click a corner removes it."}
          {tool === "rect" && (draft.length ? "Click the opposite corner." : "Click one corner of the room, then the opposite corner. Corners snap to existing ones.")}
          {tool === "room" && "Click each corner in order, then click the first corner again (or Finish room). Esc cancels."}
          {tool === "door" && "Click on a wall to place a door."}
          {tool === "window" && "Click on a wall to place a window."}
          {tool === "gap" && "Click on a wall to knock a full-height opening through it."}
          {tool === "wall" && (draft.length ? "Click the other end of the wall." : "Click where the wall starts, then where it ends. Ends snap to corners.")}
          {tool === "calibrate" && `Click two points a known distance apart (${calib.length}/2).`}
        </span>
        <span className="hint right">Scale: {floor.pxPerM.toFixed(1)} px/m</span>
        <button onClick={() => setFit(fit === "rooms" ? "image" : "rooms")} title="Toggle between fitting the rooms and showing the whole image">
          {fit === "rooms" ? "Show whole image" : "Fit to rooms"}
        </button>
      </div>

      <div className="editor-body">
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => {
            drag.current = null;
            setHover(null);
          }}
          onClick={onClickCanvas}
          style={{ cursor: tool === "select" ? "default" : "crosshair" }}
        >
          <image href={floor.image} x={0} y={0} width={floor.imageW} height={floor.imageH} opacity={0.9} />
          {floor.rooms.length === 0 && tool === "select" && (
            <text x={view.x + view.w / 2} y={view.y + view.h * 0.08} fontSize={view.w / 30} textAnchor="middle" fill="#2563eb" fontWeight={600}>
              No rooms yet. Pick "Rectangle room" and click two opposite corners of each room.
            </text>
          )}
          {orderedRooms.map((r) => (
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
            </g>
          ))}
          {tool === "select" &&
            orderedRooms.map((r) => (
              <g key={"h" + r.id}>
                {r.polygon.map((p, i) => {
                  const q = r.polygon[(i + 1) % r.polygon.length];
                  const sel = r.id === selectedRoomId;
                  return (
                    <g key={i}>
                      <circle
                        cx={(p.x + q.x) / 2}
                        cy={(p.y + q.y) / 2}
                        r={handleR * 0.55}
                        fill="#fff"
                        stroke={sel ? "#d97706" : "#9ca3af"}
                        strokeWidth={stroke}
                        style={{ cursor: "copy" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
                          updateFloor(variant, floor.id, (f) => ({
                            ...f,
                            rooms: f.rooms.map((rr) =>
                              rr.id === r.id ? { ...rr, polygon: [...rr.polygon.slice(0, i + 1), mid, ...rr.polygon.slice(i + 1)] } : rr,
                            ),
                          }));
                        }}
                      >
                        <title>Click to add a corner here</title>
                      </circle>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={handleR * (sel ? 1.25 : 1)}
                        fill={sel ? "#fff7ed" : "#fff"}
                        stroke={sel ? "#d97706" : "#2563eb"}
                        strokeWidth={stroke * (sel ? 2.2 : 1.5)}
                        style={{ cursor: "move" }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setUi({ selectedRoomId: r.id });
                          drag.current = { roomId: r.id, idx: i };
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (r.polygon.length <= 3) return;
                          updateFloor(variant, floor.id, (f) => ({
                            ...f,
                            rooms: f.rooms.map((rr) => (rr.id === r.id ? { ...rr, polygon: rr.polygon.filter((_, j) => j !== i) } : rr)),
                          }));
                        }}
                      />
                    </g>
                  );
                })}
              </g>
            ))}
          {(floor.walls ?? []).map((w) => {
            const sel = w.id === selectedWallId;
            return (
              <g key={w.id}>
                <line
                  x1={w.a.x}
                  y1={w.a.y}
                  x2={w.b.x}
                  y2={w.b.y}
                  stroke={sel ? "#d97706" : w.color ?? "#1f2937"}
                  strokeWidth={stroke * (sel ? 5 : 3.5)}
                  strokeLinecap="round"
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWallId(w.id);
                    setSelectedOpeningId(null);
                    setUi({ selectedRoomId: null });
                  }}
                >
                  <title>Wall{w.height !== undefined ? ` (${w.height} m high)` : ""}. Click to edit, drag the ends to move.</title>
                </line>
                {tool === "select" &&
                  (["a", "b"] as const).map((end) => (
                    <circle
                      key={end}
                      cx={w[end].x}
                      cy={w[end].y}
                      r={handleR}
                      fill="#fff"
                      stroke={sel ? "#d97706" : "#6b7280"}
                      strokeWidth={stroke * 1.5}
                      style={{ cursor: "move" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedWallId(w.id);
                        setSelectedOpeningId(null);
                        setUi({ selectedRoomId: null });
                        drag.current = { wallId: w.id, end };
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ))}
              </g>
            );
          })}
          {tool === "wall" && draft.length === 1 && hover && (
            <line x1={draft[0].x} y1={draft[0].y} x2={hover.x} y2={hover.y} stroke="#16a34a" strokeWidth={stroke * 3} strokeLinecap="round" style={{ pointerEvents: "none" }} />
          )}
          {floor.openings.map((o) => {
            const len = o.widthM * floor.pxPerM;
            const thick = stroke * 8;
            const sel = o.id === selectedOpeningId;
            return (
              <rect
                key={o.id}
                x={o.x - (o.orientation === "h" ? len / 2 : thick / 2)}
                y={o.y - (o.orientation === "v" ? len / 2 : thick / 2)}
                width={o.orientation === "h" ? len : thick}
                height={o.orientation === "v" ? len : thick}
                fill={o.kind === "door" ? "#f59e0b" : o.kind === "garage" ? "#b45309" : o.kind === "bay" ? "#0ea5e9" : o.kind === "patio" ? "#0d9488" : o.kind === "gap" ? "#ffffff" : "#3b82f6"}
                fillOpacity={o.kind === "gap" ? 0.9 : 1}
                strokeDasharray={o.kind === "gap" ? `${stroke * 3} ${stroke * 2}` : undefined}
                stroke={sel ? "#111" : o.kind === "gap" ? "#6b7280" : "#fff"}
                strokeWidth={stroke * (sel ? 2 : 1)}
                style={{ cursor: "move" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (tool === "select") drag.current = { openingId: o.id };
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedOpeningId(o.id);
                  setUi({ selectedRoomId: null });
                }}
              >
                <title>
                  {o.kind} ({o.widthM} m). Drag to move, click to edit.
                </title>
              </rect>
            );
          })}
          {floor.stairs && (
            <g
              style={{ cursor: "move" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (tool === "select") drag.current = { stairs: true };
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const len = (floor.stairsLen ?? 2.6) * floor.pxPerM;
                const w = (floor.stairsWidth ?? 0.9) * floor.pxPerM;
                const d = floor.stairsDir ?? "up";
                const horiz = d === "left" || d === "right";
                const rw = horiz ? len : w;
                const rh = horiz ? w : len;
                const ax = d === "left" ? -1 : d === "right" ? 1 : 0;
                const ay = d === "up" ? -1 : d === "down" ? 1 : 0;
                const tip = { x: floor.stairs!.x + (ax * len) / 2, y: floor.stairs!.y + (ay * len) / 2 };
                const tail = { x: floor.stairs!.x - (ax * len) / 2, y: floor.stairs!.y - (ay * len) / 2 };
                return (
                  <>
                    <rect x={floor.stairs!.x - rw / 2} y={floor.stairs!.y - rh / 2} width={rw} height={rh} fill="#7c3aed" fillOpacity={0.25} stroke="#7c3aed" strokeWidth={stroke} />
                    <line x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} stroke="#7c3aed" strokeWidth={stroke * 2} />
                    <circle cx={tip.x} cy={tip.y} r={handleR * 0.7} fill="#7c3aed" />
                    <title>Stairs (rise towards the dot). Drag to move; set direction and size in the floor panel.</title>
                  </>
                );
              })()}
            </g>
          )}
          {calib.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={handleR} fill="#ef4444" />
          ))}
          {tool === "rect" && draft.length === 1 && hover && (
            <rect
              x={Math.min(draft[0].x, hover.x)}
              y={Math.min(draft[0].y, hover.y)}
              width={Math.abs(hover.x - draft[0].x)}
              height={Math.abs(hover.y - draft[0].y)}
              fill="#16a34a"
              fillOpacity={0.2}
              stroke="#16a34a"
              strokeWidth={stroke * 2}
              style={{ pointerEvents: "none" }}
            />
          )}
          {tool === "room" && draft.length > 0 && (
            <polyline
              points={[...draft, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#16a34a"
              strokeWidth={stroke * 2}
              style={{ pointerEvents: "none" }}
            />
          )}
          {(tool === "rect" || tool === "room" || tool === "wall") && hover && (
            <circle cx={hover.x} cy={hover.y} r={handleR * 0.8} fill="#16a34a" style={{ pointerEvents: "none" }} />
          )}
        </svg>

        <div className="side">
          {selected ? (
            <RoomInspector variant={variant} floor={floor} room={selected} onChange={(p) => updateRoom(variant, floor.id, selected.id, p)} />
          ) : selectedOpening ? (
            <OpeningInspector
              opening={selectedOpening}
              onChange={(p) =>
                updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.map((o) => (o.id === selectedOpening.id ? { ...o, ...p } : o)) }))
              }
              onDelete={() => {
                updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.filter((o) => o.id !== selectedOpening.id) }));
                setSelectedOpeningId(null);
              }}
            />
          ) : selectedWall ? (
            <WallInspector
              wall={selectedWall}
              onChange={(p) => updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).map((w) => (w.id === selectedWall.id ? { ...w, ...p } : w)) }))}
              onDelete={() => {
                updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).filter((w) => w.id !== selectedWall.id) }));
                setSelectedWallId(null);
              }}
            />
          ) : (
            <p className="muted">Select a room to rename it or set its printed size, an opening to change its width, or a wall to set its height.</p>
          )}
          <hr />
          <FloorInspector variant={variant} floor={floor} />
        </div>
      </div>
    </div>
  );
}

function nearestEdgeOrientation(floor: Floor, p: Pt): "h" | "v" {
  let best = Infinity;
  let orient: "h" | "v" = "h";
  const edges: [Pt, Pt][] = [
    ...floor.rooms.flatMap((r) => r.polygon.map((a, i) => [a, r.polygon[(i + 1) % r.polygon.length]] as [Pt, Pt])),
    ...(floor.walls ?? []).map((w) => [w.a, w.b] as [Pt, Pt]),
  ];
  {
    for (const [a, b] of edges) {
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

function WallInspector({ wall, onChange, onDelete }: { wall: Wall; onChange: (p: Partial<Wall>) => void; onDelete: () => void }) {
  return (
    <div className="inspector">
      <h4>Wall</h4>
      <label>
        Height (m, blank = full height)
        <input
          type="number"
          step="0.1"
          min="0.1"
          value={wall.height ?? ""}
          placeholder="full"
          onChange={(e) => onChange({ height: e.target.value === "" ? undefined : parseFloat(e.target.value) || undefined })}
        />
      </label>
      <label>
        Colour
        <input type="color" value={wall.color ?? "#f4f1ea"} onChange={(e) => onChange({ color: e.target.value })} />
      </label>
      <p className="muted small">Doors, windows and gaps can be placed on it like any other wall.</p>
      <button className="danger" onClick={onDelete}>
        Delete wall
      </button>
    </div>
  );
}

function OpeningInspector({ opening, onChange, onDelete }: { opening: Opening; onChange: (p: Partial<Opening>) => void; onDelete: () => void }) {
  return (
    <div className="inspector">
      <label>
        Type
        <select value={opening.kind} onChange={(e) => onChange({ kind: e.target.value as Opening["kind"] })}>
          <option value="door">Door</option>
          <option value="window">Window</option>
          <option value="bay">Bay window</option>
          <option value="garage">Garage door</option>
          <option value="gap">Gap (open-plan)</option>
          <option value="patio">Patio / sliding doors</option>
        </select>
      </label>
      <label>
        Colour
        <input type="color" value={opening.color ?? (opening.kind === "garage" ? "#b3202e" : "#c9a26b")} onChange={(e) => onChange({ color: e.target.value })} />
      </label>
      <label>
        Width (m)
        <input type="number" step="0.05" min="0.3" value={opening.widthM} onChange={(e) => onChange({ widthM: parseFloat(e.target.value) || opening.widthM })} />
      </label>
      <label>
        Wall runs
        <select value={opening.orientation} onChange={(e) => onChange({ orientation: e.target.value as Opening["orientation"] })}>
          <option value="h">left–right</option>
          <option value="v">up–down</option>
        </select>
      </label>
      <button className="danger" onClick={onDelete}>
        Delete opening
      </button>
    </div>
  );
}

function RoomInspector({ variant, floor, room, onChange }: { variant: VariantKey; floor: Floor; room: Room; onChange: (p: Partial<Room>) => void }) {
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
      <div className="row">
        <label>
          Floor colour
          <input type="color" value={room.color ?? roomColor(room)} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
        <label title="Colour of this room's external walls; blank uses the model's wall colour">
          Outside wall
          <input type="color" value={room.exteriorColor ?? "#efe9d8"} onChange={(e) => onChange({ exteriorColor: e.target.value })} />
        </label>
      </div>
      <label className="check" title="Tag top-floor rooms that belong to an extension so they can get their own roof">
        <input type="checkbox" checked={room.roofGroup === "extension"} onChange={(e) => onChange({ roofGroup: e.target.checked ? "extension" : undefined })} />{" "}
        Part of an extension (separate roof)
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
  const setVariant = useStore((s) => s.setVariant);
  const model = useStore((s) => s.variants[variant]);
  const setUi = useStore((s) => s.setUi);
  const withDims = floor.rooms.filter((r) => r.dims && r.dims.w > 0 && r.dims.h > 0).length;
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
        Scale (px per metre)
        <input type="number" step="0.1" value={floor.pxPerM.toFixed(1)} onChange={(e) => updateFloor(variant, floor.id, { pxPerM: parseFloat(e.target.value) || floor.pxPerM })} />
      </label>
      <button
        disabled={!withDims}
        title="Uses the printed sizes you entered on rooms"
        onClick={() => {
          const est = estimatePxPerM(floor.rooms);
          if (est) updateFloor(variant, floor.id, { pxPerM: est });
        }}
      >
        Scale from printed sizes ({withDims} room{withDims === 1 ? "" : "s"})
      </button>
      <label>
        Stacking offset (m)
        <span className="row">
          <input type="number" step="0.1" value={floor.offset.x} onChange={(e) => updateFloor(variant, floor.id, { offset: { ...floor.offset, x: parseFloat(e.target.value) || 0 } })} />
          <input type="number" step="0.1" value={floor.offset.y} onChange={(e) => updateFloor(variant, floor.id, { offset: { ...floor.offset, y: parseFloat(e.target.value) || 0 } })} />
        </span>
      </label>
      <h4>Stairs</h4>
      {floor.stairs ? (
        <>
          <label>
            Direction
            <select value={floor.stairsDir ?? "up"} onChange={(e) => updateFloor(variant, floor.id, { stairsDir: e.target.value as StairsDir })}>
              {(Object.keys(STAIRS_DIR_LABEL) as StairsDir[]).map((d) => (
                <option key={d} value={d}>
                  {STAIRS_DIR_LABEL[d]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Length × width (m)
            <span className="row">
              <input type="number" step="0.1" min="1" value={floor.stairsLen ?? 2.6} onChange={(e) => updateFloor(variant, floor.id, { stairsLen: parseFloat(e.target.value) || 2.6 })} />
              <input type="number" step="0.1" min="0.6" value={floor.stairsWidth ?? 0.9} onChange={(e) => updateFloor(variant, floor.id, { stairsWidth: parseFloat(e.target.value) || 0.9 })} />
            </span>
          </label>
          <p className="muted small">The flight is drawn only on floors that have a floor above; on the top floor the marker is where it arrives.</p>
          <button onClick={() => updateFloor(variant, floor.id, { stairs: undefined })}>Remove stairs</button>
        </>
      ) : (
        <button
          onClick={() => {
            const b = bbox(floor.rooms.flatMap((r) => r.polygon));
            updateFloor(variant, floor.id, { stairs: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } });
          }}
        >
          Add stairs (drag to place)
        </button>
      )}
      <h4>Floor</h4>
      <div className="row">
        <button
          disabled={floor.rooms.length === 0}
          title="Put the centre of this floor's rooms at the model origin so floors stack"
          onClick={() => {
            const b = bbox(floor.rooms.flatMap((r) => r.polygon));
            updateFloor(variant, floor.id, { origin: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, offset: { x: 0, y: 0 } });
          }}
        >
          Re-centre floor
        </button>
        <button
          className="danger"
          onClick={() => {
            if (!model || !window.confirm(`Delete ${floor.name} and its rooms?`)) return;
            const floors = model.floors.filter((f) => f.id !== floor.id);
            if (floors.length) setVariant(variant, { ...model, floors });
            else setVariant(variant, undefined);
            setUi({ editFloorId: floors[0]?.id ?? null, selectedRoomId: null, tab: floors.length ? "plan" : "3d" });
          }}
        >
          Delete floor
        </button>
      </div>
    </div>
  );
}
