import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
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
  return (
    <AbsoluteFill style={{ background: "#050505" }}>
      <Sequence durationInFrames={44}>
        <Vhs osd="▶ PLAY">
          <Clip name="vhs-eject" from={1} dur={44} />
        </Vhs>
      </Sequence>
      <Sequence from={44} durationInFrames={92}>
        <Vhs osd="▶ PLAY">
          <Clip name="car-window-retro" from={2} dur={92} />
        </Vhs>
      </Sequence>
      <Sequence from={136} durationInFrames={96}>
        <Vhs osd="▶ PLAY">
          <Clip name="boy-window" from={6} dur={96} push={0.1} />
        </Vhs>
      </Sequence>
      <Sequence from={232}>
        <Vhs osd="▶ PLAY" stamp="SP">
          <Photo src={a("02-real-photos/photo-home.jpg")} dur={dur - 232} pos="50% 0%" zoom={1.45} origin="50% 5%" push={0.06} />
        </Vhs>
      </Sequence>
      {/* the tape snaps to the present */}
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
  const cut2 = Math.round(dur * 0.6);
  const cold = { filter: "saturate(0.55) contrast(1.05) brightness(0.8) hue-rotate(-8deg)" };
  const close = interpolate(f, [cut2 + 40, cut2 + 85], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: "#0b0d12" }}>
      <Sequence durationInFrames={cut1}>
        <AbsoluteFill style={cold}>
          <Clip name="crossing" from={4} dur={cut1} push={0.05} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(10,12,18,0.75), transparent 60%)" }} />
        <div style={{ position: "absolute", left: 140, top: 420 }}>
          <Pop start={10}>
            <div style={{ fontFamily: PX, fontSize: 30, letterSpacing: 6, color: "#cfe2ff" }}>YEARS LATER</div>
          </Pop>
          <Pop start={24}>
            <Title size={92} style={{ color: "#fff", width: 900, marginTop: 20 }}>Everything I own lives on my phone.</Title>
          </Pop>
        </div>
      </Sequence>
      <Sequence from={cut1} durationInFrames={cut2 - cut1}>
        <AbsoluteFill style={cold}>
          <Clip name="train-night" from={2} dur={cut2 - cut1} push={0.04} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "rgba(8,10,16,0.45)" }} />
        <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 120 }}>
          <Phone f={f - cut1} prompt={interpolate(f - cut1, [80, 100], [0, 1], clamp)} />
          <div style={{ width: 760, display: "flex", flexDirection: "column", gap: 18 }}>
            <Pop start={40}>
              <Title size={80} style={{ color: "#fff" }}>The screen that asks you to sign</Title>
            </Pop>
            <Pop start={100}>
              <Title size={80} style={{ color: "#cfd6e6" }}>is the screen that tells you what you're signing.</Title>
            </Pop>
          </div>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={cut2}>
        <Glow shift={40} />
        <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 140 }}>
          <div style={{ width: 620, height: 440, position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 26, background: "#EEF0F5", border: `1px solid ${C.line}` }} />
            <div style={{ position: "absolute", left: 210, top: 150, width: 200, height: 120, borderRadius: 18, background: "#C9CCD6" }}>
              <div style={{ position: "absolute", left: 30, top: 34, width: 140, height: 40, borderRadius: 8, background: "#9EA3B0" }} />
            </div>
            <div style={{ position: "absolute", left: -10, right: -10, bottom: -10, height: 270 * close, borderRadius: 28, background: "#fff", border: `1px solid ${C.line}`, boxShadow: "0 30px 60px -30px rgba(31,35,48,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 120, height: 14, borderRadius: 7, background: "#D9DCE4", opacity: close }} />
            </div>
          </div>
          <div style={{ width: 720 }}>
            <Pop start={10}>
              <Title size={84}>Hardware wallets fix that.</Title>
            </Pop>
            <Pop start={70}>
              <Title size={84} style={{ color: C.ink2 }}>
                But they live in a drawer.
              </Title>
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
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: q }}>
        <Title size={112} style={{ textAlign: "center", width: 1500, transform: `scale(${1 + f / mid / 30})` }}>
          What if the safest screen
          <br />
          you own is from <span style={{ fontFamily: PX, fontWeight: 400, letterSpacing: 0 }}>1989</span>?
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
              <Eyebrow>No Wi-Fi · no apps · no browser</Eyebrow>
            </div>
          </Pop>
          <Pop start={46}>
            <Title size={156}>kagiboy</Title>
          </Pop>
          <Pop start={64}>
            <div style={{ fontFamily: SANS, fontSize: 48, lineHeight: 1.25, color: C.ink }}>Your keys, in a Game Boy cartridge.</div>
          </Pop>
        </div>
      </Sequence>
      <AbsoluteFill style={{ background: "#fff", opacity: interpolate(k, [0, 0.04], [1, 0], clamp) * (f >= mid ? 1 : 0) }} />
    </AbsoluteFill>
  );
}

