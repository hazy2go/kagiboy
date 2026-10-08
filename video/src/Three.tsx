import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { HeroScene, type Pose } from "../../web/src/landing/scene";

export type Shot = {
  /** progress along the website's choreography (0 hero, 0.3 turned, 0.44 lifted, 0.52 apart, 0.84 screen) */
  p: (t: number) => number;
  /** optional explicit camera/cartridge pose, overriding the choreography */
  pose?: (t: number) => Partial<Pose>;
  /** ROM screen(s) on the LCD; which one shows at time t */
  screen?: (t: number) => string;
  /** console centred (plain) or pushed right to leave room for words on the left */
  plain?: boolean;
  /** buttons held at time t (DPad, ButtonA, ButtonB, Start, Select) */
  held?: (t: number) => string[];
};

const BUTTONS = ["DPad", "ButtonA", "ButtonB", "Start", "Select"];

/** The real kagiboy model, rendered by the website's own scene, one deterministic frame at a time. */
export function Console({ shot, screens }: { shot: Shot; screens: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<HeroScene | null>(null);
  const imgs = useRef<Record<string, HTMLImageElement>>({});
  const shown = useRef("");
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("3d model"));
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  useEffect(() => {
    const c = canvas.current!;
    const s = new HeroScene(c, { offline: true, plainFraming: !!shot.plain });
    s.resize(width, height);
    scene.current = s;
    const loads = screens.map(
      (n) =>
        new Promise<void>((res) => {
          const im = new Image();
          im.onload = () => res();
          im.onerror = () => res();
          im.src = staticFile(`a/04-gameboy-screens/${n}.png`);
          imgs.current[n] = im;
        }),
    );
    Promise.all([s.load(staticFile("kagiboy.glb")), ...loads]).then(() => {
      setReady(true);
      continueRender(handle);
    });
    return () => s.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const s = scene.current;
    if (!ready || !s) return;
    const t = f / fps;
    const want = shot.screen?.(t);
    if (want && want !== shown.current && imgs.current[want]) {
      s.setScreen(imgs.current[want]);
      shown.current = want;
    }
    const down = shot.held?.(t) ?? [];
    for (const b of BUTTONS) s.press(b, down.includes(b));
    s.renderAt(shot.p(t), t, shot.pose?.(t));
  });

  return <canvas ref={canvas} width={width} height={height} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}
