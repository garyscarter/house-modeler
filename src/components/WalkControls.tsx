import { useCallback, useEffect, useRef, useState } from "react";
import type { Floor } from "../types";
import type { WalkInput } from "../three/Walker";
import "./WalkControls.css";

export interface WalkSettings {
  /** Eye height above the floor, metres. */
  eye: number;
  /** Walking speed, metres per second. */
  speed: number;
}

const DEFAULTS: WalkSettings = { eye: 1.6, speed: 1.4 };
const KEY = "house-modeler.walk";

/** Eye height and speed, remembered per browser (a viewing preference, not part of the house). */
export function useWalkSettings(): [WalkSettings, (p: Partial<WalkSettings>) => void] {
  const [settings, setSettings] = useState<WalkSettings>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<WalkSettings>) } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });
  const update = useCallback((p: Partial<WalkSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Private mode or blocked storage: the setting just won't stick.
      }
      return next;
    });
  }, []);
  return [settings, update];
}

/**
 * The walk overlay: exit, floor and settings at the top right, a hint, and
 * on touch screens a joystick at the bottom left.
 */
export function WalkControls({
  input,
  settings,
  onSettings,
  coarse,
  locked,
  floors,
  floorId,
  onFloor,
  onExit,
}: {
  input: WalkInput;
  settings: WalkSettings;
  onSettings: (p: Partial<WalkSettings>) => void;
  coarse: boolean;
  locked: boolean;
  floors: Floor[];
  floorId: string;
  onFloor: (id: string) => void;
  onExit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(true);
  return (
    <>
      <div className="walk-bar">
        <button className="walk-exit" onClick={onExit}>
          Exit walk
        </button>
        {floors.length > 1 && (
          <select
            className="walk-floor"
            value={floorId}
            onChange={(e) => {
              onFloor(e.target.value);
              // Hand the arrow keys back to walking.
              e.target.blur();
            }}
            aria-label="Floor"
          >
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
        <button className={open ? "active" : ""} onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Eye height and speed">
          ⚙
        </button>
        {open && (
          <div className="walk-settings">
            <label>
              Eye height <b>{settings.eye.toFixed(2)} m</b>
              <input type="range" min={1} max={2} step={0.05} value={settings.eye} onChange={(e) => onSettings({ eye: parseFloat(e.target.value) })} />
            </label>
            <label>
              Speed <b>{settings.speed.toFixed(1)} m/s</b>
              <input type="range" min={0.5} max={3} step={0.1} value={settings.speed} onChange={(e) => onSettings({ speed: parseFloat(e.target.value) })} />
            </label>
            <button className="link" onClick={() => onSettings(DEFAULTS)}>
              Reset
            </button>
          </div>
        )}
      </div>
      {hint && !locked && (
        <div className={coarse ? "walk-hint touch" : "walk-hint"} onPointerDown={() => setHint(false)}>
          {coarse ? (
            <span>Drag to look around, use the joystick to move, double-tap a spot to go there.</span>
          ) : (
            <span>
              Drag to look, or click to steer with the mouse (<b>Esc</b> releases it). <b>WASD</b> or arrows to move, <b>Shift</b> to run. Double-click a
              spot to go there.
            </span>
          )}
          <button className="walk-hint-close" onClick={() => setHint(false)} aria-label="Hide hint">
            ×
          </button>
        </div>
      )}
      {coarse && <Joystick input={input} onUse={() => setHint(false)} />}
    </>
  );
}

/** A thumb stick: drag the knob; its offset from the centre is the walking direction and pace. */
function Joystick({ input, onUse }: { input: WalkInput; onUse: () => void }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);

  const set = (clientX: number, clientY: number) => {
    const r = base.current!.getBoundingClientRect();
    const radius = r.width / 2;
    let dx = clientX - (r.left + radius);
    let dy = clientY - (r.top + radius);
    const d = Math.hypot(dx, dy);
    if (d > radius) {
      dx = (dx / d) * radius;
      dy = (dy / d) * radius;
    }
    knob.current!.style.transform = `translate(${dx}px, ${dy}px)`;
    input.joy.x = dx / radius;
    input.joy.y = -dy / radius;
  };
  const release = () => {
    active.current = null;
    knob.current!.style.transform = "";
    input.joy.x = 0;
    input.joy.y = 0;
  };
  // Leaving walk mode mid-drag must not leave the walker moving next time.
  useEffect(
    () => () => {
      input.joy.x = 0;
      input.joy.y = 0;
    },
    [input],
  );

  return (
    <div
      ref={base}
      className="walk-joy"
      onPointerDown={(e) => {
        e.preventDefault();
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e.clientX, e.clientY);
        onUse();
      }}
      onPointerMove={(e) => {
        if (active.current === e.pointerId) set(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => active.current === e.pointerId && release()}
      onPointerCancel={(e) => active.current === e.pointerId && release()}
      aria-label="Move"
    >
      <div ref={knob} className="walk-knob" />
    </div>
  );
}