/* 4 · how it feels: the real console, the real screens, thumbs on the buttons */
const STEPS = [
  { at: 0.0, eyebrow: "Step 1", title: "Mash and shake", screens: ["03-mash-buttons", "04-shake"] },
  { at: 0.2, eyebrow: "Step 2", title: "Write 12 words", screens: ["05-recovery-words"] },
  { at: 0.3, eyebrow: "Step 3", title: "Pick a PIN", screens: ["06-choose-pin"] },
  { at: 0.4, eyebrow: "Step 4", title: "Pair your phone", screens: ["08-pair-code"] },
  { at: 0.58, eyebrow: "Every request", title: "Hold A to sign", screens: ["11-approve-send", "12-signed-confirmed"] },
];
const SCREENS = STEPS.flatMap((s) => s.screens);

export function Feel({ dur }: P) {
  const f = useCurrentFrame();
  const p = f / dur;
  const sec = dur / 30;
  const step = (u: number) => STEPS.reduce((k, s, i) => (u >= s.at ? i : k), 0);
  const screenAt = (t: number) => {
    const u = t / sec;
    const i = step(u);
    const s = STEPS[i];
    const end = STEPS[i + 1]?.at ?? 1;
    // the last step: approve while A is held, then signed
    if (i === 4) return u < s.at + (end - s.at) * 0.62 ? s.screens[0] : s.screens[1];
    return s.screens[Math.min(s.screens.length - 1, Math.floor(((u - s.at) / (end - s.at)) * s.screens.length))];
  };
  const held = (t: number) => {
    const u = t / sec;
    const i = step(u);
    const fr = Math.floor(t * 30);
    if (i === 0 && u < 0.1) return fr % 8 < 4 ? [["DPad", "ButtonA", "ButtonB"][Math.floor(fr / 8) % 3]] : []; // mashing
    if (i === 2) return fr % 18 < 6 ? ["DPad"] : [];
    if (i === 3 && u > 0.5) return fr % 30 < 8 ? ["ButtonA"] : [];
    const s4 = STEPS[4].at;
    if (i === 4 && u > s4 + 0.06 && u < s4 + (1 - s4) * 0.62) return ["ButtonA"]; // hold to sign
    return [];
  };
  const pairing = p >= STEPS[3].at && p < STEPS[4].at;
  return (
    <AbsoluteFill>
      <Glow shift={120} />
      <Console
        screens={SCREENS}
        shot={{
          p: () => 0,
          screen: screenAt,
          held,
          pose: (t) => {
            const u = t / sec;
            return { az: lerp(-0.34, -0.12, u), el: lerp(0.12, 0.05, u), dist: lerp(0.44, 0.37, u), tx: 0.002, ty: lerp(0.012, 0.004, u), lift: 0, shift: 0.22 };
          },
        }}
      />
      <div style={{ position: "absolute", left: 140, top: 170, display: "flex", flexDirection: "column", gap: 34 }}>
        <Pop start={0}>
          <Eyebrow>Setup feels like starting a new game</Eyebrow>
        </Pop>
        {STEPS.map((s, i) => {
          const on = p >= s.at && p < (STEPS[i + 1]?.at ?? 1.01);
          const seen = p >= s.at;
          return (
            <div key={s.title} style={{ opacity: seen ? (on ? 1 : 0.32) : 0.1, display: "flex", alignItems: "baseline", gap: 28, transform: `translateX(${on ? 0 : -8}px)` }}>
              <span style={{ fontFamily: PX, fontSize: 28, color: on ? C.accent : C.ink3, width: 300, whiteSpace: "nowrap" }}>{s.eyebrow}</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 72, letterSpacing: -2.5, color: C.ink }}>{s.title}</span>
            </div>
          );
        })}
      </div>
      {pairing && (
        <div style={{ position: "absolute", left: 140, top: 790, opacity: interpolate(f, [STEPS[3].at * dur, STEPS[3].at * dur + 15], [0, 1], clamp) }}>
          <Card style={{ padding: "22px 30px", display: "flex", gap: 22, alignItems: "center" }}>
            <span style={{ fontFamily: SANS, fontSize: 24, color: C.ink2 }}>Same code on your phone</span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 56, letterSpacing: 6, color: C.ink }}>636073</span>
          </Card>
        </div>
      )}
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
