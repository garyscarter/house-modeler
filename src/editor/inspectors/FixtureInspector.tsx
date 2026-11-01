import { useMemo } from "react";
import { NumberField, SwatchField } from "../../components/inspector";
import { NavButton } from "../../components/ReadOnly";
import type { Fixture, LightWarmth, VariantKey } from "../../types";
import { FRAME_LABEL, PICTURE_SIZES, PRINTS, isPicture, pictureSize, pictureSizeOf, type Orientation, type PictureFrame } from "../../lib/art";
import { RUG_PATTERNS, rugPattern } from "../../lib/rugs";
import { DEFAULT_WORKTOP, MAX_GRID, MIN_SEAT, dropOf, gridOf, isCeilingItem, TV_SIZES, byId, chaiseSizes, cornerSofaSizes, hasSeatDepth, hasWorktop, isCornerUnit, isTv, mountOf, tvInches, tvSize, type CatalogueItem } from "../../lib/catalogue";
import { useModel, useStore } from "../../store";
import { DEFAULT_CUSHION, isJoinery, joineryOf, patchJoinery, shelfStack, shelfStackPatch } from "../../lib/joinery";
import { JOINERY_FRONT_LABEL, SEAT_FRONT_LABEL, type JoineryFront, type SeatFront } from "../../types";
import { Info } from "../../components/Info";
import { WARMTHS, WARMTH_LABEL, dimOf, isLightItem, switchedOn, warmthOf, gridCounts } from "../../lib/lights";
import { assignToCircuit, centreHeight, circuitOf, isSwitchItem, isWallPoint, mountForCentre, gangCount, gangLabel, gangOf, numberPoints, pointKind, setGang, toggleLink } from "../../lib/electrics";
import type { Circuit } from "../../types";
import { fixtureBox, turn } from "../../lib/planMath";
import { PieceLink } from "../MyFurniture";

