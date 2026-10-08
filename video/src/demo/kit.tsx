import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, DISPLAY, EASE, GameBoy, PX, SANS } from "../ui";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";
export const PINK = "#C8406A";
export const GREEN = "#1F7A48";

export type Mark = { at: number; text: string };
export type P = { dur: number; marks?: Mark[] };

/** sentence `i` of the voice line, in scene seconds */
export const markSec = (marks: Mark[] = []) => (i: number, fallback = 0) => (marks[i]?.at ?? fallback * 30) / 30;

/* ------------------------------------------------------------------ recordings */

/** The /demo recordings: a 1920×1640 page (CSS px), captured at 2×. */
export const PAGE = { w: 1920, h: 1640 };
export const EXPLORER = { w: 1920, h: 1080 };

/** where things sit on the /demo page (CSS px) */
export const AT = {
  lcd: { x: 684, y: 393, w: 190, h: 174 },
  phone: { x: 1205, y: 299, w: 346, h: 686 },
  busLog: { x: 818, y: 1198, w: 708, h: 300 },
};

/** camera framings on the /demo page: x, y and width of the region that fills the frame */
export const CAM = {
  top: { x: 150, y: 40, w: 1620 },
  duo: { x: 330, y: 236, w: 1500 },
  codes: { x: 600, y: 300, w: 1060 },
};

export type Cam = { t: number; x: number; y: number; w: number; h?: number };
/** a take's time in scene seconds: from `at`, play the take from `from` at `rate` */
export type Seg = { at: number; from: number; rate?: number };

function camAt(cams: Cam[], t: number): Omit<Cam, "t"> {
  if (t <= cams[0].t) return cams[0];
  for (let i = 0; i < cams.length - 1; i++) {
    const a = cams[i];
    const b = cams[i + 1];
    if (t < b.t) {
      const p = EASE((t - a.t) / (b.t - a.t));
      const mix = (u: number, v: number) => u + (v - u) * p;
      return { x: mix(a.x, b.x), y: mix(a.y, b.y), w: mix(a.w, b.w), h: a.h !== undefined && b.h !== undefined ? mix(a.h, b.h) : undefined };
    }
  }
  return cams[cams.length - 1];
}

/** the camera's transform for a box: page px → box px */
export function useCamera(cams: Cam[], box: { w: number; h: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = camAt(cams, f / fps);
  const h = c.h ?? (c.w * box.h) / box.w;
  const s = Math.max(box.w / c.w, box.h / h);
  const ox = (box.w - c.w * s) / 2 - c.x * s;
  const oy = (box.h - h * s) / 2 - c.y * s;
  return { s, ox, oy, to: (x: number, y: number) => ({ x: ox + x * s, y: oy + y * s }) };
}

/** A recording, framed by a moving camera, cut into time segments. */
export function Rec({
  src,
  segs,
  cams,
  page = PAGE,
  box = { w: 1920, h: 1080 },
  radius = 0,
  style,
}: {
  src: string;
  segs: Seg[];
  cams: Cam[];
  page?: { w: number; h: number };
  box?: { w: number; h: number };
  radius?: number;
  style?: CSSProperties;
}) {
  const { fps } = useVideoConfig();
  const { s, ox, oy } = useCamera(cams, box);
  return (
    <div style={{ position: "relative", width: box.w, height: box.h, overflow: "hidden", borderRadius: radius, background: "#fff", ...style }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: page.w, height: page.h, transform: `translate(${ox}px, ${oy}px) scale(${s})`, transformOrigin: "0 0" }}>
        <Segments src={src} segs={segs} fps={fps} style={{ width: page.w, height: page.h }} />
      </div>
    </div>
  );
}

function Segments({ src, segs, fps, style }: { src: string; segs: Seg[]; fps: number; style: CSSProperties }) {
  return (
    <>
      {segs.map((g, i) => {
        const next = segs[i + 1]?.at;
        const from = Math.round(g.at * fps);
        return (
          <Sequence key={i} from={from} durationInFrames={next === undefined ? undefined : Math.max(1, Math.round(next * fps) - from)} layout="none">
            <OffthreadVideo src={staticFile(src)} trimBefore={Math.round(g.from * fps)} playbackRate={g.rate ?? 1} muted style={{ display: "block", position: "absolute", inset: 0, ...style }} />
          </Sequence>
        );
      })}
    </>
  );
}

