import { ask } from "../Dialogs";

/**
 * A hairline, then a ghost button for a destructive action: no fill, danger-coloured
 * text, a red outline on hover. It always asks first.
 */
export function DangerZone({
  label,
  question,
  ok = "Delete",
  onConfirm,
  disabled,
}: {
  /** Button text, e.g. "Delete room". */
  label: string;
  /** The confirmation question, e.g. "Delete Kitchen?". */
  question: string;
  ok?: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="danger-zone">
      <button
        type="button"
        className="danger-ghost"
        disabled={disabled}
        onClick={async () => {
          if (await ask(question, { ok, danger: true })) onConfirm();
        }}
      >
        {label}
      </button>
    </div>
  );
}
