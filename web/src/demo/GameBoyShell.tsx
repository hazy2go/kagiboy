import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import brand from "../../../brand.json";
import type { Key } from "../emu/gameboy";
import { useSession } from "./session";

const KEYBOARD: Record<string, Key> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  x: "A",
  X: "A",
  z: "B",
  Z: "B",
  Enter: "START",
  Shift: "SELECT",
  Backspace: "SELECT",
};

export function GameBoyShell() {
  const s = useSession();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shaking, setShaking] = useState(false);
  const drag = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    if (canvas.current) s.attach(canvas.current);
  }, [s]);

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return t?.tagName === "INPUT" || t?.tagName === "TEXTAREA";
    };
    const down = (e: KeyboardEvent) => {
      const k = KEYBOARD[e.key];
      if (!k || isTyping(e)) return;
      e.preventDefault();
      s.key(k, true);
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYBOARD[e.key];
      if (k) s.key(k, false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [s]);

  // "Shake" button: jitter the accelerometer while held.
  useEffect(() => {
    if (!shaking) {
      s.chip.accel = { x: 0, y: 0 };
      return;
    }
    const id = setInterval(() => {
      s.chip.accel = { x: Math.round(Math.random() * 140 - 70), y: Math.round(Math.random() * 140 - 70) };
    }, 30);
    return () => clearInterval(id);
  }, [shaking, s]);

  // Real accelerometer on phones.
  useEffect(() => {
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null) return;
      s.chip.accel = { x: clamp(a.x * 12), y: clamp(a.y * 12) };
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [s]);

  // Dragging the console around also feeds the accelerometer.
  const onBodyMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const now = performance.now();
    const dt = Math.max(now - drag.current.t, 1);
    s.chip.accel = {
      x: clamp(((e.clientX - drag.current.x) / dt) * 40),
      y: clamp(((e.clientY - drag.current.y) / dt) * 40),
    };
    drag.current = { x: e.clientX, y: e.clientY, t: now };
  };

  const startShake = async () => {
    // iOS asks once before it shares motion data
    const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (DME.requestPermission) DME.requestPermission().catch(() => {});
    setShaking(true);
  };

  return (
    <div className="gb-stage">
      <div className={`cart-slot ${s.powered ? "inserted" : ""}`} aria-hidden>
        <div className="cart">
          <div className="cart-label">
            <span>{brand.name}</span>
            <small>SOL · EVM</small>
          </div>
        </div>
      </div>
      <div
        className={`gb ${shaking ? "shake" : ""}`}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { x: e.clientX, y: e.clientY, t: performance.now() };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={onBodyMove}
        onPointerUp={() => {
          drag.current = null;
          s.chip.accel = { x: 0, y: 0 };
        }}
      >
        <div className="gb-top">
          <button className={`power ${s.powered ? "on" : ""}`} onClick={() => (s.powered ? s.powerOff() : s.powerOn())}>
            ◀ OFF · ON ▶
          </button>
        </div>
        <div className="bezel">
          <div className="bezel-stripes">
            <span>DOT MATRIX · KEY CHIP INSIDE</span>
          </div>
          <div className="screen-row">
            <div className="led-wrap">
              <span className={`led ${s.powered ? "on" : ""}`} />
              <small>BATTERY</small>
            </div>
            <canvas ref={canvas} width={160} height={144} className="screen" />
          </div>
        </div>
        <div className="wordmark">{brand.name}</div>

        <div className="controls">
          <div className="dpad">
            <PadButton k="UP" className="up" />
            <PadButton k="LEFT" className="left" />
            <PadButton k="RIGHT" className="right" />
            <PadButton k="DOWN" className="down" />
            <span className="dpad-center" />
          </div>
          <div className="ab">
            <PadButton k="B" className="btn-b" label="B" />
            <PadButton k="A" className="btn-a" label="A" />
          </div>
        </div>
        <div className="start-select">
          <PadButton k="SELECT" className="pill" label="SELECT" />
          <PadButton k="START" className="pill" label="START" />
        </div>
        <div className="speaker" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>

      <div className="gb-help">
        {!s.powered ? (
          <button className="primary" onClick={() => s.powerOn()}>
            Switch on
          </button>
        ) : (
          <button
            className={`shake-btn ${shaking ? "active" : ""}`}
            onPointerDown={startShake}
            onPointerUp={() => setShaking(false)}
            onPointerLeave={() => setShaking(false)}
          >
            Hold to shake
          </button>
        )}
        <p>
          Keys: arrows · <kbd>X</kbd> A · <kbd>Z</kbd> B · <kbd>Enter</kbd> Start · <kbd>Shift</kbd> Select
        </p>
      </div>
    </div>
  );
}

function PadButton({ k, className, label }: { k: Key; className: string; label?: string }) {
  const s = useSession();
  const press = (down: boolean) => () => s.key(k, down);
  return (
    <button
      className={className}
      aria-label={k}
      onPointerDown={press(true)}
      onPointerUp={press(false)}
      onPointerLeave={press(false)}
      onPointerCancel={press(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label && <span>{label}</span>}
    </button>
  );
}

function clamp(v: number) {
  return Math.max(-127, Math.min(127, Math.round(v)));
}
