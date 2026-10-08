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
        <Drawer dur={dur - cut2} />
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

/* 4 · how it feels: one shot per step, on the real console */
type StepShot = { from: number; eyebrow: string; title: string; screen: string; pose: (u: number, t: number) => Record<string, number>; held?: (t: number) => string[] };
const SCREEN = (u: number) => ({ az: lerp(-0.08, -0.02, u), el: 0.02, dist: lerp(0.26, 0.23, u), tx: 0, ty: 0.03, lift: 0, shift: 0.26 });
const SHOTS: StepShot[] = [
  { from: 0, eyebrow: "A new game", title: "Setting it up", screen: "02-new-or-restore", pose: (u) => ({ az: lerp(-0.62, -0.38, u), el: 0.12, dist: lerp(0.5, 0.44, u), tx: 0.004, ty: 0.03, lift: 0, shift: 0.18 }) },
  { from: 0.12, eyebrow: "01", title: "Mash the buttons", screen: "03-mash-buttons",
    pose: (u) => ({ az: lerp(0.18, 0.05, u), el: 0.18, dist: lerp(0.21, 0.19, u), tx: 0.004, ty: -0.032, lift: 0, shift: 0.26 }),
    held: (t) => { const k = Math.floor(t * 30); return k % 6 < 3 ? [["ButtonA", "DPad", "ButtonB", "DPad"][Math.floor(k / 6) % 4]] : []; } },
  { from: 0.2, eyebrow: "02", title: "Shake it", screen: "04-shake",
    pose: (u, t) => ({ az: -0.3 + Math.sin(t * 31) * 0.05, el: 0.1 + Math.cos(t * 27) * 0.04, dist: 0.46, tx: Math.sin(t * 23) * 0.004, ty: 0.02 + Math.cos(t * 29) * 0.004, lift: 0, shift: 0.2 }) },
  { from: 0.27, eyebrow: "03", title: "Write down 12 words", screen: "05-recovery-words", pose: SCREEN },
  { from: 0.35, eyebrow: "04", title: "Pick a PIN", screen: "06-choose-pin", pose: SCREEN, held: (t) => (Math.floor(t * 30) % 16 < 5 ? ["DPad"] : []) },
  { from: 0.41, eyebrow: "05", title: "Pair your phone", screen: "08-pair-code", pose: (u) => ({ ...SCREEN(u), shift: 0.27, dist: lerp(0.3, 0.27, u) }) },
  { from: 0.57, eyebrow: "Every request", title: "The phone only asks", screen: "11-approve-send", pose: (u) => ({ az: 0, el: 0.02, dist: lerp(0.3, 0.24, u), tx: 0, ty: 0.03, lift: 0, shift: 0.2 }) },
  { from: 0.84, eyebrow: "", title: "Hold A to sign", screen: "11-approve-send", pose: (u) => ({ az: lerp(0.32, 0.26, u), el: 0.16, dist: lerp(0.13, 0.115, u), tx: 0.031, ty: -0.021, lift: 0, shift: 0.18 }), held: () => ["ButtonA"] },
  { from: 0.94, eyebrow: "", title: "Signed", screen: "12-signed-confirmed", pose: (u) => ({ az: 0, el: 0.02, dist: lerp(0.25, 0.235, u), tx: 0, ty: 0.03, lift: 0, shift: 0.2 }) },
];

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
            <Console
              screens={[sh.screen]}
              shot={{ p: () => 0, plain: true, screen: () => sh.screen, held: sh.held, pose: (t) => sh.pose(Math.min(1, t / (len / 30)), t) as never }}
            />
            {sh.title === "Pair your phone" && (
              <div style={{ position: "absolute", left: 120, top: 640 }}>
                <Pop start={6}>
                  <Card style={{ padding: "34px 40px", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                    <span style={{ fontFamily: SANS, fontSize: 26, color: C.ink2 }}>On your phone</span>
                    <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 84, letterSpacing: 8, color: C.ink }}>636073</span>
                    <span style={{ fontFamily: SANS, fontSize: 24, color: C.ink3 }}>the same code as the Game Boy</span>
                  </Card>
                </Pop>
              </div>
            )}
            <div style={{ position: "absolute", left: 120, top: 400 }}>
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

/* 2b · inside the drawer: we look up at the room as the drawer slides shut */
export function Drawer({ dur }: P) {
  const f = useCurrentFrame();
  const shut0 = Math.round(dur * 0.45);
  const open = interpolate(f, [shut0, dur - 8], [1, 0], { ...clamp, easing: (t) => t * t * (3 - 2 * t) });
  const H = 1080 * 0.62 * open;
  const glow = 0.25 + 0.75 * open;
  return (
    <AbsoluteFill style={{ background: "#0d0b0a" }}>
      {/* the room, seen through the drawer's opening */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: H, overflow: "hidden", background: "#fbfbfd" }}>
        <Glow shift={40} />
        <div style={{ position: "absolute", left: 140, top: 150, width: 1500 }}>
          <Pop start={6}>
            <Title size={92}>Hardware wallets fix that.</Title>
          </Pop>
          <Pop start={Math.round(dur * 0.3)}>
            <Title size={92} style={{ color: C.ink2, marginTop: 18 }}>
              But they live in a drawer.
            </Title>
          </Pop>
        </div>
      </div>
      {/* the drawer's front edge and its shadow */}
      <div style={{ position: "absolute", left: 0, right: 0, top: H - 2, height: 26, background: "linear-gradient(#2a221d, #120f0d)", boxShadow: "0 18px 40px rgba(0,0,0,0.6)" }} />
      {/* inside the drawer: its floor and side walls, lit by what's left of the room */}
      <div style={{ position: "absolute", left: 0, right: 0, top: H + 24, bottom: 0, background: `linear-gradient(180deg, rgba(92,70,56,${0.95 * glow}), rgba(40,30,24,${0.9 * glow}) 45%, #0d0b0a 95%)` }} />
      <div style={{ position: "absolute", left: 0, top: H + 24, bottom: 0, width: 260, background: "linear-gradient(90deg, rgba(0,0,0,0.75), transparent)", clipPath: "polygon(0 0, 100% 18%, 100% 100%, 0 100%)" }} />
      <div style={{ position: "absolute", right: 0, top: H + 24, bottom: 0, width: 260, background: "linear-gradient(270deg, rgba(0,0,0,0.75), transparent)", clipPath: "polygon(0 18%, 100% 0, 100% 100%, 0 100%)" }} />
      {/* a plain hardware wallet, forgotten on the drawer floor */}
      <div style={{ position: "absolute", left: 960 - 330, bottom: 150, width: 660, height: 200, transform: "perspective(1100px) rotateX(58deg) rotateZ(-6deg)", filter: `brightness(${0.3 + 0.7 * glow})` }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 36, background: "linear-gradient(160deg, #4a4d55, #2c2e34)", boxShadow: "0 40px 60px rgba(0,0,0,0.7), inset 0 2px 0 rgba(255,255,255,0.12)" }} />
        <div style={{ position: "absolute", left: 60, top: 50, width: 330, height: 100, borderRadius: 12, background: "#14151a", boxShadow: "inset 0 0 0 3px #3a3c43" }} />
        <div style={{ position: "absolute", right: 70, top: 64, width: 72, height: 72, borderRadius: 36, background: "#5a5d65", boxShadow: "inset 0 -4px 0 rgba(0,0,0,0.3)" }} />
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
