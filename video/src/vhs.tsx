import type { ReactNode } from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";

/** A memory: 4:3 inside black, warm VHS grade, scanlines, grain, colour fringing and the deck's OSD. */
/** A memory: 4:3 inside black with a warm, soft tape grade. The real VHS overlay goes on top (Memory). */
export function Vhs({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill style={{ background: "#050505" }}>
      <div style={{ position: "absolute", left: 240, top: 0, width: 1440, height: 1080, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, filter: "saturate(0.78) contrast(1.06) sepia(0.22) brightness(1.03) blur(0.9px)" }}>{children}</div>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,0.5) 100%)" }} />
      </div>
    </AbsoluteFill>
  );
}

export const clip = (n: string) => staticFile(`b/${n}.mp4`);

/** A stock clip filling its frame, starting `from` seconds in, with a slow push. */
export function Clip({ name, from = 0, push = 0.06, dur }: { name: string; from?: number; push?: number; dur: number }) {
  const f = useCurrentFrame();
  const s = 1 + interpolate(f, [0, dur], [0, push]);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <OffthreadVideo src={clip(name)} startFrom={Math.round(from * 30)} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${s})` }} />
    </AbsoluteFill>
  );
}

/** A still photo filling its frame, with a slow push. */
export function Photo({ src, dur, pos = "50% 50%", push = 0.08, zoom = 1, origin = "50% 50%" }: { src: string; dur: number; pos?: string; push?: number; zoom?: number; origin?: string }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: pos, transform: `scale(${zoom + interpolate(f, [0, dur], [0, push])})`, transformOrigin: origin }} />
    </AbsoluteFill>
  );
}
