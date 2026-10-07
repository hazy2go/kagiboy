import { useEffect, useRef, useState } from "react";
import type { Key } from "../emu/gameboy";
import type { HeroScene } from "../landing/scene";
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

// which 3D part moves for each key
const PART: Record<Key, string> = {
  UP: "DPad",
  DOWN: "DPad",
  LEFT: "DPad",
  RIGHT: "DPad",
  A: "ButtonA",
  B: "ButtonB",
  START: "Start",
  SELECT: "Select",
};

// tap targets around projected parts, in millimetres on the console face
const ZONES: { key: Key; part: string; dx: number; dy: number; w: number; h: number; round?: boolean }[] = [
  { key: "UP", part: "DPad", dx: 0, dy: -6.9, w: 6.6, h: 7 },
  { key: "DOWN", part: "DPad", dx: 0, dy: 6.9, w: 6.6, h: 7 },
  { key: "LEFT", part: "DPad", dx: -6.9, dy: 0, w: 7, h: 6.6 },
  { key: "RIGHT", part: "DPad", dx: 6.9, dy: 0, w: 7, h: 6.6 },
  { key: "A", part: "ButtonA", dx: 0, dy: 0, w: 12, h: 12, round: true },
  { key: "B", part: "ButtonB", dx: 0, dy: 0, w: 12, h: 12, round: true },
  { key: "SELECT", part: "Select", dx: 0, dy: 0, w: 12, h: 7 },
  { key: "START", part: "Start", dx: 0, dy: 0, w: 12, h: 7 },
];

const A_TO_B_MM = 16.5; // distance between the A and B button centres

/** The real Game Boy model with the emulator on its screen; every button works. */
export function GameBoyShell() {
  const s = useSession();
  const canvas = useRef<HTMLCanvasElement>(null);
  const zoneRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sceneRef = useRef<HeroScene | null>(null);
  const [shaking, setShaking] = useState(false);
  const [ready, setReady] = useState(false);

  // 3D device + live screen
  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    const screen = document.createElement("canvas");
    screen.width = 160;
    screen.height = 144;
    s.attach(screen);

    const placeZones = (scene: HeroScene) => {
      const a = scene.project("ButtonA");
      const b = scene.project("ButtonB");
      if (!a || !b) return;
      const pxPerMm = Math.hypot(a.x - b.x, a.y - b.y) / A_TO_B_MM;
      ZONES.forEach((z, i) => {
        const el = zoneRefs.current[i];
        const at = scene.project(z.part);
        if (!el || !at) return;
        const w = z.w * pxPerMm;
        const h = z.h * pxPerMm;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.transform = `translate3d(${at.x + z.dx * pxPerMm - w / 2}px, ${at.y + z.dy * pxPerMm - h / 2}px, 0)`;
      });
    };

    (async () => {
      const { HeroScene } = await import("../landing/scene");
      if (disposed || !canvas.current) return;
      const scene = new HeroScene(canvas.current, {
        fixed: { az: -0.16, el: 0.05, dist: 0.39, tx: 0.002, ty: 0.004, lift: 0, tilt: 0, apart: 0, shift: 0 },
        plainFraming: true,
      });
      sceneRef.current = scene;
      const fit = () => {
        const r = canvas.current!.getBoundingClientRect();
        scene.resize(r.width, r.height);
      };
      fit();
      window.addEventListener("resize", fit);
      await scene.load("/3d/kagiboy.glb");
      if (disposed) return;
      scene.setScreen(screen);
      s.onFrame = () => scene.screenChanged();
      setReady(true);

      const loop = () => {
        raf = requestAnimationFrame(loop);
        scene.frame();
        placeZones(scene);
      };
      raf = requestAnimationFrame(loop);
      cleanup = () => {
        window.removeEventListener("resize", fit);
        s.onFrame = null;
        scene.dispose();
      };
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanup();
    };
  }, [s]);

  const press = (key: Key, down: boolean) => {
    s.key(key, down);
    sceneRef.current?.press(PART[key], down);
  };

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
      sceneRef.current?.press(PART[k], true);
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYBOARD[e.key];
      if (!k) return;
      s.key(k, false);
      sceneRef.current?.press(PART[k], false);
    };
    const blur = () => s.releaseAll();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [s]);

  // "Hold to shake": jitter the accelerometer while held
  useEffect(() => {
    sceneRef.current?.shake(shaking ? 1 : 0);
    if (!shaking) {
      s.chip.accel = { x: 0, y: 0 };
      return;
    }
    const id = setInterval(() => {
      s.chip.accel = { x: Math.round(Math.random() * 140 - 70), y: Math.round(Math.random() * 140 - 70) };
    }, 30);
    return () => clearInterval(id);
  }, [shaking, s]);

  // the phone's real accelerometer, when there is one
  useEffect(() => {
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null) return;
      s.chip.accel = { x: clamp(a.x * 12), y: clamp(a.y * 12) };
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [s]);

  const startShake = () => {
    // iOS asks once before it shares motion data
    const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (DME.requestPermission) DME.requestPermission().catch(() => {});
    setShaking(true);
  };

  return (
    <div className="device">
      <div className={`device-stage ${ready ? "is-ready" : ""}`}>
        <img className="device-still" src="/renders/front-ortho.webp" alt="" aria-hidden />
        <canvas ref={canvas} className="device-canvas" role="img" aria-label="Game Boy with the kagiboy cartridge" />
        {ZONES.map((z, i) => (
          <button
            key={z.key}
            ref={(el) => void (zoneRefs.current[i] = el)}
            className={`zone ${z.round ? "round" : ""}`}
            aria-label={z.key}
            onPointerDown={() => press(z.key, true)}
            onPointerUp={() => press(z.key, false)}
            onPointerLeave={() => press(z.key, false)}
            onPointerCancel={() => press(z.key, false)}
            onContextMenu={(e) => e.preventDefault()}
          />
        ))}
      </div>

      <div className="device-controls">
        {!s.powered ? (
          <button className="btn btn-ink" onClick={() => s.powerOn()}>
            Switch on
          </button>
        ) : (
          <>
            <button
              className={`btn btn-paper shake ${shaking ? "is-on" : ""}`}
              onPointerDown={startShake}
              onPointerUp={() => setShaking(false)}
              onPointerLeave={() => setShaking(false)}
            >
              Hold to shake
            </button>
            <button className="btn btn-paper" onClick={() => s.powerOff()}>
              Switch off
            </button>
            <button className="link" onClick={() => s.toggleMute()} aria-pressed={!s.muted}>
              {s.muted ? "Sound off" : "Sound on"}
            </button>
          </>
        )}
      </div>
      <p className="keys">
        Keys: arrows · <kbd>X</kbd> A · <kbd>Z</kbd> B · <kbd>Enter</kbd> Start · <kbd>Shift</kbd> Select
      </p>
    </div>
  );
}

function clamp(v: number) {
  return Math.max(-127, Math.min(127, Math.round(v)));
}
