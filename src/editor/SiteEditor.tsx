import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useChassis } from "../components/useChassis";
import { useSite, useStore } from "../store";
import { SURFACE_LABEL, uid, type BoundaryEdge, type HouseModel, type Neighbour, type ScreenPanel, type Site, type SurfaceKind, type WallFollow, type WPt } from "../types";
import { useCurrentHouse } from "../lib/house";
import { bbox, pointInPolygon, polygonArea } from "../lib/geometry";
import type { Rect } from "../lib/planMath";
import { siteWalls } from "../lib/siteWalls";
import { boundaryWallSegments, groundAlong, resolveFollow } from "../lib/wallSteps";
import { screenBand } from "../lib/screenBlocks";
import { bearingToWorld } from "../lib/sun";
import { areaOf, defaultDepths, edgesOf, houseOutlines, removeBoundaryVertex, sideClearances, simpleSite } from "../lib/site";
import { PlotPanel } from "../components/PlotPanel";
import { MIN_OPENING, defaultOpeningEnd, edgeLength, moveBoundaryCorner, neighbourEdgeOf, setOpeningWidth, slideCorner, type OpeningEnd } from "../lib/boundaryOpening";
import { arrowDelta, shiftPts } from "../lib/nudge";
import { toolAllowed } from "../lib/chassis";
import { type GardenDef } from "../lib/gardenCatalogue";
import { copyItems, itemsOf, moveItems, placeSpot, snapItem } from "../lib/siteItems";
import { surfaceArea } from "../lib/surfaceCurve";
import { GardenPanel } from "../components/GardenPanel";
import { ToolRail, type RailItem } from "./ToolRail";
import { AddPopover, GardenPicker } from "./AddItem";
import { InspectorCard } from "../components/InspectorCard";
import { Info } from "../components/Info";
import { Icon } from "../components/icons";
import { BrandMark } from "../components/BrandMark";
import { lowerSheet, raiseSheet, useCameraInsets, useCanvasCamera, useEditorKeys } from "./core";
import { slideFor, useSiteDrag, type GardenActions } from "./site/useSiteDrag";
import { DraftRect, SelectionLayer, SiteWorld } from "./site/SiteLayers";
import { GardenItems, ItemHandles, PlacementGhost, PolyDraftView, RunDraftView } from "./site/GardenLayers";
import { ItemInspector, SurfaceFields } from "./site/GardenInspectors";
import { curvesAfterRemove, linkCandidate, linkEdge, linksAfterRemove, relinkAfterRemove, unlinkEdge } from "../lib/surfaceCurve";
import { addItem, closesPolygon, gardenClipboard, newItem, pasteItems, removeItems, rotateItems } from "./site/gardenEdit";
import type { Draft, Item, Sel, SiteMode, Tool } from "./site/types";
import "./PlanEditor.css"; // the rail, popover and zoom styles are shared with the plan
import "./SiteEditor.css";

const EDGE_LABEL: Record<BoundaryEdge["kind"], string> = { fence: "Close-board fence", wall: "Brick wall", hedge: "Hedge", open: "Open (no boundary)" };
const EDGE_DEFAULT_HEIGHT: Record<BoundaryEdge["kind"], number> = { fence: 1.8, wall: 1.8, hedge: 1.5, open: 0 };
const NICE = [0.5, 1, 2, 5, 10, 20, 50, 100];
const SITE_LIMITS = () => ({ minS: 1 / 400, maxS: 1 / 2 });

/**
 * Top-down editor in world metres, in two modes. Plot: the boundary and neighbouring buildings are selectable, the
 * garden is drawn faded. Garden: surfaces and items are selectable, the boundary and neighbours are drawn only.
 */
export function SiteEditor({ mode = "plot" }: { mode?: SiteMode }) {
  const site = useSite();
  const model = useStore((s) => s.variants[s.activeVariant]);
  if (!site) return <NoSite model={model} />;
  return <SitePlan site={site} model={model} mode={mode} />;
}

function NoSite({ model }: { model?: HouseModel }) {
  const setSite = useStore((s) => s.setSite);
  const house = useCurrentHouse();
  return (
    <div className="empty">
      <BrandMark outline size={72} />
      <h2>No site yet</h2>
      <p>The site plan holds the plot boundary, garden surfaces and neighbouring buildings around the house.</p>
      <div className="row" style={{ justifyContent: "center" }}>
        <button onClick={() => setSite(house.sitePresets[house.site].build())}>Load site for {house.name}</button>
        {model && <button onClick={() => setSite(simpleSite(model, defaultDepths(model)))}>Create a simple site around the house</button>}
      </div>
    </div>
  );
}