/** Print, size, orientation and frame of a framed picture. */
function PictureFields({ fixture, item, locked, onChange }: { fixture: Fixture; item: CatalogueItem; locked?: boolean; onChange: (p: Partial<Fixture>) => void }) {
  const w = fixture.w ?? item.w;
  const h = fixture.h ?? item.h;
  const std = pictureSizeOf(w, h);
  const orientation: Orientation = std?.orientation ?? (h >= w ? "portrait" : "landscape");
  const turn = (o: Orientation) => {
    if (o === orientation) return;
    onChange({ w: h, h: w });
  };
  return (
    <>
      <label>
        Print
        <select value={fixture.print ?? PRINTS[0].id} disabled={locked} onChange={(e) => onChange({ print: e.target.value })}>
          {PRINTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Size
        <select
          value={std?.id ?? "custom"}
          disabled={locked}
          onChange={(e) => {
            const size = pictureSize(e.target.value, orientation);
            if (size) onChange(size);
          }}
        >
          {PICTURE_SIZES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {!std && <option value="custom">Custom ({(w * 100).toFixed(0)} × {(h * 100).toFixed(0)} cm)</option>}
        </select>
      </label>
      <label>
        Hung
        <select value={orientation} disabled={locked} onChange={(e) => turn(e.target.value as Orientation)}>
          <option value="portrait">Portrait (tall)</option>
          <option value="landscape">Landscape (wide)</option>
        </select>
      </label>
      <label>
        Frame
        <select value={fixture.frame ?? "black"} disabled={locked} onChange={(e) => onChange({ frame: e.target.value as PictureFrame })}>
          {(Object.keys(FRAME_LABEL) as PictureFrame[]).map((k) => (
            <option key={k} value={k}>
              {FRAME_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function FixtureInspector({
  fixture,
  item,
  clash,
  groupSize,
  onSelectGroup,
  onChange,
  onDuplicate,
  onCopy,
  onPaste,
  onRemove,
  onRefit,
  misfit,
  ceiling,
  variant,
}: {
  fixture: Fixture;
  item: CatalogueItem;
  /** The layout the fixture is in: enables the circuit field of electrical points. */
  variant?: VariantKey;
  /** The room's ceiling height, for floor-to-ceiling items. */
  ceiling?: number;
  clash: boolean;
  /** Members of the group this item belongs to (shown when it was picked alone). */
  groupSize?: number;
  onSelectGroup?: () => void;

  onChange: (p: Partial<Fixture>) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  /** Present when the clipboard holds something to paste. */
  onPaste?: () => void;
  onRemove: () => void;
  /** Re-run the fit (recess or window); present for built-ins and window seats. */
  onRefit?: () => void;
  /** Why a fitted unit no longer fits its recess or window. */
  misfit?: string;
}) {
  const resized = fixture.w !== undefined || fixture.d !== undefined || fixture.h !== undefined;
  const rot = Math.round(fixture.rot) % 360;
  const locked = !!fixture.locked;
  return (
    <div className="inspector fixture-inspector">
      <h4>{item.name}</h4>
      {fixture.piece && <PieceLink fixture={fixture} />}
      <div className="row">
        <button className={locked ? "active" : ""} aria-pressed={locked} onClick={() => onChange({ locked: !fixture.locked || undefined })} title="Locked items can be selected but not moved, turned or resized on the plan">
          {locked ? "Unlock" : "Lock position"}
        </button>
      </div>
      {locked && <p className="muted small">Locked: unlock to move or resize.</p>}
      {item.note && <p className="muted small">{item.note}</p>}
      {clash && <p className="small warn">Overlaps another item.</p>}
      {misfit && <p className="small warn">{misfit}</p>}
      {groupSize !== undefined && groupSize > 1 && onSelectGroup && (
        <p className="muted small">
          Part of a group of {groupSize} ·{" "}
          <NavButton className="link" onClick={onSelectGroup}>
            Select group
          </NavButton>
        </p>
      )}
      <label>
        Label
        <input value={fixture.label ?? ""} placeholder="Shown on the plan" onChange={(e) => onChange({ label: e.target.value || undefined })} />
      </label>
      {isTv(item) && (
        <label>
          Screen size
          <select
            value={tvInches(fixture.w ?? item.w) ?? "custom"}
            disabled={locked}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n) onChange(tvSize(item, n));
            }}
          >
            {TV_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} inch
              </option>
            ))}
            {tvInches(fixture.w ?? item.w) === undefined && <option value="custom">Custom ({((fixture.w ?? item.w) / 0.0254 / Math.cos(Math.atan(9 / 16))).toFixed(0)} inch)</option>}
          </select>
        </label>
      )}
      <div className="field">
        <span className="field-label">Width × depth × height (m)</span>
        <div className="size-row">
          <NumberField value={fixture.w ?? item.w} label="Width" disabled={locked} onCommit={(w) => onChange({ w })} />
          <NumberField value={fixture.d ?? item.d} label="Depth" disabled={locked} onCommit={(d) => onChange({ d })} />
          <NumberField value={fixtureBox(fixture, item, ceiling).h} label="Height" disabled={locked} onCommit={(h) => onChange({ h })} />
        </div>
        {resized && (
          <button className="link" disabled={locked} onClick={() => onChange({ w: undefined, d: undefined, h: undefined })}>
            Reset to {item.w.toFixed(2)} × {item.d.toFixed(2)} × {item.toCeiling && ceiling ? `${ceiling.toFixed(2)} (the ceiling)` : item.h.toFixed(2)} m
          </button>
        )}
      </div>
      {isPicture(item) && <PictureFields fixture={fixture} item={item} locked={locked} onChange={onChange} />}
      {isCornerUnit(item) && (
        <label>
          Front
          <select value={fixture.front ?? "flat"} disabled={locked} onChange={(e) => onChange({ front: e.target.value === "curved" ? "curved" : undefined })}>
            <option value="flat">Flat diagonal</option>
            <option value="curved">Curved</option>
          </select>
        </label>
      )}
      {isCornerUnit(item) && (
        <div className="field">
          <span className="field-label">
            Square ends, back leg × side leg (m)
            <Info>How far out from each wall the front starts, so the unit can sit square against a chimney breast or an alcove unit. 0 runs the front wall to wall.</Info>
          </span>
          <div className="size-row">
            <NumberField value={fixture.endBack ?? 0} label="Square end on the back leg" min={0} disabled={locked} onCommit={(v) => onChange({ endBack: v > 0 ? v : undefined })} />
            <NumberField value={fixture.endSide ?? 0} label="Square end on the side leg" min={0} disabled={locked} onCommit={(v) => onChange({ endSide: v > 0 ? v : undefined })} />
          </div>
        </div>
      )}
      {hasSeatDepth(item) && (
        <div className="field">
          <span className="field-label">Seat depth (m)</span>
          <NumberField
            value={(item.symbol === "corner-sofa" ? cornerSofaSizes : chaiseSizes)(fixture.w ?? item.w, fixture.d ?? item.d, fixture.seat).s}
            label="Seat depth"
            min={MIN_SEAT}
            disabled={locked}
            onCommit={(seat) => onChange({ seat })}
          />
          {fixture.seat !== undefined && (
            <button className="link" disabled={locked} onClick={() => onChange({ seat: undefined })}>
              Reset to the size's own
            </button>
          )}
        </div>
      )}
      {item.mount !== undefined && !isCeilingItem(item) && !pointKind(item) && (
        <div className="field">
          <span className="field-label">Height above floor (m)</span>
          <NumberField value={mountOf(fixture, item)} label="Height above floor" min={0} onCommit={(mount) => onChange({ mount: Math.max(0, mount) })} />
          {fixture.mount !== undefined && fixture.mount !== item.mount && (
            <button className="link" onClick={() => onChange({ mount: undefined })}>
              Reset to {item.mount.toFixed(2)} m
            </button>
          )}
        </div>
      )}
      {isCeilingItem(item) && (
        <div className="field">
          <span className="field-label">Drop below ceiling (m)</span>
          <NumberField value={dropOf(fixture, item)} label="Drop below ceiling" min={0} onCommit={(drop) => onChange({ drop: Math.max(0, drop) })} />
          {fixture.drop !== undefined && fixture.drop !== dropOf({}, item) && (
            <button className="link" onClick={() => onChange({ drop: undefined })}>
              Reset to {dropOf({}, item).toFixed(2)} m
            </button>
          )}
        </div>
      )}
      {item.symbol === "downlight-grid" && <GridFields fixture={fixture} item={item} onChange={onChange} />}
      {pointKind(item) && <PointFields fixture={fixture} item={item} ceiling={ceiling} locked={locked} variant={variant} onChange={onChange} />}
      {(isLightItem(item) || isSwitchItem(item)) && (
        <div className="row check-row">
          <label className="check">
            <input type="checkbox" checked={switchedOn(fixture)} onChange={(e) => onChange({ on: e.target.checked ? undefined : false })} /> Switched on
          </label>
          <Info>{isSwitchItem(item) ? "A switch that is off darkens the lights it controls." : "Lit when the sun study's Lights master allows: Auto lights it from dusk, On always."}</Info>
        </div>
      )}
      {isLightItem(item) && (
        <>
          <label>
            Warmth
            <select value={warmthOf(fixture)} disabled={locked} onChange={(e) => { const v = parseInt(e.target.value); onChange({ warmth: v === 2700 ? undefined : (v as LightWarmth) }); }}>
              {WARMTHS.map((k) => (
                <option key={k} value={k}>
                  {WARMTH_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dimmer {Math.round(dimOf(fixture) * 100)}%
            <input type="range" min={10} max={100} step={5} disabled={locked} value={Math.round(dimOf(fixture) * 100)} onChange={(e) => { const v = parseInt(e.target.value); onChange({ dim: v === 100 ? undefined : v }); }} />
          </label>
        </>
      )}
      {item.symbol === "rug" && (
        <label>
          Pattern
          <select value={rugPattern(fixture) ?? ""} disabled={locked} onChange={(e) => onChange({ rug: e.target.value || undefined })}>
            <option value="">Plain</option>
            {RUG_PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!(item.symbol === "rug" && rugPattern(fixture)) && (
        <SwatchField dulux={item.id.startsWith("wardrobe")} label="Colour" value={fixture.color ?? item.color} isSet={!!fixture.color} onChange={(color) => onChange({ color })} onReset={() => onChange({ color: undefined })} />
      )}
      {(isJoinery(item) || item.symbol === "shaker-wardrobe") && <JoineryFields fixture={fixture} item={item} ceiling={ceiling} locked={locked} onChange={onChange} onRefit={onRefit} />}
      {hasWorktop(item) && (
        <SwatchField
          label="Worktop colour"
          value={fixture.worktop ?? DEFAULT_WORKTOP}
          isSet={!!fixture.worktop}
          onChange={(worktop) => onChange({ worktop })}
          onReset={() => onChange({ worktop: undefined })}
        />
      )}
      <label>
        Rotation {rot}°
        <input type="range" min={0} max={345} step={15} disabled={locked} value={Math.round(rot / 15) * 15} onChange={(e) => onChange({ rot: parseInt(e.target.value) })} />
      </label>
      <div className="row">
        <button disabled={locked} onClick={() => onChange({ rot: turn(fixture.rot, 90) })} title="R">
          Rotate 90°
        </button>
        <button onClick={onDuplicate} title="Ctrl+D or Cmd+D">
          Duplicate
        </button>
        <button onClick={onCopy} title="Ctrl+C or Cmd+C: copy, then paste on any floor or layout">
          Copy
        </button>
        {onPaste && (
          <button onClick={onPaste} title="Ctrl+V or Cmd+V">
            Paste
          </button>
        )}
        <button className="danger" onClick={onRemove} title="Delete">
          Remove
        </button>
      </div>
      <p className="muted small hint-row">
        Moving furniture
        <Info>Drag to move; near a wall its back snaps to the wall (hold Alt to place freely). Click it again to pick the item under it. R turns 90°, Shift+R 15°.</Info>
      </p>
    </div>
  );
}

const CEILING_DEFAULT = 2.4;

/** Circuit choice for one or more points; "Mixed" when they differ. */
function CircuitSelect({ variant, ids }: { variant: VariantKey; ids: string[] }) {
  const circuits = useStore((s) => s.variants[variant]?.circuits);
  const updateModel = useStore((s) => s.updateModel);
  const current = new Set(ids.map((id) => circuitOf(circuits, id)?.id ?? ""));
  const value = current.size === 1 ? [...current][0] : "mixed";
  return (
    <label>
      Circuit
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === "mixed") return;
          updateModel(variant, { circuits: assignToCircuit(circuits, e.target.value || null, ids) });
        }}
      >
        {value === "mixed" && <option value="mixed">Mixed</option>}
        <option value="">None</option>
        {(circuits ?? []).map((c: Circuit) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Settings of an electrical point: centre height, switch links and circuit. */
function PointFields({ fixture, item, ceiling, locked, variant, onChange }: { fixture: Fixture; item: CatalogueItem; ceiling?: number; locked: boolean; variant?: VariantKey; onChange: (p: Partial<Fixture>) => void }) {
  const model = useModel();
  const linkSwitchId = useStore((s) => s.linkSwitchId);
  const setUi = useStore((s) => s.setUi);
  const wall = isWallPoint(item) && item.mount !== undefined;
  const centre = centreHeight(fixture, item, ceiling ?? CEILING_DEFAULT);
  const defaultCentre = (item.mount ?? 0) + item.h / 2;
  const linkGang = useStore((s) => s.linkGang);
  const gangs = isSwitchItem(item) ? gangCount(item) : 0;
  const labels = useMemo(() => {
    if (!isSwitchItem(item) || !model) return new Map<string, string>();
    return new Map(numberPoints(model).map((p) => [p.fx.id, `${p.room.name} ${p.label}`]));
  }, [model, item]);
  const unlink = (lightId: string, g: number) => onChange(toggleLink(fixture, lightId, g));
  const gangBlock = (g: number, heading: boolean) => {
    const linking = linkSwitchId === fixture.id && linkGang === g;
    const lights = gangOf(fixture, g).controls.flatMap((id) => (labels.has(id) ? [{ id, label: labels.get(id)! }] : []));
    return (
      <div className="field" key={g}>
        <span className="field-label">{heading ? gangLabel(g) : "Lights"}</span>
        {heading && (
          <label className="check">
            <input type="checkbox" checked={gangOf(fixture, g).on} disabled={locked} onChange={(e) => onChange(setGang(fixture, g, { on: e.target.checked }))} />
            Switched on
          </label>
        )}
        {lights.length === 0 ? (
          <p className="muted small">No lights linked yet.</p>
        ) : (
          <ul className="multi-list small link-list">
            {lights.map((l) => (
              <li key={l.id}>
                {l.label}{" "}
                <button className="link" aria-label={`Unlink ${l.label}`} title="Unlink" onClick={() => unlink(l.id, g)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className={linking ? "active" : ""} aria-pressed={linking} onClick={() => setUi(linking ? { linkSwitchId: null, linkGang: 0 } : { linkSwitchId: fixture.id, linkGang: g })}>
          {linking ? "Done" : "Link lights"}
        </button>
        {linking && <p className="muted small">{heading ? "Tap lights on the plan to put them on this rocker, or tap again to take them off." : "Tap lights on the plan to link or unlink them."}</p>}
      </div>
    );
  };
  return (
    <>
      {wall && (
        <div className="field">
          <span className="field-label">Centre height (m)</span>
          <NumberField value={Math.round(centre * 1000) / 1000} label="Centre height" min={0} disabled={locked} onCommit={(c) => onChange({ mount: mountForCentre(c, fixture, item) })} />
          {Math.abs(centre - defaultCentre) > 0.0005 && (
            <button className="link" disabled={locked} onClick={() => onChange({ mount: undefined })}>
              Reset to {defaultCentre.toFixed(2)} m
            </button>
          )}
        </div>
      )}
      {Array.from({ length: gangs }, (_, g) => gangBlock(g, gangs > 1))}
      {variant && <CircuitSelect variant={variant} ids={[fixture.id]} />}
    </>
  );
}

const FRONT_OPTIONS = Object.keys(JOINERY_FRONT_LABEL) as JoineryFront[];
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Settings of fitted joinery: built-ins, window seats, wall boxes and floating-shelf stacks. */
function JoineryFields({
  fixture,
  item,
  ceiling,
  locked,
  onChange,
  onRefit,
}: {
  fixture: Fixture;
  item: CatalogueItem;
  ceiling?: number;
  locked: boolean;
  onChange: (p: Partial<Fixture>) => void;
  onRefit?: () => void;
}) {
  const box = fixtureBox(fixture, item, ceiling);
  const j = joineryOf(fixture, item, box);
  const set = (p: Parameters<typeof patchJoinery>[1]) => onChange(patchJoinery(fixture, p));
  const sym = item.symbol;
  const colourField = (label: string, value: string, isSet: boolean, change: (c: string) => void, reset: () => void) => (
    <SwatchField label={label} value={value} isSet={isSet} onChange={change} onReset={reset} dulux />
  );
  const frontSelect = (label: string, value: JoineryFront, change: (v: JoineryFront) => void, openLabel?: string) => (
    <label>
      {label}
      <select value={value} onChange={(e) => change(e.target.value as JoineryFront)}>
        {FRONT_OPTIONS.map((f) => (
          <option key={f} value={f}>
            {f === "open" && openLabel ? openLabel : JOINERY_FRONT_LABEL[f]}
          </option>
        ))}
      </select>
    </label>
  );
  const baysField = (
    <div className="field">
      <span className="field-label">Bays</span>
      <NumberField value={j.bays} label="Bays" step={1} min={1} max={12} onCommit={(v) => set({ bays: Math.round(Math.min(12, Math.max(1, v))) })} />
      {fixture.joinery?.bays !== undefined && (
        <button className="link" onClick={() => set({ bays: undefined })}>
          Auto
        </button>
      )}
    </div>
  );
  const shakerColours = (
    <>
      {colourField("Trim colour", j.trim ?? fixture.color ?? item.color, j.trim !== undefined, (c) => set({ trim: c }), () => set({ trim: undefined }))}
      {colourField("Panel colour", j.panel ?? fixture.color ?? item.color, j.panel !== undefined, (c) => set({ panel: c }), () => set({ panel: undefined }))}
    </>
  );
  const toCeiling = fixture.h === undefined || (ceiling !== undefined && fixture.h >= ceiling);
  const refitLabel =
    (fixture.joinery?.fit ?? (sym === "window-seat" ? "window" : undefined)) === "window" ? "Fit to window" : fixture.joinery?.fit ? "Refit to recess" : "Fit to recess";
  return (
    <>
      {sym === "built-in" && (
        <>
          {baysField}
          <div className="field">
            <span className="field-label">Base height (m)</span>
            <NumberField value={j.baseH} label="Base height" min={0} onCommit={(v) => set({ baseH: Math.max(0, v) })} />
            <small className="muted">0 = no base cupboards.</small>
          </div>
          {j.baseH > 0 && frontSelect("Base fronts", j.baseFront, (v) => set({ baseFront: v }))}
          {j.baseH > 0 && (
            <label>
              <input type="checkbox" checked={j.top} onChange={(e) => set({ top: e.target.checked })} /> Top on the base
            </label>
          )}
          <label>
            <input type="checkbox" checked={j.plinth} onChange={(e) => set({ plinth: e.target.checked })} /> Plinth
          </label>
          <div className="field">
            <span className="field-label">Shelves above</span>
            <NumberField value={j.shelves} label="Shelves above" step={1} min={0} max={12} onCommit={(v) => set({ shelves: Math.round(Math.min(12, Math.max(0, v))) })} />
          </div>
          {frontSelect("Above the base", j.upperFront, (v) => set({ upperFront: v }), "Open shelves")}
          <div className="field">
            <span className="field-label">Shelf depth above (m)</span>
            <NumberField value={j.upperD} label="Shelf depth above" onCommit={(v) => set({ upperD: v })} />
            {fixture.joinery?.upperD !== undefined && (
              <button className="link" onClick={() => set({ upperD: undefined })}>
                Full depth
              </button>
            )}
          </div>
          <div className="field">
            <span className="field-label">Top box (m)</span>
            <NumberField value={j.topBox} label="Top box" min={0} onCommit={(v) => set({ topBox: Math.max(0, v) })} />
            <small className="muted">0 = none.</small>
          </div>
          {item.toCeiling && (
            <label>
              <input
                type="checkbox"
                checked={toCeiling}
                disabled={locked}
                onChange={(e) => onChange({ h: e.target.checked ? undefined : round2(Math.min(2.1, (ceiling ?? 2.4) - 0.15)) })}
              />{" "}
              To ceiling
            </label>
          )}
          {colourField("Carcass colour", j.carcass, fixture.joinery?.carcass !== undefined, (c) => set({ carcass: c }), () => set({ carcass: undefined }))}
          {(j.baseFront === "shaker" || j.upperFront === "shaker") && shakerColours}
          {j.top && colourField("Top colour", j.topColor, fixture.worktop !== undefined, (c) => onChange({ worktop: c }), () => onChange({ worktop: undefined }))}
        </>
      )}
      {sym === "shaker-wardrobe" && shakerColours}
      {sym === "window-seat" && (
        <>
          <label>
            Front
            <select value={j.seatFront} onChange={(e) => set({ seatFront: e.target.value as SeatFront })}>
              {(Object.keys(SEAT_FRONT_LABEL) as SeatFront[]).map((f) => (
                <option key={f} value={f}>
                  {SEAT_FRONT_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={j.plinth} onChange={(e) => set({ plinth: e.target.checked })} /> Plinth
          </label>
          <label>
            <input type="checkbox" checked={j.backCushion} onChange={(e) => set({ backCushion: e.target.checked })} /> Back cushions
          </label>
          {colourField("Cushion colour", j.cushion, fixture.joinery?.cushion !== undefined && fixture.joinery.cushion !== DEFAULT_CUSHION, (c) => set({ cushion: c }), () => set({ cushion: undefined }))}
        </>
      )}
      {sym === "wall-box" && (
        <>
          {frontSelect("Front", j.front, (v) => set({ front: v }))}
          {baysField}
          <div className="field">
            <span className="field-label">Shelves inside</span>
            <NumberField value={j.shelves} label="Shelves inside" step={1} min={0} max={12} onCommit={(v) => set({ shelves: Math.round(Math.min(12, Math.max(0, v))) })} />
          </div>
        </>
      )}
      {sym === "shelf" &&
        (() => {
          const st = shelfStack(j, box.h);
          return (
            <>
              <div className="field">
                <span className="field-label">Shelves</span>
                <NumberField value={st.n} label="Shelves" step={1} min={1} max={12} onCommit={(n) => onChange(shelfStackPatch(fixture, item, { n }))} />
              </div>
              {st.n > 1 && (
                <div className="field">
                  <span className="field-label">Spacing (m)</span>
                  <NumberField value={st.spacing} label="Spacing" onCommit={(spacing) => onChange(shelfStackPatch(fixture, item, { spacing }))} />
                </div>
              )}
              <div className="field">
                <span className="field-label">Thickness (m)</span>
                <NumberField value={st.t} label="Thickness" onCommit={(t) => onChange(shelfStackPatch(fixture, item, { t }))} />
              </div>
              <p className="muted small">Height is the whole stack.</p>
            </>
          );
        })()}
      {onRefit && (
        <div className="row">
          <button disabled={locked} onClick={onRefit}>
            {refitLabel}
          </button>
          <Info>Puts its back on the nearest wall and sizes it between the side walls (a window seat to its window). It doesn't follow later wall changes; refit after moving walls.</Info>
        </div>
      )}
    </>
  );
}

/** Two or more pieces of furniture selected (often one group): list them and act on all together. */
export function MultiFixtureInspector({
  fixtures,
  isGroup,
  onPick,
  onGroup,
  onUngroup,
  onTurn,
  onDuplicate,
  onCopy,
  onRemove,
  onColour,
  onLock,
  variant,
}: {
  /** The layout the items are in: enables the circuit field when every item is an electrical point. */
  variant?: VariantKey;
  fixtures: Fixture[];
  /** The selection is exactly one group. */
  isGroup: boolean;
  onPick: (id: string) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onTurn: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onRemove: () => void;
  onColour: (color: string) => void;
  /** Lock (true) or unlock (false) every selected item. */
  onLock: (on: boolean) => void;
}) {
  const anyGrouped = fixtures.some((f) => f.groupId);
  const first = fixtures[0];
  const firstItem = first ? byId(first.type) : undefined;
  return (
    <div className="inspector fixture-inspector">
      <h4>{isGroup ? `Group · ${fixtures.length} items` : `${fixtures.length} items`}</h4>
      <ul className="multi-list small">
        {fixtures.map((f) => (
          <li key={f.id}>
            <button className="link" onClick={() => onPick(f.id)} title="Select just this one">
              {f.label ?? byId(f.type)?.name ?? "Item"}
            </button>
          </li>
        ))}
      </ul>
      <SwatchField label="Colour" value={first?.color ?? firstItem?.color ?? "#cccccc"} isSet={!!first?.color} onChange={onColour} />
      {variant && fixtures.length > 0 && fixtures.every((f) => { const it = byId(f.type); return !!it && !!pointKind(it); }) && <CircuitSelect variant={variant} ids={fixtures.map((f) => f.id)} />}
      <div className="row">
        {!isGroup && (
          <button onClick={onGroup} title="Ctrl+G or Cmd+G">
            Group
          </button>
        )}
        {anyGrouped && (
          <button onClick={onUngroup} title="Ctrl+Shift+G or Cmd+Shift+G">
            Ungroup
          </button>
        )}
        <button onClick={() => onLock(!fixtures.every((f) => f.locked))} title="Locked items can be selected but not moved or turned on the plan">
          {fixtures.every((f) => f.locked) ? "Unlock all" : "Lock all"}
        </button>
        <button disabled={fixtures.some((f) => f.locked)} onClick={onTurn} title="R">
          Turn 90°
        </button>
        <button onClick={onDuplicate} title="Ctrl+D or Cmd+D">
          Duplicate
        </button>
        <button onClick={onCopy} title="Ctrl+C or Cmd+C">
          Copy
        </button>
        <button className="danger" onClick={onRemove} title="Delete">
          Remove
        </button>
      </div>
      <p className="muted small hint-row">
        Moving several
        <Info>Drag any of them to move the lot. R turns them about their centre. Shift+click adds or removes an item; Ctrl/Cmd+click picks one item inside a group.</Info>
      </p>
    </div>
  );
}

/**
 * A downlight grid's layout: how many across and down (blank = as many as the spacing fits, the placeholder says how
 * many that is), and the spacing, which is set by hand until a count is given and then follows from the grid's size.
 */
function GridFields({ fixture, item, onChange }: { fixture: Fixture; item: CatalogueItem; onChange: (patch: Partial<Fixture>) => void }) {
  const grid = gridOf(fixture, item);
  const w = fixture.w ?? item.w, d = fixture.d ?? item.d;
  const auto = gridCounts(w, d, { pitch: grid.pitch });
  const counted = grid.cols !== undefined || grid.rows !== undefined;
  const { cols, rows } = gridCounts(w, d, grid);
  const count = (key: "cols" | "rows") => (v: number) => onChange({ [key]: Math.min(MAX_GRID, Math.max(1, Math.round(v))) });
  return (
    <>
      <div className="field">
        <span className="field-label">Downlights (across × down)</span>
        <div className="size-row">
          <NumberField value={grid.cols} placeholder={String(auto.cols)} label="Across" step={1} min={1} max={MAX_GRID} onCommit={count("cols")} onClear={() => onChange({ cols: undefined })} />
          <NumberField value={grid.rows} placeholder={String(auto.rows)} label="Down" step={1} min={1} max={MAX_GRID} onCommit={count("rows")} onClear={() => onChange({ rows: undefined })} />
        </div>
      </div>
      <div className="field">
        <span className="field-label">Spacing (m)</span>
        {counted ? (
          <span className="muted small">
            {(w / cols).toFixed(2)} across, {(d / rows).toFixed(2)} down, from the count and the grid's size
          </span>
        ) : (
          <NumberField value={grid.pitch} label="Spacing" min={0.3} onCommit={(pitch) => onChange({ pitch: Math.max(0.3, pitch) })} />
        )}
      </div>
    </>
  );
}