/** The phone from the /demo page on its own, as a portrait panel. */
export function PhoneCrop({ src, segs, height = 900, style }: { src: string; segs: Seg[]; height?: number; style?: CSSProperties }) {
  const r = AT.phone;
  const k = height / r.h;
  return (
    <div style={{ filter: "drop-shadow(0 30px 50px rgba(60,70,120,0.25))", ...style }}>
      <Rec src={src} segs={segs} cams={[{ t: 0, ...r }]} box={{ w: r.w * k, h: height }} radius={46 * k} style={{ background: "transparent" }} />
    </div>
  );
}

/** The Game Boy render with the emulator's own 160×144 LCD frames in its screen (pixel-perfect). */
export function LcdGameBoy({ src, segs, height = 900, style }: { src: string; segs: Seg[]; height?: number; style?: CSSProperties }) {
  const { fps } = useVideoConfig();
  return (
    <GameBoy
      screens={[]}
      height={height}
      style={style}
      overlay={<Segments src={src} segs={segs} fps={fps} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />}
    />
  );
}

/** Just the LCD, big, in the console's grey bezel. */
export function LcdPanel({ src, segs, width = 900, style, children }: { src: string; segs: Seg[]; width?: number; style?: CSSProperties; children?: ReactNode }) {
  const { fps } = useVideoConfig();
  const h = (width * 144) / 160;
  const pad = width * 0.07;
  return (
    <div
      style={{
        position: "relative",
        padding: pad,
        paddingTop: pad * 0.9,
        borderRadius: `${pad * 0.5}px ${pad * 0.5}px ${pad * 1.6}px ${pad * 0.5}px`,
        background: "#7D8098",
        boxShadow: "inset 0 2px 0 rgba(255,255,255,0.18), 0 40px 70px -30px rgba(40,44,90,0.55)",
        ...style,
      }}
    >
      <div style={{ position: "relative", width, height: h, overflow: "hidden", background: "#E4EBD8", boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.12)" }}>
        <Segments src={src} segs={segs} fps={fps} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ type and cards */

export function useFade(start: number, len = 0.45) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return interpolate(f / fps, [start, start + len], [0, 1], { ...clamp, easing: EASE });
}

/** fades in at `from`, out at `to` (scene seconds) */
export function Show({ from, to = 1e9, children, style, y = 16 }: { from: number; to?: number; children: ReactNode; style?: CSSProperties; y?: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const a = interpolate(t, [from, from + 0.45], [0, 1], { ...clamp, easing: EASE });
  const b = interpolate(t, [to - 0.35, to], [1, 0], clamp);
  const o = Math.min(a, b);
  if (o <= 0) return null;
  return <div style={{ opacity: o, transform: `translateY(${(1 - a) * y}px)`, filter: a < 1 ? `blur(${(1 - a) * 6}px)` : undefined, ...style }}>{children}</div>;
}

/** The section's name, top left. */
export function SectionTag({ n, children, dark = false }: { n: string; children: ReactNode; dark?: boolean }) {
  const o = useFade(0.15, 0.5);
  return (
    <div
      style={{
        position: "absolute",
        left: 56,
        top: 44,
        zIndex: 20,
        opacity: o,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "11px 20px 11px 16px",
        borderRadius: 999,
        background: dark ? "rgba(31,35,48,0.82)" : "rgba(255,255,255,0.9)",
        boxShadow: "0 10px 30px -18px rgba(40,44,90,0.5)",
        border: `1px solid ${dark ? "transparent" : C.line}`,
      }}
    >
      <span style={{ fontFamily: PX, fontSize: 18, letterSpacing: 2, color: dark ? "#9FB7FF" : C.accent }}>{n}</span>
      <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 22, color: dark ? "#fff" : C.ink }}>{children}</span>
    </div>
  );
}

/** A label on the picture: a pixel eyebrow and a line of text. */
export function Callout({ x, y, eyebrow, children, anchor = "center", accent = C.accent, style }: { x: number; y: number; eyebrow: string; children?: ReactNode; anchor?: "left" | "center" | "right"; accent?: string; style?: CSSProperties }) {
  const tx = anchor === "center" ? "-50%" : anchor === "right" ? "-100%" : "0";
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translateX(${tx})`, ...style }}>
      <div
        style={{
          padding: "14px 22px 16px",
          borderRadius: 20,
          background: "rgba(255,255,255,0.94)",
          border: `1px solid ${C.line}`,
          boxShadow: "0 18px 40px -24px rgba(40,44,90,0.55)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontFamily: PX, fontSize: 17, letterSpacing: 3, color: accent }}>{eyebrow}</span>
        {children && <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 25, color: C.ink }}>{children}</span>}
      </div>
    </div>
  );
}

export function Pill({ children, color = C.ink, bg = "#fff", style }: { children: ReactNode; color?: string; bg?: string; style?: CSSProperties }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999, background: bg, color, fontFamily: PX, fontSize: 16, letterSpacing: 2, ...style }}>
      {children}
    </span>
  );
}

export function Panel({ title, children, style, right }: { title: string; children: ReactNode; style?: CSSProperties; right?: ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${C.line}`,
        borderRadius: 26,
        boxShadow: "0 1px 2px rgba(31,35,48,0.05), 0 30px 60px -36px rgba(60,70,120,0.45)",
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 26px", borderBottom: `1px solid ${C.line}` }}>
        <span style={{ fontFamily: PX, fontSize: 17, letterSpacing: 3, color: C.ink3 }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export type Tok = [string, string?];
/** one line of code: [text, colour] pieces */
export const k = (t: string): Tok => [t, C.accent];
export const s = (t: string): Tok => [t, PINK];
export const c = (t: string): Tok => [t, "#8A90A2"];
export const p = (t: string): Tok => [t];

/** Code that types in line by line; `at[i]` is when line i appears (scene seconds). */
export function Code({ lines, at, size = 24, hi, style }: { lines: Tok[][]; at: number[]; size?: number; hi?: { from: number; line: number[] }; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  return (
    <div style={{ padding: "22px 28px 26px", fontFamily: MONO, fontSize: size, lineHeight: 1.62, color: C.ink, ...style }}>
      {lines.map((ln, i) => {
        const a = interpolate(t, [at[i] ?? 0, (at[i] ?? 0) + 0.35], [0, 1], clamp);
        const lit = hi && t >= hi.from && hi.line.includes(i);
        return (
          <div key={i} style={{ opacity: a, transform: `translateX(${(1 - a) * 10}px)`, whiteSpace: "pre", borderRadius: 8, margin: "0 -10px", padding: "0 10px", background: lit ? "rgba(207,226,255,0.65)" : "transparent", transition: "none" }}>
            {ln.length === 0 ? " " : ln.map(([txt, col], j) => <span key={j} style={{ color: col ?? C.ink }}>{txt}</span>)}
          </div>
        );
      })}
    </div>
  );
}

/** a row in a checklist that ticks at `at` */
export function Check({ at, children, ok = true }: { at: number; children: ReactNode; ok?: boolean }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const a = interpolate(t, [at, at + 0.3], [0, 1], clamp);
  const tick = interpolate(t, [at + 0.25, at + 0.55], [0, 1], { ...clamp, easing: EASE });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: 0.25 + 0.75 * a, fontFamily: SANS, fontSize: 28, fontWeight: 500, color: C.ink }}>
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          flex: "none",
          display: "grid",
          placeItems: "center",
          background: tick > 0 ? (ok ? "#DFF3E6" : "#FFE0E8") : "#F1F2F6",
          color: ok ? GREEN : PINK,
          fontSize: 22,
          fontWeight: 700,
          transform: `scale(${0.7 + 0.3 * tick})`,
        }}
      >
        {tick > 0 ? (ok ? "✓" : "✕") : ""}
      </span>
      <span>{children}</span>
    </div>
  );
}

export function Big({ children, size = 64, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: size, lineHeight: 1.05, letterSpacing: -size * 0.035, color: C.ink, ...style }}>{children}</div>;
}

/** a soft fade from white at the start of each scene */
export function SceneFade({ children }: { children: ReactNode }) {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 8], [0, 1], clamp);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
}
