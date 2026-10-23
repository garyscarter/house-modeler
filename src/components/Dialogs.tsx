import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import "./Dialogs.css";

/**
 * In-app confirm and text prompts. The browser's own confirm() and prompt()
 * are blocked in some embedded viewers and look out of place on an iPad, so
 * the app asks through this instead.
 */
type Request =
  | { kind: "confirm"; message: string; ok: string; danger: boolean; resolve: (v: boolean) => void }
  | { kind: "prompt"; message: string; value: string; resolve: (v: string | null) => void }
  | { kind: "choose"; message: string; choices: string[]; resolve: (v: number | null) => void };

const useDialog = create<{ req: Request | null }>(() => ({ req: null }));

/** Cancel whatever is open (a new question replaces it). */
function cancelOpen() {
  const open = useDialog.getState().req;
  if (!open) return;
  if (open.kind === "confirm") open.resolve(false);
  else open.resolve(null);
}

/** Offer several buttons (the first is the default); resolves with the index chosen, or null when dismissed. */
export function choose(message: string, choices: string[]): Promise<number | null> {
  cancelOpen();
  return new Promise((resolve) => useDialog.setState({ req: { kind: "choose", message, choices, resolve } }));
}

/** Ask a yes/no question; resolves true when confirmed. */
export function ask(message: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  cancelOpen();
  return new Promise((resolve) => useDialog.setState({ req: { kind: "confirm", message, ok: opts.ok ?? "OK", danger: opts.danger ?? false, resolve } }));
}

/** Ask for a line of text; resolves null when cancelled. */
export function askText(message: string, value = ""): Promise<string | null> {
  cancelOpen();
  return new Promise((resolve) => useDialog.setState({ req: { kind: "prompt", message, value, resolve } }));
}

export function Dialogs() {
  const req = useDialog((s) => s.req);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const okButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!req) return;
    if (req.kind === "prompt") {
      setText(req.value);
      requestAnimationFrame(() => input.current?.select());
    } else requestAnimationFrame(() => okButton.current?.focus());
  }, [req]);

  // Esc cancels even when focus is outside the dialog. Capture phase, and preventDefault so no other layer also closes.
  const cancelRef = useRef<() => void>(() => {});
  const open = !!req;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      cancelRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!req) return null;
  const close = (ok: boolean) => {
    useDialog.setState({ req: null });
    if (req.kind === "confirm") req.resolve(ok);
    else if (req.kind === "choose") req.resolve(null);
    else req.resolve(ok ? text : null);
  };
  cancelRef.current = () => close(false);
  const pick = (i: number) => {
    useDialog.setState({ req: null });
    if (req.kind === "choose") req.resolve(i);
  };
  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close(false)}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={req.message}
        onSubmit={(e) => {
          e.preventDefault();
          close(true);
        }}
      >
        <p>{req.message}</p>
        {req.kind === "prompt" && <input id="dialog-text" ref={input} value={text} onChange={(e) => setText(e.target.value)} />}
        {req.kind === "choose" ? (
          <div className="dialog-buttons stacked">
            {req.choices.map((c, i) => (
              <button key={c} ref={i === 0 ? okButton : undefined} type="button" className={i === 0 ? "primary" : undefined} onClick={() => pick(i)}>
                {c}
              </button>
            ))}
          </div>
        ) : (
          <div className="dialog-buttons">
            <button type="button" onClick={() => close(false)}>
              Cancel
            </button>
            <button ref={okButton} type="submit" className={req.kind === "confirm" && req.danger ? "danger-fill" : "primary"}>
              {req.kind === "confirm" ? req.ok : "OK"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
