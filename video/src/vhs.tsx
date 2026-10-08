import type { ReactNode } from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import { PX } from "./ui";

/** A memory: 4:3 inside black, warm VHS grade, scanlines, grain, colour fringing and the deck's OSD. */
export function Vhs({ children, osd = "PLAY ▶", stamp }: { children: ReactNode; osd?: string; stamp?: string }) {
  const f = useCurrentFrame();
  // the picture breathes a little, like a worn tape
  const jitter = (random(`j${Math.floor(f / 2)}`) - 0.5) * 2;
  const roll = (f * 3) % 1080;
  return (
    <AbsoluteFill style={{ background: "#050505" }}>
      <div style={{ position: "absolute", left: 240, top: 0, width: 1440, height: 1080, overflow: "hidden" }}>
        {/* red and blue fringes under the picture */}
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${3 + jitter}px)`, mixBlendMode: "screen", opacity: 0.55, filter: "sepia(1) saturate(6) hue-rotate(-40deg)" }}>{children}</div>
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${-3 - jitter}px)`, mixBlendMode: "screen", opacity: 0.45, filter: "sepia(1) saturate(6) hue-rotate(170deg)" }}>{children}</div>
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${jitter * 0.6}px)`, filter: "saturate(0.72) contrast(1.08) sepia(0.28) brightness(1.04) blur(0.7px)" }}>{children}</div>
        {/* scanlines */}
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 2px, transparent 2px 4px)" }} />
        {/* a soft tracking band rolling down */}
        <div style={{ position: "absolute", left: 0, right: 0, top: roll - 60, height: 60, background: "linear-gradient(transparent, rgba(255,255,255,0.08), transparent)" }} />
        {/* grain */}
        <svg width="1440" height="1080" style={{ position: "absolute", inset: 0, opacity: 0.18, mixBlendMode: "overlay" }}>
          <filter id={`g${f}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f % 97} />
          </filter>
          <rect width="100%" height="100%" filter={`url(#g${f})`} />
        </svg>
        {/* vignette */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
        <div style={{ position: "absolute", left: 56, top: 44, fontFamily: PX, fontSize: 40, color: "#f4f4f4", textShadow: "2px 2px 0 rgba(0,0,0,0.6)", letterSpacing: 4 }}>{osd}</div>
        {stamp && <div style={{ position: "absolute", right: 56, bottom: 44, fontFamily: PX, fontSize: 34, color: "#f4f4f4", textShadow: "2px 2px 0 rgba(0,0,0,0.6)", letterSpacing: 3 }}>{stamp}</div>}
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
