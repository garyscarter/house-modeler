import "./mobile.css";
import { useStore } from "../../store";
import { MODES, MODE_ICON, MODE_LABEL } from "../../lib/modes";
import { Icon } from "../icons";
import { useSheet } from "./sheet";

/** The five modes as a bottom tab bar (the phone chassis). Switching mode keeps the sheet where it is, except a full one, which drops to half. */
export function TabBar() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  return (
    <nav className="tab-bar" aria-label="Mode">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          data-mode={m}
          className={mode === m ? "active" : ""}
          aria-current={mode === m ? "page" : undefined}
          onClick={() => {
            const sheet = useSheet.getState();
            if (sheet.detent === "full") sheet.set("half");
            setMode(m);
          }}
        >
          <Icon name={MODE_ICON[m]} size={24} />
          <span>{MODE_LABEL[m]}</span>
        </button>
      ))}
    </nav>
  );
}