function SitePlan({ site, model, mode }: { site: Site; model?: HouseModel; mode: SiteMode }) {
  const garden = mode === "garden";
  const updateSite = useStore((s) => s.updateSite);
  const setUi = useStore((s) => s.setUi);
  const gardenSel = useStore((s) => s.gardenSel);
  const chassis = useChassis((s) => s.chassis);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [drawKind, setDrawKind] = useState<SurfaceKind>("lawn");
  const [polySel, setPolySel] = useState<Item | null>(null);
  const [draft, setDraft] = useState<Draft>(null);
  // Garden tools: the armed catalogue entry, a run's first end, the polygon's corners so far, and the pointer for ghosts.
  const [armed, setArmed] = useState<GardenDef | null>(null);
  const [runStart, setRunStart] = useState<WPt | null>(null);
  const [polyPts, setPolyPts] = useState<WPt[]>([]);
  const [hover, setHoverState] = useState<WPt | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const hoverNext = useRef<WPt | null>(null);
  const hoverRaf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(hoverRaf.current), []);

  /** Garden items hold the selection in the store (shared with the panel); everything else is local. */
  const sel: Sel = garden && gardenSel.length ? { type: "item", ids: gardenSel } : polySel;
  const setSel = (s: Sel) => {
    if (s?.type === "item") {
      setPolySel(null);
      setUi({ gardenSel: s.ids });
      return;
    }
    setPolySel(s);
    if (gardenSel.length) setUi({ gardenSel: [] });
  };
  const selectItems = (ids: string[]) => setSel(ids.length ? { type: "item", ids } : null);
  const psel: Item | null = sel?.type === "item" ? null : sel;
  const itemIds = sel?.type === "item" ? sel.ids : [];

  const outlines = useMemo(() => (model ? houseOutlines(model) : []), [model]);
  // Clearances run from the outer wall faces (outlines carry them), not the wall centre lines.
  const clearances = useMemo(() => sideClearances(outlines, site.boundary), [outlines, site.boundary]);
  const walls = useMemo(() => (model ? siteWalls(model) : []), [model]);

  // Home: the plot, house and neighbours (not the long road) with a 2 m margin.
  const home = useMemo<Rect>(() => {
    const pts = [...site.boundary, ...outlines.flatMap((o) => o.polys.flat()), ...walls.flatMap((l) => l.walls.flatMap((w) => w.poly)), ...site.neighbours.flatMap((n) => n.polygon)];
    const b = pts.length ? bbox(pts) : { x0: -10, y0: -10, x1: 10, y1: 10, w: 20, h: 20 };
    return { x0: b.x0 - 2, y0: b.y0 - 2, x1: b.x1 + 2, y1: b.y1 + 2 };
  }, [site.boundary, site.neighbours, outlines, walls]);
  const touch = useChassis((s) => s.touch);
  const insets = useCameraInsets();
  const camera = useCanvasCamera(svgRef as unknown as RefObject<HTMLElement | null>, { home, fitKey: `site:${insets.fitSuffix}`, insetRight: insets.insetRight, insetBottom: insets.insetBottom, insetLeft: insets.insetLeft, unitsPerM: 1, limits: SITE_LIMITS, anchor: "centre", padFrac: 0 });
  const { cam, size } = camera;
  const px = camera.px; // one screen pixel in metres
  const peeking = useStore((s) => s.peek);

  const polyOf = (s: Item): WPt[] =>
    s.type === "boundary" ? site.boundary : s.type === "surface" ? site.surfaces.find((x) => x.id === s.id)?.polygon ?? [] : site.neighbours.find((x) => x.id === s.id)?.polygon ?? [];
  /** Change one polygon, working on the store's current copy so quick successive edits never use a stale one. */
  const editPoly = (s: Item, f: (poly: WPt[]) => WPt[]) =>
    updateSite((st) =>
      s.type === "boundary"
        ? { ...st, boundary: f(st.boundary) }
        : s.type === "surface"
          ? { ...st, surfaces: st.surfaces.map((x) => (x.id === s.id ? { ...x, polygon: f(x.polygon) } : x)) }
          : { ...st, neighbours: st.neighbours.map((x) => (x.id === s.id ? { ...x, polygon: f(x.polygon) } : x)) },
    );

  const deleteVertex = (s: Item, i: number) => {
    if (s.type === "boundary") updateSite((st) => removeBoundaryVertex(st, i));
    else if (s.type === "surface")
      updateSite((st) => {
        const n = st.surfaces.find((x) => x.id === s.id)?.polygon.length ?? 0;
        if (n <= 3) return st;
        return {
          ...st,
          surfaces: relinkAfterRemove(st.surfaces, s.id, i, n).map((x) => (x.id === s.id ? { ...x, polygon: x.polygon.filter((_, j) => j !== i), curves: curvesAfterRemove(x.curves, i, n), links: linksAfterRemove(x.links, i, n) } : x)),
        };
      });
    else editPoly(s, (poly) => (poly.length > 3 ? poly.filter((_, j) => j !== i) : poly));
    setSel({ ...s, vertex: null, edge: null } as Sel);
  };
  const deleteSelectedItems = () => {
    if (!itemIds.length) return;
    updateSite((st) => removeItems(st, itemIds));
    setSel(null);
  };
  const deleteItem = (s: Item) => {
    if (s.type === "surface") updateSite((st) => ({ ...st, surfaces: st.surfaces.filter((x) => x.id !== s.id) }));
    if (s.type === "neighbour") updateSite((st) => ({ ...st, neighbours: st.neighbours.filter((x) => x.id !== s.id) }));
    setSel(null);
  };

  /** Arrow-key nudge in metres: the selected corner, or a whole surface / building with no corner picked. */
  const nudge = (s: Item, dx: number, dy: number): boolean => {
    if (s.vertex !== null) {
      const i = s.vertex;
      if (!polyOf(s)[i]) return false;
      if (s.type === "boundary") {
        const slide = slideFor(site, s, i);
        updateSite((st) => {
          const c = st.boundary[i];
          if (!c) return st;
          const p = { x: c.x + dx, y: c.y + dy };
          return slide ? slideCorner(st, i, slide, p) : moveBoundaryCorner(st, i, p);
        });
      } else editPoly(s, (poly) => poly.map((o, j) => (j === i ? { x: o.x + dx, y: o.y + dy } : o)));
      return true;
    }
    if (s.type === "boundary") return false;
    editPoly(s, (poly) => shiftPts(poly, dx, dy));
    return true;
  };

  const houseOutline = () => outlines.flatMap((o) => o.polys);
  const grid = (p: WPt): WPt => ({ x: Math.round(p.x * 20) / 20, y: Math.round(p.y * 20) / 20 });
  const disarm = () => {
    setArmed(null);
    setRunStart(null);
    setPolyPts([]);
    setDraft(null);
    setHoverState(null);
  };
  const finishPoly = (pts: WPt[]) => {
    if (pts.length < 3) return;
    const polygon = polygonArea(pts) < 0 ? [...pts].reverse() : pts;
    if (Math.abs(polygonArea(polygon)) < 0.1) return;
    const id = uid();
    updateSite((st) => ({ ...st, surfaces: [...st.surfaces, { id, kind: drawKind, polygon }] }));
    setSel({ type: "surface", id, vertex: null });
    setPolyPts([]);
    setHoverState(null);
    setTool("select");
  };
  const gardenActions: GardenActions = {
    selection: itemIds,
    selectItems,
    polyClick: (at, tol) => {
      if (closesPolygon(polyPts, at, tol)) return finishPoly(polyPts);
      const last = polyPts[polyPts.length - 1];
      if (last && Math.hypot(last.x - at.x, last.y - at.y) < tol / 3) return;
      setPolyPts([...polyPts, at]);
    },
    placeAt: (at, shift) => {
      if (!armed || armed.run) return;
      const proto = newItem(armed, at);
      const s = snapItem(proto, at, site, houseOutline());
      const item = { ...proto, x: s.x, y: s.y, rot: s.rot };
      updateSite((st) => addItem(st, item));
      selectItems([item.id]);
      if (!shift) {
        disarm();
        setTool("select");
      }
    },
    runClick: (at, shift) => {
      if (!armed?.run) return;
      const p = grid(at);
      if (!runStart) return setRunStart(p);
      if (Math.hypot(p.x - runStart.x, p.y - runStart.y) < 0.2) return;
      const item = newItem(armed, runStart, 0, p);
      updateSite((st) => addItem(st, item));
      selectItems([item.id]);
      if (shift) setRunStart(null);
      else {
        disarm();
        setTool("select");
      }
    },
    hover: (at) => {
      if (tool !== "place" && tool !== "run" && tool !== "polygon") return;
      hoverNext.current = at;
      if (!hoverRaf.current)
        hoverRaf.current = requestAnimationFrame(() => {
          hoverRaf.current = 0;
          setHoverState(hoverNext.current);
        });
    },
  };

  const { drag, gardenItemDown, rotateDown, resizeDown, endDown, itemDown, vertexDown, edgeDown, midDown } = useSiteDrag({ svgRef, camera, site, outlines, tool, drawKind, sel, setSel, setTool, setDraft, editPoly, deleteVertex, garden: gardenActions });

  /** Where a new entry goes without a point (a phone's pick): the middle of the view when it is on the plot, else the lawn or patio. */
  const spotNow = (): WPt => {
    const c = cam && size ? { x: cam.x + (size.w * cam.s) / 2, y: cam.y + (size.h * cam.s) / 2 } : null;
    return c && site.boundary.length >= 3 && pointInPolygon(c, site.boundary) ? grid(c) : placeSpot(site);
  };
  /** The picker's choice: arm the tool on a pointer chassis, or put it straight down on a phone. */
  const pickGarden = (def: GardenDef) => {
    setAddOpen(false);
    if (chassis === "phone") {
      const item = newItem(def, spotNow());
      updateSite((st) => addItem(st, item));
      selectItems([item.id]);
      return;
    }
    disarm();
    setArmed(def);
    setTool(def.run ? "run" : "place");
  };

  // Esc during a drag is the core's (it restores the snapshot); this runs when nothing is being dragged.
  useEditorKeys((e) => {
    if (garden && (e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      const picked = itemsOf(site).filter((it) => itemIds.includes(it.id));
      if (k === "d" && picked.length) {
        e.preventDefault();
        const r = copyItems(site, itemIds);
        updateSite(() => r.site);
        selectItems(r.ids);
      } else if (k === "c" && picked.length) {
        e.preventDefault();
        gardenClipboard.set(picked);
      } else if (k === "v" && gardenClipboard.count()) {
        e.preventDefault();
        const r = pasteItems(site, gardenClipboard.get());
        updateSite(() => r.site);
        selectItems(r.ids);
      }
      return;
    }
    const arrow = !e.ctrlKey && !e.metaKey && !e.altKey ? arrowDelta(e.key, e.shiftKey) : null;
    if (arrow) {
      if (itemIds.length && tool === "select") {
        updateSite((st) => moveItems(st, itemIds, arrow.x, arrow.y));
        e.preventDefault();
      } else if (psel && tool === "select" && nudge(psel, arrow.x, arrow.y)) e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      setSel(null);
      disarm();
      setTool("select");
      return;
    }
    if (garden && tool === "polygon") {
      if (e.key === "Enter") {
        e.preventDefault();
        return finishPoly(polyPts);
      }
      if (e.key === "Backspace" && polyPts.length) {
        e.preventDefault();
        return setPolyPts(polyPts.slice(0, -1));
      }
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      const pick = (t: Tool) => {
        disarm();
        setTool(t);
      };
      if (k === "v") pick("select");
      else if (garden && k === "r") pick("surface");
      else if (garden && k === "c") pick("circle");
      else if (garden && k === "p") pick("polygon");
      else if (garden && k === "a") {
        e.preventDefault(); // or the search box would take the letter
        setAddOpen((v) => !v);
      }
      else if (!garden && k === "b") pick("neighbour");
      else if (garden && (k === "q" || k === "e") && itemIds.length) updateSite((st) => rotateItems(st, itemIds, k === "e" ? 15 : -15));
      else if (k === "f") camera.fit();
      else if (k === "+" || k === "=") camera.zoomBy(1.4);
      else if (k === "-" || k === "_") camera.zoomBy(1 / 1.4);
    }
    if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      e.preventDefault();
      if (itemIds.length) deleteSelectedItems();
      else if (psel && psel.vertex !== null) deleteVertex(psel, psel.vertex);
      else if (psel) deleteItem(psel);
    }
  });

  // On the phone a tap that selects a plot item brings the inspector sheet up; clearing the selection drops it.
  const selKey = sel ? `${sel.type}:${sel.type === "item" ? sel.ids.join(",") : "id" in sel ? sel.id : ""}` : "";
  const prevSelKey = useRef(selKey);
  useEffect(() => {
    if (prevSelKey.current === selKey) return;
    prevSelKey.current = selKey;
    if (selKey) raiseSheet();
    else lowerSheet();
  }, [selKey]);

  const selPoly = psel ? polyOf(psel) : [];
  const selSurface = psel?.type === "surface" ? site.surfaces.find((x) => x.id === psel.id) : undefined;
  const oneItem = itemIds.length === 1 ? itemsOf(site).find((it) => it.id === itemIds[0]) : undefined;
  const north = bearingToWorld(site.frontBearing, 0);
  const northDeg = (Math.atan2(north.x, -north.z) * 180) / Math.PI;
  const scaleLen = NICE.find((n) => n / px >= 70) ?? 100;
  const cursor = tool === "select" ? "grab" : "crosshair";
  const toolItem = (id: Tool, icon: RailItem["icon"], label: string, shortcut: string, gate = id as string): RailItem[] =>
    toolAllowed(chassis, gate) ? [{ id, icon, label, shortcut, active: tool === id, onClick: () => { disarm(); setTool(id); } }] : [];
  const railGroups: RailItem[][] = garden
    ? [
        [
          {
            id: "add",
            icon: "plus",
            label: "Add to the garden",
            shortcut: "A",
            active: addOpen || tool === "place" || tool === "run",
            onClick: () => {
              if (!addOpen && chassis === "phone") lowerSheet(); // the picker sits above the sheet's peek, so the sheet must be down
              setAddOpen(!addOpen);
            },
            extra: (
              <AddPopover open={addOpen} onOpenChange={setAddOpen}>
                <GardenPicker activeId={armed?.id} onPick={pickGarden} />
              </AddPopover>
            ),
          },
        ],
        toolItem("select", "select", "Select / move", "V"),
        [...toolItem("surface", "rect", "Rectangle surface", "R", "rect"), ...toolItem("circle", "circle", "Circle surface", "C"), ...toolItem("polygon", "polygon", "Polygon surface", "P")],
      ]
    : [toolItem("select", "select", "Select / move", "V"), toolItem("neighbour", "house", "Draw building", "B")];
  const selectedIds = itemIds;
  const armedItem = armed && hover && tool === "place" ? (() => {
    const proto = newItem(armed, hover);
    const s = snapItem(proto, hover, site, houseOutline());
    return { ...proto, x: s.x, y: s.y, rot: s.rot };
  })() : null;
  const runGhost = armed?.run && runStart && hover ? { ...newItem(armed, runStart, 0, grid(hover)) } : null;
  // The grid is three viewports wide, so a pan never shows past its edge.
  const vb = cam && size ? { x: cam.x, y: cam.y, w: size.w * cam.s, h: size.h * cam.s } : null;

  return (
    <div className="site-editor">
      <div className="site-editor-body">
        <div className="site-canvas">
          <svg ref={svgRef} viewBox={camera.viewBox} style={{ cursor }} className={peeking ? "peeking" : undefined} {...drag.svgProps}>
            {vb && (
              <g ref={camera.layerRef}>
                <defs>
                  <pattern id="site-grid" width={1} height={1} patternUnits="userSpaceOnUse">
                    <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#eef0f3" strokeWidth={px} />
                  </pattern>
                </defs>
                <rect x={vb.x - vb.w} y={vb.y - vb.h} width={3 * vb.w} height={3 * vb.h} fill="url(#site-grid)" />
                <SiteWorld site={site} mode={mode} sel={psel} tool={tool} px={px} outlines={outlines} walls={walls} clearances={clearances} onItemDown={itemDown} />
                <GardenItems site={site} selected={selectedIds} px={px} interactive={garden} onDown={gardenItemDown} />
                {psel && selPoly.length > 0 && <SelectionLayer sel={psel} poly={selPoly} px={px} smooth={!!(selSurface?.smooth || selSurface?.curves?.length)} linked={selSurface?.links?.map((l) => l.edge)} onEdgeDown={edgeDown} onMidDown={midDown} onVertexDown={vertexDown} />}
                {garden && tool === "select" && oneItem && !peeking && <ItemHandles item={oneItem} px={px} touch={touch} onRotateDown={(e) => rotateDown(e, oneItem.id)} onResizeDown={(e, h) => resizeDown(e, oneItem.id, h)} onEndDown={(e, end) => endDown(e, oneItem.id, end)} />}
                {armedItem && armed && <PlacementGhost def={armed} item={armedItem} px={px} />}
                {armed?.run && runStart && <RunDraftView from={runStart} to={hover ? grid(hover) : null} px={px} />}
                {runGhost && armed && <PlacementGhost def={armed} item={runGhost} px={px} />}
                {tool === "polygon" && <PolyDraftView points={polyPts} hover={hover} px={px} />}
                {draft && <DraftRect draft={draft} px={px} />}
              </g>
            )}
          </svg>
          <div className="site-north" style={{ transform: `rotate(${northDeg}deg)` }} aria-label="North">
            <span>N</span>
            <svg viewBox="-10 -16 20 32" width={18} height={30}>
              <path d="M0 -16 L8 6 L0 1 L-8 6 Z" fill="#dc2626" />
            </svg>
          </div>
          <div className="site-scale">
            <div style={{ width: scaleLen / px }} />
            <span>{scaleLen} m</span>
          </div>
        </div>
      </div>

      {!peeking && (
        <ToolRail
          groups={railGroups}
          footer={
            <Info label="How this works">
              {garden
                ? touch
                  ? "Tap a surface or item. Drag to move it; drag the round handles to turn or resize. Add puts a new one in the middle of the view. Drag the background to pan; pinch to zoom."
                  : "Click a surface or item; Shift-click adds to the selection. Drag to move; the handles turn and resize. Q and E turn by 15°, arrows nudge (Shift ×10), Ctrl+D duplicates, Ctrl+C and Ctrl+V copy and paste, Delete removes. A adds an item, R, C and P draw surfaces."
                : touch
                  ? "Tap a boundary edge or building. Drag corners; + adds a corner. Drag the background to pan; pinch to zoom."
                  : "Click a boundary edge or building. Drag corners; + adds a corner. Drag the background or swipe with two fingers to pan; pinch or use the mouse wheel to zoom. Arrows nudge the selected corner or shape (Shift ×10)."}
            </Info>
          }
        />
      )}

      <div className="site-zoom float-card" role="group" aria-label="Zoom">
        {!touch && (
          <>
            <button type="button" className="icon-btn" onClick={() => camera.zoomBy(1.4)} aria-label="Zoom in (+)" title="Zoom in (+)">
              <Icon name="zoomIn" size={20} />
            </button>
            <button type="button" className="icon-btn" onClick={() => camera.zoomBy(1 / 1.4)} aria-label="Zoom out (−)" title="Zoom out (−)">
              <Icon name="zoomOut" size={20} />
            </button>
          </>
        )}
        <button type="button" className="icon-btn" onClick={() => camera.fit()} aria-label="Fit the plot (F)" title="Fit the plot (F)">
          <Icon name="fit" size={20} />
        </button>
      </div>

      {!peeking && tool === "select" && drag.kind === "poly-edge" && (
        <div className="site-status float-card" role="status">
          <span>{touch ? "Drag to move the edge" : "Drag to move the edge · Esc cancels"}</span>
        </div>
      )}
      {!peeking && tool !== "select" && (
        <div className="site-status float-card" role="status" data-site-status={tool}>
          <span>
            {tool === "circle"
              ? "Drag out a circle from its centre."
              : tool === "polygon"
                ? polyPts.length < 3
                  ? "Click each corner."
                  : "Click the first corner or press Enter to finish. Backspace drops the last."
                : tool === "place"
                  ? `Click to place the ${armed?.name.toLowerCase() ?? "item"}. Shift keeps adding.`
                  : tool === "run"
                    ? runStart
                      ? "Click the other end."
                      : "Click the first end."
                    : "Drag out a rectangle."}
          </span>
          {garden && (tool === "surface" || tool === "circle" || tool === "polygon") && (
            <select value={drawKind} onChange={(e) => setDrawKind(e.target.value as SurfaceKind)} aria-label="Surface to draw">
              {(Object.keys(SURFACE_LABEL) as SurfaceKind[]).map((k) => (
                <option key={k} value={k}>
                  {SURFACE_LABEL[k]}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <InspectorCard className="side site-side" title={garden ? "Garden" : "Plot"}>
        <Inspector site={site} sel={sel} garden={garden} onDeleteVertex={deleteVertex} onDeleteItem={deleteItem} clearances={clearances} />
      </InspectorCard>
    </div>
  );
}


function Inspector({
  site,
  sel: selection,
  garden,
  onDeleteVertex,
  onDeleteItem,
  clearances,
}: {
  site: Site;
  sel: Sel;
  garden: boolean;
  onDeleteVertex: (s: Item, i: number) => void;
  onDeleteItem: (s: Item) => void;
  clearances: ReturnType<typeof sideClearances>;
}) {
  if (selection?.type === "item") return <ItemInspector ids={selection.ids} />;
  const sel: Item | null = selection;
  const updateSite = useStore((s) => s.updateSite);
  const num = (v: string, f: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : f);
  const corners =
    sel?.type === "boundary"
      ? site.boundary.length
      : (sel?.type === "surface" ? site.surfaces.find((x) => x.id === sel.id) : site.neighbours.find((x) => x.id === sel?.id))?.polygon.length ?? 0;
  const vertexButton = sel && sel.vertex !== null && (
    <button onClick={() => onDeleteVertex(sel, sel.vertex!)} disabled={corners <= 3}>
      Delete corner {sel.vertex + 1}
    </button>
  );

  if (sel?.type === "boundary") {
    const edges = edgesOf(site);
    const i = sel.edge;
    const setEdge = (p: Partial<BoundaryEdge>) =>
      updateSite((st) => {
        const list = edgesOf(st).map((e, j) => (j === i ? { ...e, ...p } : e));
        return { ...st, boundaryEdges: list };
      });
    return (
      <div className="inspector">
        <h4>Plot boundary</h4>
        <p className="muted small">{areaOf(site.boundary).toFixed(1)} m² inside the boundary.</p>
        {i !== null && edges[i] && (
          <>
            <p className="small">
              Edge {i + 1} of {site.boundary.length},{" "}
              {Math.hypot(site.boundary[(i + 1) % site.boundary.length].x - site.boundary[i].x, site.boundary[(i + 1) % site.boundary.length].y - site.boundary[i].y).toFixed(2)} m long
            </p>
            <label>
              Treatment
              <select
                value={edges[i].kind}
                onChange={(e) => {
                  const kind = e.target.value as BoundaryEdge["kind"];
                  setEdge({ kind, height: kind === "open" ? 0 : edges[i].height || EDGE_DEFAULT_HEIGHT[kind] });
                }}
              >
                {(Object.keys(EDGE_LABEL) as BoundaryEdge["kind"][]).map((k) => (
                  <option key={k} value={k}>
                    {EDGE_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {edges[i].kind !== "open" && (
              <label>
                Height (m)
                <input type="number" step={0.1} min={0.3} max={4} value={edges[i].height} onChange={(e) => setEdge({ height: Math.max(0.1, num(e.target.value, edges[i].height)) })} />
              </label>
            )}
            <OpeningWidth site={site} edge={i} />
            {edges[i].kind === "open" && (
              <label>
                Wall ends beside the gap
                <select value={edges[i].endFinish ?? "plain"} onChange={(e) => setEdge({ endFinish: e.target.value as "plain" | "pier" })}>
                  <option value="plain">Plain (cut brickwork)</option>
                  <option value="pier">Brick pier at each end</option>
                </select>
              </label>
            )}
            {edges[i].kind === "wall" && (
              <>
                <label>
                  Top
                  <select value={edges[i].top ?? "coping"} onChange={(e) => setEdge({ top: e.target.value as "coping" | "brick" })}>
                    <option value="coping">Coping</option>
                    <option value="brick">Brick on edge</option>
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={edges[i].piers ?? true} onChange={(e) => setEdge({ piers: e.target.checked })} />
                  Piers
                </label>
                <ScreenBlocks site={site} edge={i} setEdge={setEdge} />
              </>
            )}
            {(edges[i].kind === "wall" || edges[i].kind === "fence") && <FollowGround site={site} edge={i} setEdge={setEdge} />}
          </>
        )}
        <div className="row">{vertexButton}</div>
        <Clearances clearances={clearances} />
      </div>
    );
  }
  if (sel?.type === "surface") {
    const s = site.surfaces.find((x) => x.id === sel.id);
    if (!s) return <EmptyInspector />;
    return (
      <div className="inspector" data-garden-inspector="surface">
        <h4>Garden surface</h4>
        <SurfaceFields surface={s} edge={sel.edge} />
        {sel.edge !== null && sel.edge !== undefined && sel.edge < s.polygon.length && (() => {
          const i = sel.edge;
          const link = s.links?.find((l) => l.edge === i);
          const other = (id: string) => site.surfaces.find((x) => x.id === id);
          if (link) {
            const t = other(link.surface);
            return (
              <div className="row" data-garden-link="linked">
                <p className="muted small">Edge {i + 1} follows the {t ? SURFACE_LABEL[t.kind].toLowerCase() : "surface"} beside it, so the two meet exactly; move or curve that one.</p>
                <button onClick={() => updateSite((st) => ({ ...st, surfaces: st.surfaces.map((x) => (x.id === s.id ? unlinkEdge(x, i, st.surfaces) : x)) }))}>Unlink</button>
              </div>
            );
          }
          const cand = linkCandidate(s, i, site.surfaces);
          const t = cand && other(cand.surface);
          if (!cand || !t) return null;
          return (
            <div className="row" data-garden-link="candidate">
              <button onClick={() => updateSite((st) => ({ ...st, surfaces: st.surfaces.map((x) => (x.id === s.id ? linkEdge(x, i, cand, st.surfaces) : x)) }))}>
                Follow the {SURFACE_LABEL[t.kind].toLowerCase()}'s edge beside it
              </button>
              <p className="muted small">Draw the curve once on the {SURFACE_LABEL[t.kind].toLowerCase()}; this edge will match it.</p>
            </div>
          );
        })()}
        <p className="muted small">{surfaceArea(s).toFixed(1)} m². Drag it to move it.</p>
        <div className="row">
          {vertexButton}
          <button className="danger" onClick={() => onDeleteItem(sel)}>
            Delete surface
          </button>
        </div>
      </div>
    );
  }
  if (sel?.type === "neighbour") {
    const n = site.neighbours.find((x) => x.id === sel.id);
    if (!n) return <EmptyInspector />;
    const set = (p: Partial<Neighbour>) => updateSite((st) => ({ ...st, neighbours: st.neighbours.map((x) => (x.id === n.id ? { ...x, ...p } : x)) }));
    return (
      <div className="inspector">
        <h4>Neighbouring building</h4>
        <label>
          Name
          <input type="text" value={n.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          Eaves height above the ground (m)
          <input type="number" step={0.1} min={0.5} max={20} value={n.eaves} onChange={(e) => set({ eaves: Math.max(0.5, num(e.target.value, n.eaves)) })} />
        </label>
        <p className="muted small">About 2.5 m for a single storey, 5.3 m for two.</p>
        <label>
          Roof
          <select value={n.roof} onChange={(e) => set({ roof: e.target.value as Neighbour["roof"] })}>
            <option value="hip">Hipped</option>
            <option value="gable">Gabled</option>
            <option value="flat">Flat</option>
          </select>
        </label>
        {n.roof !== "flat" && (
          <>
            <label>
              Pitch (degrees)
              <input type="number" min={10} max={60} value={n.pitchDeg ?? 35} onChange={(e) => set({ pitchDeg: Math.min(60, Math.max(5, num(e.target.value, 35))) })} />
            </label>
            <label>
              Ridge runs
              <select value={n.ridgeAxis ?? "auto"} onChange={(e) => set({ ridgeAxis: e.target.value as Neighbour["ridgeAxis"] })}>
                <option value="auto">Along the longer side</option>
                <option value="x">Left–right</option>
                <option value="z">Front–back</option>
              </select>
            </label>
            <label>
              Party wall
              <select value={n.partySide ?? "none"} onChange={(e) => set({ partySide: e.target.value as Neighbour["partySide"] })}>
                <option value="none">None (detached)</option>
                <option value="left">On its left side</option>
                <option value="right">On its right side</option>
              </select>
            </label>
          </>
        )}
        <p className="muted small">{areaOf(n.polygon).toFixed(1)} m² footprint. Drag it to move it.</p>
        <div className="row">
          {vertexButton}
          <button className="danger" onClick={() => onDeleteItem(sel)}>
            Delete building
          </button>
        </div>
      </div>
    );
  }
  return garden ? <GardenPanel /> : <EmptyInspector />;
}

/** Typed width of the selected edge. One end slides along the wall next to it, so the boundary line holds. */
function OpeningWidth({ site, edge }: { site: Site; edge: number }) {
  const updateSite = useStore((s) => s.updateSite);
  const [pick, setPick] = useState<{ edge: number; end: OpeningEnd } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const n = site.boundary.length;
  const end = pick && pick.edge === edge ? pick.end : defaultOpeningEnd(site, edge);
  const width = edgeLength(site, edge);
  const nb = neighbourEdgeOf(site, edge, end);
  // "Left" and "right" by where the two corners sit on the plan.
  const a = site.boundary[edge];
  const b = site.boundary[(edge + 1) % n];
  const startIsLeft = a.x <= b.x;
  const endLabel = (e: OpeningEnd) => ((e === "start") === startIsLeft ? "left end" : "right end");
  const apply = (v: string, e: OpeningEnd) => {
    const w = parseFloat(v);
    if (Number.isFinite(w)) updateSite((st) => setOpeningWidth(st, edge, w, e));
  };
  return (
    <>
      <label>
        Width (m)
        <input
          type="number"
          step={0.05}
          min={MIN_OPENING}
          value={draft ?? width.toFixed(2)}
          onChange={(e) => {
            setDraft(e.target.value);
            apply(e.target.value, end);
          }}
          onBlur={() => setDraft(null)}
        />
      </label>
      <label>
        Move
        <select value={end} onChange={(e) => setPick({ edge, end: e.target.value as OpeningEnd })}>
          {(["start", "end"] as OpeningEnd[]).map((e) => (
            <option key={e} value={e}>
              {endLabel(e)}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small hint-row">
        Slides along edge {nb + 1} ({edgeLength(site, nb).toFixed(2)} m)
        <Info>
          Slides that end along edge {nb + 1}, so the boundary line stays put. Drive and lawn corners follow.
          {edgesOf(site)[edge].kind === "open" && " Dragging an end of a selected opening does the same."}
        </Info>
      </p>
    </>
  );
}

// The plot panel below already shows the variant note and the house-to-boundary distances.
function EmptyInspector() {
  return (
    <div className="inspector">
      <h4>
        Site plan
        <Info>Click a boundary edge to set its fence, wall or hedge; click a surface or building to edit it. Corners snap to the house and to each other.</Info>
      </h4>
      <PlotPanel />
    </div>
  );
}

function Clearances({ clearances }: { clearances: ReturnType<typeof sideClearances> }) {
  if (!clearances.length) return null;
  return (
    <>
      <h4>
        House to boundary
        <Info>Shortest distance from each side of the house (any floor) to the boundary.</Info>
      </h4>
      <table className="site-clear">
        <tbody>
          {clearances.map((c) => (
            <tr key={c.side}>
              <td>{c.side[0].toUpperCase() + c.side.slice(1)}</td>
              <td>{c.distance < 0.05 ? "on the boundary" : `${c.distance.toFixed(2)} m`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * Pierced screen blocks let into the top of a wall, under its top course: none,
 * one row or two, along the whole edge or a stretch of it.
 */
function ScreenBlocks({ site, edge, setEdge }: { site: Site; edge: number; setEdge: (p: Partial<BoundaryEdge>) => void }) {
  const e = edgesOf(site)[edge];
  const n = site.boundary.length;
  const a = site.boundary[edge];
  const b = site.boundary[(edge + 1) % n];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const s = e.screen;
  const num = (v: string) => (Number.isFinite(parseFloat(v)) ? Math.max(0, parseFloat(v)) : undefined);
  const set = (p: Partial<ScreenPanel>) => setEdge({ screen: s ? { ...s, ...p } : undefined });
  const whole = !s || (s.from === undefined && s.length === undefined);
  return (
    <>
      <label>
        Screen blocks in the top
        <select
          value={s ? s.rows : 0}
          onChange={(ev) => {
            const rows = parseInt(ev.target.value, 10);
            setEdge({ screen: rows === 1 || rows === 2 ? { ...(s ?? {}), rows } : undefined });
          }}
        >
          <option value={0}>None</option>
          <option value={1}>One row (290 mm)</option>
          <option value={2}>Two rows (580 mm)</option>
        </select>
      </label>
      {s && (
        <>
          <label>
            Along
            <select value={whole ? "all" : "part"} onChange={(ev) => setEdge({ screen: ev.target.value === "all" ? { rows: s.rows } : { rows: s.rows, from: 0, length: Math.min(len, 1.16) } })}>
              <option value="all">The whole edge</option>
              <option value="part">Part of the edge</option>
            </select>
          </label>
          {!whole && (
            <div className="row">
              <label>
                From (m)
                <input type="number" step={0.05} min={0} max={len} value={s.from ?? 0} onChange={(ev) => set({ from: num(ev.target.value) ?? 0 })} />
              </label>
              <label>
                Length (m)
                <input type="number" step={0.29} min={0.29} max={len} value={s.length ?? len} onChange={(ev) => set({ length: num(ev.target.value) })} />
              </label>
            </div>
          )}
          <p className="muted small">
            {screenBand(e, len, e.top === "brick" ? 0.1025 : 0.06)
              ? "Whole 290 mm blocks under the top course, with brick below them; the wall is see-through there."
              : "No blocks fit: the wall needs at least 0.3 m of brick under them, and room for one block along the edge."}
          </p>
        </>
      )}
    </>
  );
}

const FOLLOW_LABEL: Record<WallFollow, string> = { level: "Level top", step: "Stepped in brick courses", rake: "Sloping with the ground" };

/**
 * How a wall's or fence's top meets sloping ground beside it: automatic (a wall
 * steps beside sloping ground, otherwise level), level, stepped or raked, and
 * for steps, how long each level run is.
 */
function FollowGround({ site, edge, setEdge }: { site: Site; edge: number; setEdge: (p: Partial<BoundaryEdge>) => void }) {
  const e = edgesOf(site)[edge];
  const [draft, setDraft] = useState<string | null>(null);
  const n = site.boundary.length;
  const ground = useMemo(
    () => groundAlong(site.boundary[edge], site.boundary[(edge + 1) % n], site.surfaces, polygonArea(site.boundary)),
    [site.boundary, site.surfaces, edge, n],
  );
  const auto = resolveFollow({ kind: e.kind }, ground);
  const follow = resolveFollow(e, ground);
  const hs = ground.map((g) => g.plot);
  const climb = hs.length ? Math.max(...hs) - Math.min(...hs) : 0;
  const steps = follow === "step" ? boundaryWallSegments(site.boundary, e, edge, site.surfaces).length - 1 : 0;
  return (
    <>
      <label>
        Top along the ground
        <select value={e.follow ?? "auto"} onChange={(ev) => setEdge({ follow: ev.target.value === "auto" ? undefined : (ev.target.value as WallFollow) })}>
          <option value="auto">Automatic ({FOLLOW_LABEL[auto].toLowerCase()})</option>
          {(Object.keys(FOLLOW_LABEL) as WallFollow[]).map((k) => (
            <option key={k} value={k}>
              {FOLLOW_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      {follow === "step" && (
        <label>
          Steps every (m)
          <input
            type="number"
            step={0.05}
            min={0.9}
            placeholder="auto"
            value={draft ?? (e.stepEvery !== undefined ? String(e.stepEvery) : "")}
            onChange={(ev) => {
              setDraft(ev.target.value);
              const v = parseFloat(ev.target.value);
              setEdge({ stepEvery: Number.isFinite(v) && v > 0 ? v : undefined });
            }}
            onBlur={() => setDraft(null)}
          />
        </label>
      )}
      <p className="muted small">
        {climb < 0.01
          ? "The ground beside it is level."
          : `The ground beside it climbs ${Math.round(climb * 1000)} mm.` +
            (follow === "step"
              ? ` ${steps === 0 ? "No step needed" : `${steps} step${steps > 1 ? "s" : ""} up`}. Leave "steps every" blank to step each time the ground climbs a 75 mm course, at least 0.9 m apart.`
              : "")}
      </p>
    </>
  );
}
