import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Console } from "./Three";
import { poseAt as poseAtP } from "../../web/src/landing/scene";
import { C, Card, DISPLAY, Eyebrow, Glow, PX, Pop, SANS, Title, a } from "./ui";
import { Clip, Photo, Vhs } from "./vhs";

type P = { dur: number };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* 1 · a memory on tape: the deck, a car window, a kid at a window, then my own Game Boy */
export function Memory({ dur }: P) {
  const f = useCurrentFrame();
  const flash = interpolate(f, [dur - 10, dur - 3, dur], [0, 1, 1], clamp);
  // 0: black, the cassette goes in · blue: the deck's blue screen while it spins up · open: the picture
  const blue = 48;
  const open = 120;
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

/* 4 · how it feels: one shot per step, on the real console */
type StepShot = { from: number; eyebrow: string; title: string; screen: string; pose: (u: number, t: number) => Record<string, number>; held?: (t: number) => string[] };
const SCREEN = (u: number) => ({ az: lerp(-0.08, -0.02, u), el: 0.02, dist: lerp(0.26, 0.23, u), tx: 0, ty: 0.03, lift: 0, shift: 0.26 });
const SHOTS: StepShot[] = [
  { from: 0, eyebrow: "A new save file", title: "Turn it on", screen: "02-new-or-restore", pose: (u) => ({ az: lerp(-0.62, -0.38, u), el: 0.12, dist: lerp(0.5, 0.44, u), tx: 0.004, ty: 0.03, lift: 0, shift: 0.18 }) },
  { from: 0.12, eyebrow: "01", title: "Mash the buttons", screen: "03-mash-buttons",
    pose: (u) => ({ az: lerp(0.18, 0.05, u), el: 0.18, dist: lerp(0.21, 0.19, u), tx: 0.004, ty: -0.032, lift: 0, shift: 0.26 }),
    held: (t) => { const k = Math.floor(t * 30); return k % 6 < 3 ? [["ButtonA", "DPad", "ButtonB", "DPad"][Math.floor(k / 6) % 4]] : []; } },
  { from: 0.2, eyebrow: "02", title: "Shake it", screen: "04-shake",
    pose: (u, t) => ({ az: -0.3 + Math.sin(t * 31) * 0.05, el: 0.1 + Math.cos(t * 27) * 0.04, dist: 0.46, tx: Math.sin(t * 23) * 0.004, ty: 0.02 + Math.cos(t * 29) * 0.004, lift: 0, shift: 0.2 }) },
  { from: 0.27, eyebrow: "03", title: "Write down 12 words", screen: "05-recovery-words", pose: SCREEN },
  { from: 0.35, eyebrow: "04", title: "Pick a PIN", screen: "06-choose-pin", pose: SCREEN, held: (t) => (Math.floor(t * 30) % 16 < 5 ? ["DPad"] : []) },
  { from: 0.41, eyebrow: "05", title: "Pair your phone", screen: "08-pair-code", pose: (u) => ({ ...SCREEN(u), shift: 0.27, dist: lerp(0.3, 0.27, u) }) },
  { from: 0.57, eyebrow: "Every request", title: "Your phone can't decide.", screen: "11-approve-send", pose: (u) => ({ az: 0, el: 0.02, dist: lerp(0.3, 0.24, u), tx: 0, ty: 0.03, lift: 0, shift: 0.2 }) },
  { from: 0.84, eyebrow: "", title: "Hold A to sign", screen: "11-approve-send", pose: (u) => ({ az: lerp(0.32, 0.26, u), el: 0.16, dist: lerp(0.13, 0.115, u), tx: 0.031, ty: -0.021, lift: 0, shift: 0.18 }), held: () => ["ButtonA"] },
  { from: 0.94, eyebrow: "", title: "Signed", screen: "12-signed-confirmed", pose: (u) => ({ az: 0, el: 0.02, dist: lerp(0.25, 0.235, u), tx: 0, ty: 0.03, lift: 0, shift: 0.2 }) },
];

/** the frames where a button goes down, for a click each */
function clicks(held: (t: number) => string[], len: number) {
  const out: number[] = [];
  let was = 0;
  for (let fr = 0; fr < len; fr++) {
    const n = held(fr / 30).length;
    if (n > was) out.push(fr);
    was = n;
  }
  return out;
}

export function Feel({ dur }: P) {
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      {SHOTS.map((sh, i) => {
        const a0 = Math.round(sh.from * dur);
        const a1 = Math.round((SHOTS[i + 1]?.from ?? 1) * dur);
        const len = a1 - a0;
        return (
          <Sequence key={sh.title} from={a0} durationInFrames={len}>
            <Glow shift={120 + i * 20} />
            {sh.held && clicks(sh.held, len).map((fr) => (
              <Sequence key={fr} from={fr} durationInFrames={10}>
                <Audio src={staticFile("sfx/button-click.mp3")} volume={0.55} />
              </Sequence>
            ))}
            <Console
              screens={[sh.screen]}
              shot={{ p: () => 0, plain: true, screen: () => sh.screen, held: sh.held, pose: (t) => sh.pose(Math.min(1, t / (len / 30)), t) as never }}
            />
            <div style={{ position: "absolute", left: 110, top: 770 }}>
              <Pop start={3}>
                <Card style={{ padding: "28px 36px", display: "flex", flexDirection: "column", gap: 12, background: "rgba(255,255,255,0.94)" }}>
                  {sh.eyebrow && <Eyebrow>{sh.eyebrow}</Eyebrow>}
                  <Title size={70} style={{ whiteSpace: "nowrap" }}>{sh.title}</Title>
                </Card>
              </Pop>
            </div>
          </Sequence>
        );
      })}
    </AbsoluteFill>
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
  ["LIS3DH", "Turns a shake into randomness."],
];
export function Apart({ dur }: P) {
  const sec = dur / 30;
  const step = Math.round((dur * 0.62) / CHIPS.length);
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
          <Pop key={n} start={30 + i * step}>
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
