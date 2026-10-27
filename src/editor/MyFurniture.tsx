import { useEffect, useMemo, useState } from "react";
import { VARIANT_LABEL, type Fixture, type MyPiece, type VariantKey } from "../types";
import { byId, CATALOGUE, SCOPE_CATEGORIES } from "../lib/catalogue";
import { pieceWhereabouts, whereaboutsLine } from "../lib/myFurniture";
import { useStore } from "../store";
import { ask } from "../components/Dialogs";
import { SwatchField } from "../components/inspector";
import "./MyFurniture.css";

let pendingPlace: string | null = null;

/** Ask the plan to start placing a piece (it may not be mounted yet, so the id is also held until it is). */
export function requestPlace(id: string) {
  pendingPlace = id;
  window.dispatchEvent(new CustomEvent("house:place-piece", { detail: id }));
}

/** The piece waiting to be placed, if any; reading it clears it. */
export function takePendingPlace(): string | null {
  const id = pendingPlace;
  pendingPlace = null;
  return id;
}

/** Open the piece form: for a new piece, or to edit the piece with this id. */
export const openPieceForm = (id?: string) => window.dispatchEvent(new CustomEvent("house:add-piece", { detail: id ? { id } : {} }));

const toCm = (m: number) => String(Math.round(m * 1000) / 10);
const parseCm = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** Name, kind, measured size, colour and note of one piece. */
export function PieceForm({ initial, onSave, onCancel }: { initial?: MyPiece; onSave: (p: Omit<MyPiece, "id">) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState(initial?.kind ?? "sofa-3");
  const [w, setW] = useState(initial ? toCm(initial.w) : "");
  const [d, setD] = useState(initial ? toCm(initial.d) : "");
  const [h, setH] = useState(initial ? toCm(initial.h) : "");
  const [color, setColor] = useState(initial?.color ?? byId(initial?.kind ?? "sofa-3")?.color ?? "#888888");
  const [colorSet, setColorSet] = useState(!!initial?.color);
  const [note, setNote] = useState(initial?.note ?? "");
  const [tried, setTried] = useState(false);

  const pickKind = (id: string) => {
    setKind(id);
    const b = byId(id);
    if (!b) return;
    // Pre-fill sizes only where nothing is typed yet; a colour only until the owner picks one.
    if (!w) setW(toCm(b.w));
    if (!d) setD(toCm(b.d));
    if (!h) setH(toCm(b.h));
    if (!colorSet) setColor(b.color);
  };
  const nums = { w: parseCm(w) / 100, d: parseCm(d) / 100, h: parseCm(h) / 100 };
  const sizeOk = [nums.w, nums.d, nums.h].every((n) => n > 0 && n <= 10);
  const ok = name.trim().length > 0 && sizeOk;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTried(true);
    if (!ok) return;
    onSave({ name: name.trim(), kind, ...nums, color: colorSet ? color : undefined, note: note.trim() || undefined });
  };
  const bad = (v: number) => tried && !(v > 0 && v <= 10);
  return (
    <form className="piece-form" onSubmit={submit} onKeyDown={(e) => e.stopPropagation()}>
      <label>
        Name
        <input autoFocus value={name} placeholder="Our sofa" aria-invalid={tried && !name.trim()} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Draws as
        <select value={kind} onChange={(e) => pickKind(e.target.value)}>
          {SCOPE_CATEGORIES.furnish.map((c) => (
            <optgroup key={c} label={c}>
              {CATALOGUE.filter((i) => i.category === c).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="piece-sizes">
        <label>
          Width (cm)
          <input inputMode="decimal" value={w} aria-invalid={bad(nums.w)} onChange={(e) => setW(e.target.value)} />
        </label>
        <label>
          Depth (cm)
          <input inputMode="decimal" value={d} aria-invalid={bad(nums.d)} onChange={(e) => setD(e.target.value)} />
        </label>
        <label>
          Height (cm)
          <input inputMode="decimal" value={h} aria-invalid={bad(nums.h)} onChange={(e) => setH(e.target.value)} />
        </label>
      </div>
      {tried && !sizeOk && <p className="small warn">Enter all three sizes in centimetres.</p>}
      {tried && !name.trim() && <p className="small warn">Give the piece a name.</p>}
      <SwatchField
        label="Colour"
        value={color}
        isSet={colorSet}
        onChange={(c) => {
          setColor(c);
          setColorSet(true);
        }}
      />
      <label>
        Note
        <input value={note} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row">
        <button type="submit" className="primary">
          Save piece
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const sizeLine = (p: MyPiece) => `${toCm(p.w)} × ${toCm(p.d)} × ${toCm(p.h)} cm`;

/** The "My furniture" list in the Furnish panel, with the form for adding and editing. */
export function MyFurnitureList() {
  const pieces = useStore((s) => s.pieces);
  const variants = useStore((s) => s.variants);
  const active = useStore((s) => s.activeVariant);
  const addPiece = useStore((s) => s.addPiece);
  const updatePiece = useStore((s) => s.updatePiece);
  const removePiece = useStore((s) => s.removePiece);
  const setMode = useStore((s) => s.setMode);
  const setUi = useStore((s) => s.setUi);
  const [form, setForm] = useState<{ id?: string } | null>(null);
  const where = useMemo(() => pieceWhereabouts(variants, pieces), [variants, pieces]);

  useEffect(() => {
    const open = (e: Event) => setForm((e as CustomEvent<{ id?: string } | undefined>).detail ?? {});
    window.addEventListener("house:add-piece", open);
    return () => window.removeEventListener("house:add-piece", open);
  }, []);

  const place = (id: string) => {
    setMode("furnish");
    setUi({ tab: "plan" });
    requestPlace(id);
  };
  const del = async (p: MyPiece) => {
    const n = (["current", "proposed"] as VariantKey[]).reduce((t, k) => t + (where[p.id]?.[k]?.count ?? 0), 0);
    const msg = n ? `Delete ‘${p.name}’? Its ${n} placement${n === 1 ? "" : "s"} stay${n === 1 ? "s" : ""} as plain items.` : `Delete ‘${p.name}’?`;
    if (await ask(msg, { ok: "Delete", danger: true })) removePiece(p.id);
  };
  const editing = form?.id ? pieces.find((p) => p.id === form.id) : undefined;
  const other: VariantKey = active === "current" ? "proposed" : "current";

  // Nothing owned yet: the picker's "Mine" category explains and adds pieces. (The form still opens from "Edit piece".)
  if (pieces.length === 0 && !form) return null;
  return (
    <div className="my-furniture">
      <h4>My furniture</h4>
      {pieces.map((p) => {
        const here = where[p.id]?.[active];
        const there = where[p.id]?.[other];
        return (
          <div key={p.id} className="piece-row">
            <div className="piece-head">
              <strong>{p.name}</strong>
              <span className="muted small">{sizeLine(p)}</span>
            </div>
            <div className="small" title={here?.places.join("\n")}>
              {whereaboutsLine(here?.count ?? 0)}
              {there && (
                <span className="muted">
                  {" "}
                  · {VARIANT_LABEL[other]}: {whereaboutsLine(there.count).toLowerCase()}
                </span>
              )}
            </div>
            <div className="row">
              <button onClick={() => place(p.id)}>Place</button>
              <button onClick={() => setForm({ id: p.id })}>Edit</button>
              <button onClick={() => void del(p)}>Delete</button>
            </div>
          </div>
        );
      })}
      {form ? (
        <PieceForm
          key={form.id ?? "new"}
          initial={editing}
          onCancel={() => setForm(null)}
          onSave={(p) => {
            if (editing) updatePiece(editing.id, p);
            else addPiece(p);
            setForm(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Link shown in the fixture inspector for a placement of one of the owner's pieces. */
export function PieceLink({ fixture }: { fixture: Fixture }) {
  const piece = useStore((s) => s.pieces.find((p) => p.id === fixture.piece));
  const variants = useStore((s) => s.variants);
  const activeVariant = useStore((s) => s.activeVariant);
  const removeLink = (id: string) => {
    // Unlink just this placement: clear its piece field in the active layout.
    const m = variants[activeVariant];
    if (!m) return;
    const floors = m.floors.map((f) => (f.fixtures?.some((x) => x.id === id) ? { ...f, fixtures: f.fixtures.map((x) => (x.id === id ? { ...x, piece: undefined } : x)) } : f));
    useStore.getState().updateModel(activeVariant, { floors });
  };
  if (!fixture.piece) return null;
  if (!piece) return <p className="muted small">From a deleted piece.</p>;
  return (
    <p className="muted small">
      Your own piece: {piece.name}. Its size and colour follow the piece.{" "}
      <button className="link" onClick={() => openPieceForm(piece.id)}>
        Edit piece
      </button>{" "}
      <button className="link" onClick={() => removeLink(fixture.id)}>
        Unlink
      </button>
    </p>
  );
}

/** Review section: each piece with where it stands in both layouts. */
export function MyFurnitureReview() {
  const pieces = useStore((s) => s.pieces);
  const variants = useStore((s) => s.variants);
  const where = useMemo(() => pieceWhereabouts(variants, pieces), [variants, pieces]);
  const cell = (id: string, k: VariantKey) => {
    const w = where[id]?.[k];
    if (!w) return <span className="muted">No layout</span>;
    return (
      <>
        <span className={w.count === 0 ? "muted" : w.count > 1 ? "warn" : undefined}>{whereaboutsLine(w.count)}</span>
        {w.places.length > 0 && <div className="muted small">{w.places.join("; ")}</div>}
      </>
    );
  };
  return (
    <table className="rp-table my-furniture-review">
      <thead>
        <tr>
          <th>Piece</th>
          <th>Size</th>
          <th>{VARIANT_LABEL.current}</th>
          <th>{VARIANT_LABEL.proposed}</th>
        </tr>
      </thead>
      <tbody>
        {pieces.map((p) => (
          <tr key={p.id}>
            <td>{p.name}</td>
            <td>{sizeLine(p)}</td>
            <td>{cell(p.id, "current")}</td>
            <td>{cell(p.id, "proposed")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
