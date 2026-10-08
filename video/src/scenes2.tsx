import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
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
  const flash = interpolate(f, [dur - 14, dur - 4, dur], [0, 1, 1], clamp);
  const open = 26; // a beat of black while the deck clunks and the tape spins up
  const c1 = Math.round(dur * 0.36);
  const c2 = Math.round(dur * 0.62);
  const snow = interpolate(f, [open - 10, open, open + 6], [0, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ background: "#050505" }}>
      <Audio src={staticFile("sfx/tape-switch.mp3")} volume={0.9} />
      <Sequence from={8}>
        <Audio src={staticFile("sfx/static.mp3")} volume={0.35} />
      </Sequence>
      <Sequence from={open}>
        <Audio src={staticFile("sfx/crt-hum.mp3")} volume={0.1} />
      </Sequence>
      <Sequence from={open} durationInFrames={c1 - open}>
        <Vhs osd="▶ PLAY">
          <Photo src={staticFile("gen/g1.png")} dur={c1 - open} zoom={1.3} origin="18% 6%" pos="0% 0%" push={0.07} />
        </Vhs>
      </Sequence>
      <Sequence from={c1} durationInFrames={c2 - c1}>
        <Vhs osd="▶ PLAY">
          <Clip name="car-window-retro" from={2} dur={c2 - c1} />
        </Vhs>
      </Sequence>
      <Sequence from={c2}>
        <Vhs osd="▶ PLAY">
          <Photo src={staticFile("gen/g3.png")} dur={dur - c2} zoom={1.3} origin="30% 10%" pos="0% 0%" push={0.08} />
        </Vhs>
      </Sequence>
      {/* tape snow as the picture comes up, and the snap to the present */}
      <AbsoluteFill style={{ background: "#d8d8d8", opacity: snow * 0.5, mixBlendMode: "screen" }} />
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
}

function Phone({ f, prompt }: { f: number; prompt: number }) {
  const pings = ["You won an airdrop!", "Claim 500 USDC now", "Approve this request?", "Your wallet needs attention"];
  return (
    <div style={{ width: 420, height: 860, borderRadius: 66, background: "#fff", border: `12px solid ${C.ink}`, boxShadow: "0 60px 120px -40px rgba(0,0,0,0.7)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", width: 120, height: 32, borderRadius: 20, background: C.ink }} />
      <div style={{ position: "absolute", inset: "70px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {pings.map((p, i) => {
          const t = interpolate(f, [16 + i * 14, 28 + i * 14], [0, 1], clamp);
          return (
            <div key={p} style={{ opacity: t, transform: `translateY(${(1 - t) * -24}px) scale(${0.96 + t * 0.04})`, background: "#F3F4F8", borderRadius: 18, padding: "16px 18px", fontFamily: SANS, fontSize: 22, color: C.ink }}>
              {p}
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        <div style={{ opacity: prompt, transform: `translateY(${(1 - prompt) * 40}px)`, background: C.ink, color: "#fff", borderRadius: 22, padding: "22px 18px", fontFamily: SANS, fontSize: 24, textAlign: "center" }}>
          Sign transaction?
          <div style={{ marginTop: 14, background: "#fff", color: C.ink, borderRadius: 14, padding: "12px 0", fontWeight: 600 }}>Approve</div>
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
          <Phone f={f - cut1} prompt={interpolate(f - cut1, [80, 100], [0, 1], clamp)} />
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
