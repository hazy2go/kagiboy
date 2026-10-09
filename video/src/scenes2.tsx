import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Console } from "./Three";
import { poseAt as poseAtP } from "../../web/src/landing/scene";
import { C, Card, DISPLAY, Eyebrow, Glow, PX, Pop, SANS, Title, a } from "./ui";
import { Clip, Photo, Vhs } from "./vhs";

type P = { dur: number; marks?: { at: number; text: string }[] };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* 1 · a memory on tape: the deck, a car window, a kid at a window, then my own Game Boy */
export function Memory({ dur }: P) {
  const f = useCurrentFrame();
  const flash = interpolate(f, [dur - 10, dur - 3, dur], [0, 1, 1], clamp);
  // 0: black, the cassette goes in · blue: the deck's blue screen while it spins up · open: the picture
  const blue = 18;
  const open = 84;
  const c1 = Math.round(open + (dur - open) * 0.4);
  const c2 = Math.round(open + (dur - open) * 0.7);
  return (
    <AbsoluteFill style={{ background: "#050505" }}>
      <Audio src={staticFile("sfx/vhs-intro.wav")} volume={1} />
      <Sequence from={open}>
        <Audio src={staticFile("sfx/real-vhs.mp3")} volume={0.14} startFrom={30 * 20} />
      </Sequence>
      <Sequence from={open} durationInFrames={c1 - open}>
        <Vhs>
          <Photo src={staticFile("gen/g1.png")} dur={c1 - open} zoom={1.3} origin="18% 6%" pos="0% 0%" push={0.07} />
        </Vhs>
      </Sequence>
      <Sequence from={c1} durationInFrames={c2 - c1}>
        <Vhs>
          <Clip name="car-window-retro" from={2} dur={c2 - c1} />
        </Vhs>
      </Sequence>
      <Sequence from={c2}>
        <Vhs>
          <Photo src={staticFile("gen/g3.png")} dur={dur - c2} zoom={1.3} origin="30% 10%" pos="0% 0%" push={0.08} />
        </Vhs>
      </Sequence>
      {/* a real VCR's PLAY screen and tape noise over the memories (Pixabay, free license) */}
      <Sequence from={open}>
        <AbsoluteFill style={{ mixBlendMode: "screen", opacity: 0.9 }}>
          <OffthreadVideo src={staticFile("vhs/overlay-261503.mp4")} muted style={{ position: "absolute", left: 240, width: 1440, height: 1080, objectFit: "cover" }} />
        </AbsoluteFill>
      </Sequence>
      {f >= blue && f < open && <BlueScreen f={f - blue} len={open - blue} />}
      {/* real tracking static as the picture comes in, and again as the tape snaps to the present */}
      {[open - 14, dur - 16].map((at) => (
        <Sequence key={at} from={at} durationInFrames={18}>
          <AbsoluteFill style={{ mixBlendMode: "screen" }}>
            <OffthreadVideo src={staticFile("vhs/overlay-225225.mp4")} startFrom={30} muted style={{ position: "absolute", left: 240, width: 1440, height: 1080, objectFit: "cover" }} />
          </AbsoluteFill>
        </Sequence>
      ))}
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
}

/** A VCR's blue screen with its PLAY readout; the last frames break up into tracking noise. */
function BlueScreen({ f, len }: { f: number; len: number }) {
  return (
    <AbsoluteFill style={{ background: "#050505" }}>
      <div style={{ position: "absolute", left: 240, top: 0, width: 1440, height: 1080, overflow: "hidden", background: "#1f2fd0" }}>
        <div style={{ position: "absolute", left: 90, top: 70, fontFamily: PX, fontSize: 56, color: "#fff", letterSpacing: 6, textShadow: "3px 3px 0 rgba(0,0,0,0.35)" }}>PLAY ▶</div>
        <div style={{ position: "absolute", right: 90, top: 70, fontFamily: PX, fontSize: 44, color: "#fff", letterSpacing: 4 }}>SP</div>
      </div>
    </AbsoluteFill>
  );
}

/* a modern phone at night: lock screen, notifications piling up, then a wallet's signing sheet */
const NOTES = [
  { app: "Rewards", color: "#F5A524", glyph: "★", title: "You have 500 USDC to claim", body: "Claim before midnight. Tap to connect your wallet." },
  { app: "Messages", color: "#34C759", glyph: "✉", title: "+1 (415) 555-0147", body: "hey is this you in this video?? bit.ly/…" },
  { app: "Airdrop Hub", color: "#7C5CFF", glyph: "◆", title: "Season 3 is live", body: "You're eligible. Approve the request to receive." },
  { app: "Wallet", color: "#3B6FE0", glyph: "◎", title: "Signature request", body: "app-claim.xyz wants you to sign" },
];

function Phone({ f, prompt }: { f: number; prompt: number }) {
  const W = 430;
  const H = 900;
  return (
    <div style={{ position: "relative", width: W, height: H }}>
      {/* side buttons */}
      <div style={{ position: "absolute", left: -5, top: 190, width: 5, height: 70, borderRadius: 3, background: "#3a3d45" }} />
      <div style={{ position: "absolute", left: -5, top: 280, width: 5, height: 70, borderRadius: 3, background: "#3a3d45" }} />
      <div style={{ position: "absolute", right: -5, top: 240, width: 5, height: 110, borderRadius: 3, background: "#3a3d45" }} />
      {/* titanium frame and glass */}
      <div style={{ position: "absolute", inset: 0, borderRadius: 72, background: "linear-gradient(145deg, #6b6f78, #2b2e35 40%, #55585f)", padding: 7, boxShadow: "0 80px 140px -40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)" }}>
        <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 66, overflow: "hidden", background: "radial-gradient(120% 80% at 20% 0%, #3a2a6b 0%, #1a1730 45%, #0b0b14 100%)" }}>
          {/* wallpaper glow */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 40% at 80% 85%, rgba(255,110,150,0.35), transparent 70%), radial-gradient(50% 35% at 10% 60%, rgba(90,140,255,0.3), transparent 70%)" }} />
          {/* dynamic island */}
          <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", width: 126, height: 36, borderRadius: 20, background: "#000" }} />
          {/* status bar */}
          <div style={{ position: "absolute", top: 22, left: 40, right: 40, display: "flex", justifyContent: "space-between", fontFamily: SANS, fontWeight: 600, fontSize: 18, color: "#fff" }}>
            <span>23:41</span>
            <span style={{ letterSpacing: 2 }}>▮▮▮ ◔</span>
          </div>
          {/* lock screen clock */}
          <div style={{ position: "absolute", top: 86, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.92)" }}>
            <div style={{ fontFamily: SANS, fontSize: 20, fontWeight: 500 }}>Thursday 9 October</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 104, letterSpacing: -3, lineHeight: 1 }}>23:41</div>
          </div>
          {/* notifications, newest on top, sliding in */}
          <div style={{ position: "absolute", left: 16, right: 16, top: 270, display: "flex", flexDirection: "column", gap: 10 }}>
            {NOTES.map((n, i) => {
              const t = interpolate(f, [10 + i * 16, 22 + i * 16], [0, 1], { ...clamp, easing: ease });
              return (
                <div key={n.app} style={{ opacity: t, transform: `translateY(${(1 - t) * -30}px) scale(${0.94 + t * 0.06})`, background: "rgba(255,255,255,0.16)", backdropFilter: "blur(18px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 40, height: 40, flex: "none", borderRadius: 10, background: n.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 22 }}>{n.glyph}</div>
                  <div style={{ flex: 1, minWidth: 0, fontFamily: SANS, color: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, opacity: 0.75 }}>
                      <span style={{ fontWeight: 600 }}>{n.app}</span>
                      <span>now</span>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>{n.title}</div>
                    <div style={{ fontSize: 15, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* the wallet's signing sheet */}
          <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.45 * prompt})` }} />
          <div style={{ position: "absolute", left: 10, right: 10, bottom: 10, transform: `translateY(${(1 - prompt) * 560}px)`, background: "#16171d", borderRadius: 52, padding: "22px 26px 30px", fontFamily: SANS, color: "#fff", boxShadow: "0 -20px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ width: 44, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.25)", margin: "0 auto 18px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#F5A524,#ff6f91)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>★</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>Confirm transaction</div>
                <div style={{ fontSize: 15, opacity: 0.6 }}>app-claim.xyz</div>
              </div>
            </div>
            <div style={{ marginTop: 20, background: "rgba(255,255,255,0.06)", borderRadius: 18, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, fontSize: 17 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ opacity: 0.6 }}>You send</span>
                <span style={{ fontWeight: 600 }}>2.40 SOL</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ opacity: 0.6 }}>Network fee</span>
                <span>0.00005 SOL</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ opacity: 0.6 }}>To</span>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 15 }}>7xKX…9fQp</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <div style={{ flex: 1, textAlign: "center", padding: "16px 0", borderRadius: 18, background: "rgba(255,255,255,0.1)", fontWeight: 600, fontSize: 18 }}>Reject</div>
              <div style={{ flex: 1, textAlign: "center", padding: "16px 0", borderRadius: 18, background: "#3B6FE0", fontWeight: 600, fontSize: 18 }}>Confirm</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 2 · years later: the city, the phone that asks and tells, and the drawer */
export function Present({ dur }: P) {
  const f = useCurrentFrame();
  const cut1 = 150;
  const cold = { filter: "saturate(0.55) contrast(1.05) brightness(0.8) hue-rotate(-8deg)" };
  return (
    <AbsoluteFill style={{ background: "#0b0d12" }}>
      <Sequence durationInFrames={cut1}>
        <AbsoluteFill style={cold}>
          <Clip name="crossing" from={4} dur={cut1} push={0.05} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(10,12,18,0.75), transparent 60%)" }} />
        <div style={{ position: "absolute", left: 140, top: 420 }}>
          <Pop start={10}>
            <div style={{ fontFamily: PX, fontSize: 30, letterSpacing: 6, color: "#cfe2ff" }}>NOW</div>
          </Pop>
          <Pop start={24}>
            <Title size={92} style={{ color: "#fff", width: 900, marginTop: 20 }}>Now it all lives on a phone.</Title>
          </Pop>
        </div>
      </Sequence>
      <Sequence from={cut1}>
        <AbsoluteFill style={cold}>
          <Clip name="train-night" from={2} dur={dur - cut1} push={0.04} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "rgba(8,10,16,0.45)" }} />
        <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 120 }}>
          <Phone f={f - cut1} prompt={interpolate(f - cut1, [96, 120], [0, 1], { ...clamp, easing: ease })} />
          <div style={{ width: 760, display: "flex", flexDirection: "column", gap: 18 }}>
            <Pop start={40}>
              <Title size={80} style={{ color: "#fff" }}>The phone that asks me to approve</Title>
            </Pop>
            <Pop start={100}>
              <Title size={80} style={{ color: "#cfd6e6" }}>is the phone telling me what I'm approving.</Title>
            </Pop>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
}

/* 3 · the idea: a question on white, then the real console swings into view */
export function Reveal({ dur }: P) {
  const f = useCurrentFrame();
  const mid = Math.round(dur * 0.38);
  const q = interpolate(f, [0, 16, mid - 12, mid], [0, 1, 1, 0], clamp);
  const k = interpolate(f, [mid, dur], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <Glow shift={80} />
      <Audio src={staticFile("sfx/whoosh-impact.mp3")} volume={0.6} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: q }}>
        <Title size={112} style={{ textAlign: "center", width: 1500, transform: `scale(${1 + f / mid / 30})` }}>
          The most honest screen
          <br />
          I've ever owned.
        </Title>
      </AbsoluteFill>
      <Sequence from={mid}>
        <Console
          screens={["01-boot"]}
          shot={{
            p: () => 0,
            screen: () => "01-boot",
            // a slow swing round from the side, the cartridge settling into the slot
            pose: (t) => {
              const u = Math.min(1, t / ((dur - mid) / 30));
              const e = ease(u);
              return { az: lerp(-1.5, -0.42, e), el: lerp(0.3, 0.1, e), dist: lerp(0.78, 0.5, e), tx: 0.004, ty: lerp(0.06, 0.03, e), lift: lerp(0.06, 0, Math.min(1, u * 1.6)), shift: 0.2 };
            },
          }}
        />
        <div style={{ position: "absolute", left: 140, top: 340, width: 760, display: "flex", flexDirection: "column", gap: 26 }}>
          <Pop start={30}>
            <div style={{ whiteSpace: "nowrap" }}>
              <Eyebrow>Never online · no apps · just my thumbs</Eyebrow>
            </div>
          </Pop>
          <Pop start={46}>
            <Title size={156}>kagiboy</Title>
          </Pop>
          <Pop start={64}>
            <div style={{ fontFamily: SANS, fontSize: 44, lineHeight: 1.25, color: C.ink, width: 900 }}>A cartridge for the Game Boy you already have.</div>
          </Pop>
        </div>
      </Sequence>
      <AbsoluteFill style={{ background: "#fff", opacity: interpolate(k, [0, 0.04], [1, 0], clamp) * (f >= mid ? 1 : 0) }} />
    </AbsoluteFill>
  );
}

/* 4 · how it feels: real footage of the prototype, a flash cart in my own Game Boy next to the phone, one shot
   per line (public/footage, cut and cropped from the two takes). */
type StepShot = { clip: string; eyebrow: string; title: string };
// a shot starts on a voice line: 0 = the scene start, 1..3 = sentence starts, 1.5 = halfway through sentence 1
const SHOTS: (StepShot & { at: number; clicks?: number[] })[] = [
  { at: 0, clip: "01-on", eyebrow: "A new save file", title: "Turn it on" },
  // the takes' own sound is muted (it has my voice on it); a click goes where a thumb goes down
  { at: 1, clip: "02-mash", eyebrow: "01", title: "Mash the buttons", clicks: Array.from({ length: 13 }, (_, k) => 4 + k * 5 + (k % 3)) },
  { at: 1.5, clip: "03-shake", eyebrow: "02", title: "Shake it" },
  { at: 2, clip: "04-request", eyebrow: "Every request", title: "Your phone can't decide." },
  { at: 3, clip: "05-hold-a", eyebrow: "On the Game Boy", title: "Hold A to sign", clicks: [7] },
];

export function Feel({ dur, marks = [] }: P) {
  const mark = (at: number) => {
    if (at === 0) return 0;
    const i = Math.floor(at);
    const m0 = marks[i]?.at ?? Math.round((dur * i) / 4);
    if (at === i) return m0;
    const m1 = marks[i + 1]?.at ?? dur;
    return Math.round(m0 + (m1 - m0) * (at - i));
  };
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <Glow shift={150} />
      {SHOTS.map((sh, i) => {
        const a0 = mark(sh.at);
        const len = (i + 1 < SHOTS.length ? mark(SHOTS[i + 1].at) : dur) - a0;
        return (
          <Sequence key={sh.clip} from={a0} durationInFrames={len}>
            <div style={{ position: "absolute", left: 1044, top: 44 }}>
              <Footage clip={sh.clip} len={len} clicks={sh.clicks} />
            </div>
            <div style={{ position: "absolute", left: 110, top: 0, bottom: 150, width: 900, display: "flex", alignItems: "center" }}>
              <Pop start={3}>
                <Card style={{ padding: "28px 36px", display: "flex", flexDirection: "column", gap: 12, background: "rgba(255,255,255,0.94)" }}>
                  <Eyebrow>{sh.eyebrow}</Eyebrow>
                  <Title size={64} style={{ whiteSpace: "nowrap" }}>{sh.title}</Title>
                </Card>
              </Pop>
            </div>
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", left: 1044 + 30, top: 44 + 26 }}>
        <ProtoFlag />
      </div>
    </AbsoluteFill>
  );
}

/** one clip of the real footage in a rounded frame (766 x 840, clear of the captions), pushing in slowly */
export function Footage({ clip, len, clicks = [] }: { clip: string; len: number; clicks?: number[] }) {
  const f = useCurrentFrame();
  const zoom = lerp(1, 1.035, f / Math.max(1, len));
  return (
    <div style={{ position: "relative", width: 766, height: 840, borderRadius: 40, overflow: "hidden", boxShadow: "0 30px 80px rgba(20,24,40,0.18)" }}>
      <OffthreadVideo src={staticFile(`footage/${clip}.mp4`)} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }} />
      {clicks.map((fr) => (
        <Sequence key={fr} from={fr} durationInFrames={10}>
          <Audio src={staticFile("sfx/button-click.mp3")} volume={0.5} />
        </Sequence>
      ))}
    </div>
  );
}

/** a little pixel pennant on a pole, waving in steps like a sprite, so the footage reads as the prototype */
export function ProtoFlag() {
  const f = useCurrentFrame();
  const px = 4; // one Game Boy pixel
  const W = 62; // pennant length in pixels
  const H = 12;
  // each column of the cloth bobs on a slow sine, snapped to whole pixels, three frames per step
  const step = Math.floor(f / 3);
  const cols = Array.from({ length: W }, (_, x) => Math.round(Math.sin(x / 9 - step * 0.55) * 1.2 * (x / W)));
  return (
    <svg width={(W + 4) * px} height={(H + 24) * px} shapeRendering="crispEdges" style={{ overflow: "visible", filter: "drop-shadow(0 4px 10px rgba(20,24,40,0.25))" }}>
      {/* pole and knob */}
      <rect x={0} y={px} width={2 * px} height={(H + 22) * px} fill={C.ink} />
      <rect x={-px} y={0} width={4 * px} height={2 * px} fill="#F2B84B" />
      {cols.map((dy, x) => {
        // swallowtail: the last pixels of the middle rows are cut away
        const tail = W - x <= 5 ? W - x : 99;
        return Array.from({ length: H }, (_, y) => {
          const cut = tail < 99 && Math.abs(y - (H - 1) / 2) < 5 - tail + 1;
          if (cut) return null;
          const edge = y === 0 || y === H - 1 || x === W - 1;
          return <rect key={`${x}-${y}`} x={(x + 2) * px} y={(y + 2 + dy) * px} width={px} height={px} fill={edge ? "#E58BA8" : C.pink} />;
        });
      })}
      <text x={6 * px} y={(2 + H / 2 + 2.2) * px} fontFamily={PX} fontSize={22} fill={C.ink} transform={`translate(0 ${cols[28] * px})`}>
        PROTOTYPE
      </text>
    </svg>
  );
}

/* 2b · the drawer: the line in white on black, and a drawer slamming shut cuts it off */
export function Drawer({ dur }: P) {
  const f = useCurrentFrame();
  const shut = dur - 16;
  const a1 = interpolate(f, [4, 22], [0, 1], clamp);
  const a2 = interpolate(f, [Math.round(dur * 0.36), Math.round(dur * 0.36) + 18], [0, 1], clamp);
  const on = f < shut ? 1 : 0;
  return (
    <AbsoluteFill style={{ background: "#08090c", alignItems: "center", justifyContent: "center" }}>
      <Sequence from={shut - 2}>
        <Audio src={staticFile("sfx/drawer-close.mp3")} volume={1} />
      </Sequence>
      <div style={{ opacity: on, textAlign: "center", display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ opacity: a1, fontFamily: DISPLAY, fontWeight: 600, fontSize: 64, letterSpacing: -2, color: "#9aa0b2" }}>The safe answer is a hardware wallet.</div>
        <div style={{ opacity: a2, fontFamily: DISPLAY, fontWeight: 700, fontSize: 96, letterSpacing: -3.5, color: "#f4f6fb", transform: `translateY(${(1 - a2) * 14}px)` }}>Most of them end up in a drawer.</div>
      </div>
    </AbsoluteFill>
  );
}

/* 6 · inside: the cartridge lifts out and comes apart, as on the website */
const CHIPS = [
  ["NXP SE050E2", "Keeps your keys. Five wrong PINs and it wipes."],
  ["RP2350", "Talks to the Game Boy, reads every request."],
  ["CYW43439", "Bluetooth to your phone. Public data only."],
  ["LIS3DH", "Your shake and button mashing become randomness."],
];
export function Apart({ dur, marks = [] }: P) {
  const sec = dur / 30;
  // each card comes in as its chip is named: the first a beat into the line, then one per sentence
  const at = (i: number) => (i === 0 ? (marks[0]?.at ?? 0) + 30 : marks[i]?.at ?? 30 + i * Math.round((dur * 0.62) / CHIPS.length));
  return (
    <AbsoluteFill>
      <Glow shift={200} />
      <Console
        screens={["09-home"]}
        shot={{
          p: (t) => lerp(0.38, 0.56, ease(Math.min(1, t / (sec * 0.55)))),
          screen: () => "09-home",
          // further right than on the website, so the chip cards on the left stay clear of it
          pose: (t) => {
            const at = poseAtP(lerp(0.38, 0.56, ease(Math.min(1, t / (sec * 0.55)))));
            return { ...at, dist: at.dist + 0.09, shift: 0.21 };
          },
        }}
      />
      <div style={{ position: "absolute", left: 130, top: 190, width: 720, display: "flex", flexDirection: "column", gap: 22 }}>
        <Pop start={4}>
          <Eyebrow>Inside the cartridge</Eyebrow>
        </Pop>
        {CHIPS.map(([n, d], i) => (
          <Pop key={n} start={at(i)}>
            <Card style={{ padding: "24px 30px", display: "flex", flexDirection: "column", gap: 6, background: "rgba(255,255,255,0.88)" }}>
              <span style={{ fontFamily: PX, fontSize: 32, color: C.ink }}>{n}</span>
              <span style={{ fontFamily: SANS, fontSize: 30, color: C.ink2 }}>{d}</span>
            </Card>
          </Pop>
        ))}
      </div>
    </AbsoluteFill>
  );
}

/* end: the console straight on, "press start" on its screen */
export function Finale() {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Glow shift={320} />
      <Console
        screens={["01-boot"]}
        shot={{ p: () => 0, screen: () => "01-boot", pose: (t) => ({ az: lerp(-0.18, -0.06, Math.min(1, t / 5)), el: 0.05, dist: lerp(0.56, 0.5, Math.min(1, t / 5)), tx: 0, ty: 0.02, lift: 0, shift: 0.24 }) }}
      />
      <div style={{ position: "absolute", left: 150, top: 330, display: "flex", flexDirection: "column", gap: 30, width: 760 }}>
        <Pop start={8}>
          <Title size={170}>kagiboy</Title>
        </Pop>
        <Pop start={18}>
          <div style={{ fontFamily: SANS, fontSize: 46, color: C.ink }}>Press start.</div>
        </Pop>
        <Pop start={30}>
          <div style={{ display: "inline-flex", alignSelf: "flex-start", background: C.ink, color: "#fff", borderRadius: 999, padding: "20px 38px", fontFamily: SANS, fontWeight: 600, fontSize: 38 }}>kagiboy.xyz/demo</div>
        </Pop>
        <Pop start={40}>
          <div style={{ fontFamily: SANS, fontSize: 30, color: C.ink2 }}>github.com/hazy2go/kagiboy</div>
        </Pop>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, textAlign: "center", fontFamily: SANS, fontSize: 22, color: C.ink3, opacity: interpolate(f, [30, 50], [0, 1], clamp) }}>
        Testnets only. The cartridge hardware is in progress. Not affiliated with Nintendo; Game Boy is a trademark of Nintendo.
      </div>
    </AbsoluteFill>
  );
}
