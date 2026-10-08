import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// the website's world: white, soft pastel light, ink type (docs/PITCH-DECK-BRIEF.md)
export const C = {
  ink: "#1F2330",
  ink2: "#535A6D",
  ink3: "#666C80",
  blue: "#CFE2FF",
  pink: "#FFDCE8",
  lav: "#E6E0FF",
  accent: "#3B6FE0",
  line: "rgba(31,35,48,0.12)",
};
export const DISPLAY = "'Funnel Display', 'Funnel Sans', system-ui, sans-serif";
export const SANS = "'Funnel Sans', system-ui, sans-serif";
export const PX = "'Pixel Operator', ui-monospace, monospace";
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const a = (p: string) => staticFile(`a/${p}`);

/** 0→1 over `dur` frames from `start`, eased like the site */
export function useIn(start = 0, dur = 18) {
  const f = useCurrentFrame();
  return interpolate(f, [start, start + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
}

/** 1→0 over the last `dur` frames of a sequence that is `total` long */
export function useOut(total: number, dur = 12) {
  const f = useCurrentFrame();
  return interpolate(f, [total - dur, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

export function Pop({ start = 0, children, style, y = 24, blur = true }: { start?: number; children: ReactNode; style?: CSSProperties; y?: number; blur?: boolean }) {
  const t = useIn(start, 20);
  return (
    <div style={{ opacity: t, transform: `translateY(${(1 - t) * y}px)`, filter: blur ? `blur(${(1 - t) * 8}px)` : undefined, ...style }}>{children}</div>
  );
}

/** The site's background: white with slow pastel glows */
export function Glow({ shift = 0 }: { shift?: number }) {
  const f = useCurrentFrame();
  const d = Math.sin((f + shift) / 90) * 3;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(42% 46% at ${72 + d}% ${40 - d}%, rgba(207,226,255,0.9), transparent 70%),
          radial-gradient(38% 40% at ${86 - d}% ${72 + d}%, rgba(255,220,232,0.85), transparent 70%),
          radial-gradient(30% 34% at ${18 + d}% ${82 - d}%, rgba(230,224,255,0.7), transparent 72%), #ffffff`,
      }}
    />
  );
}

export function Eyebrow({ children, color = C.accent }: { children: ReactNode; color?: string }) {
  return <div style={{ fontFamily: PX, fontSize: 26, letterSpacing: 6, textTransform: "uppercase", color }}>{children}</div>;
}

export function Title({ children, size = 96, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size, lineHeight: 1.02, letterSpacing: -size * 0.04, color: C.ink, ...style }}>{children}</div>
  );
}

// the LCD inside gameboy-front.png (900×1600), measured from the render
const LCD = { x: 214, y: 345, w: 463, h: 417 };

/** The front render with a real ROM screen in its LCD. `height` sets the size. */
export function GameBoy({ screens, at = 0, height = 900, style, overlay }: { screens: string[]; at?: number; height?: number; style?: CSSProperties; overlay?: ReactNode }) {
  const k = height / 1600;
  return (
    <div style={{ position: "relative", width: 900 * k, height, filter: "drop-shadow(0 40px 60px rgba(60,70,120,0.22))", ...style }}>
      <Img src={a("01-renders/gameboy-front.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", left: LCD.x * k, top: LCD.y * k, width: LCD.w * k, height: LCD.h * k, overflow: "hidden", background: "#E4EBD8" }}>
        {screens.map((s, i) => (
          <Img
            key={s}
            src={a(`04-gameboy-screens/${s}.png`)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "pixelated", opacity: interpolate(at, [i - 0.5, i, i + 0.5], [0, 1, i === screens.length - 1 ? 1 : 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}
          />
        ))}
        {overlay}
      </div>
    </div>
  );
}

/** Subtitles: each sentence from the moment it's spoken (word timings of the recording) */
export function Captions({ cues, from, end }: { cues: { t: number; text: string }[]; from: number; end: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (f - from) / fps;
  let shown = "";
  cues.forEach((c, i) => {
    const until = cues[i + 1]?.t ?? end + 0.4;
    if (t >= c.t && t < until) shown = c.text;
  });
  if (!shown) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 56, pointerEvents: "none" }}>
      {/* fansub style: soft yellow with a thin dark outline, readable on any shot, no box */}
      <div style={{ maxWidth: 1500, textAlign: "center", fontFamily: SANS, fontWeight: 600, fontSize: 40, lineHeight: 1.3, color: "#FFE45C", WebkitTextStroke: "5px rgba(12,12,16,0.92)", paintOrder: "stroke fill", textShadow: "0 3px 10px rgba(0,0,0,0.45)", padding: "0 24px" }}>
        {shown}
      </div>
    </AbsoluteFill>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 28, boxShadow: "0 1px 2px rgba(31,35,48,0.05), 0 24px 48px -30px rgba(60,70,120,0.35)", ...style }}>{children}</div>
  );
}

export function useSpring(start = 0) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - start, fps, config: { damping: 200 } });
}
