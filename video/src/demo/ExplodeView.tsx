import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ExplodeScene, type ExplodeAnchor } from "../../../web/src/landing/explode";

export type ExplodeView = { az: number; el: number; zoom: number; cx: number; cy: number; cz: number };

/**
 * The isometric exploded view (web/src/landing/explode.ts), one deterministic frame at a time.
 * `labels` gets the on-screen position of each anchor for the current frame, so callouts follow
 * the parts they name.
 */
export function Explode({
  p,
  view,
  anchors,
  labels,
}: {
  p: (t: number) => number;
  view: (t: number) => ExplodeView;
  anchors: ExplodeAnchor[];
  labels: (at: Record<string, { x: number; y: number }>, t: number) => ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<ExplodeScene | null>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("exploded view"));
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = f / fps;

  useEffect(() => {
    const s = new ExplodeScene(canvas.current!, width, height);
    scene.current = s;
    const img = new Image();
    const screen = new Promise<void>((res) => {
      img.onload = () => res();
      img.onerror = () => res();
      img.src = staticFile("a/04-gameboy-screens/01-boot.png");
    });
    Promise.all([s.load(staticFile("kagiboy.glb")), screen]).then(() => {
      s.setScreen(img);
      setReady(true);
      continueRender(handle);
    });
    return () => s.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pose first (so the projections below match this frame), render after the DOM settles
  let at: Record<string, { x: number; y: number }> = {};
  if (ready && scene.current) {
    scene.current.pose(p(t), view(t));
    at = Object.fromEntries(anchors.map((a) => [a, scene.current!.project(a)]));
  }
  useLayoutEffect(() => {
    if (ready) scene.current?.render();
  });

  return (
    <>
      <canvas ref={canvas} width={width} height={height} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      {ready && labels(at, t)}
    </>
  );
}
