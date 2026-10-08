import { AbsoluteFill, Img, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Console } from "./Three";
import { C, Card, DISPLAY, Eyebrow, GameBoy, Glow, PX, Pop, SANS, Title, a, useIn, useSpring } from "./ui";

type P = { dur: number; marks?: { at: number; text: string }[] };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/* 1 · the flea market: a real photo, then the Game Boy wakes up */
export function Flea({ dur }: P) {
  const f = useCurrentFrame();
  const swap = dur - 75;
  const photo = interpolate(f, [0, 24, swap, swap + 24], [0, 1, 1, 0], clamp);
  const gb = interpolate(f, [swap, swap + 30], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Glow />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: photo }}>
        <div style={{ height: 900, aspectRatio: "1120 / 1400", overflow: "hidden", borderRadius: 32, boxShadow: "0 40px 80px -30px rgba(31,35,48,0.45)" }}>
          <Img src={a("02-real-photos/photo-home.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1 + f / dur / 12})` }} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: gb }}>
        <GameBoy screens={["01-boot"]} height={940} style={{ transform: `translateY(${(1 - gb) * 30}px)` }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Phone({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ width: 400, height: 820, borderRadius: 64, background: "#fff", border: `12px solid ${C.ink}`, boxShadow: "0 40px 80px -30px rgba(31,35,48,0.45)", position: "relative", overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", width: 120, height: 32, borderRadius: 20, background: C.ink }} />
      {children}
    </div>
  );
}

/* 2 · the problem: the phone asks and tells; hardware wallets sit in a drawer */
export function Problem({ dur }: P) {
  const f = useCurrentFrame();
  const half = Math.round(dur * 0.62);
  const a1 = interpolate(f, [0, 18, half - 12, half + 6], [0, 1, 1, 0], clamp);
  const a2 = interpolate(f, [half, half + 20], [0, 1], clamp);
  const pings = ["You won an airdrop!", "Claim 500 USDC now", "Approve this request?", "New message"];
  const close = interpolate(f, [half + 40, half + 85], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  return (
    <AbsoluteFill>
      <Glow shift={40} />
      <AbsoluteFill style={{ opacity: a1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 120 }}>
        <Phone>
          <div style={{ position: "absolute", inset: "70px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            {pings.map((p, i) => {
              const t = interpolate(f, [20 + i * 18, 34 + i * 18], [0, 1], clamp);
              return (
                <div key={p} style={{ opacity: t, transform: `translateY(${(1 - t) * -20}px)`, background: "#F3F4F8", borderRadius: 18, padding: "16px 18px", fontFamily: SANS, fontSize: 22, color: C.ink }}>
                  {p}
                </div>
              );
            })}
            <div style={{ flex: 1 }} />
            <div style={{ opacity: interpolate(f, [110, 130], [0, 1], clamp), background: C.ink, color: "#fff", borderRadius: 22, padding: "22px 18px", fontFamily: SANS, fontSize: 24, textAlign: "center" }}>
              Sign transaction?
              <div style={{ marginTop: 14, background: "#fff", color: C.ink, borderRadius: 14, padding: "12px 0", fontWeight: 600 }}>Approve</div>
            </div>
          </div>
        </Phone>
        <div style={{ width: 760, display: "flex", flexDirection: "column", gap: 18 }}>
          <Pop start={40}>
            <Title size={84}>The screen that asks you to sign</Title>
          </Pop>
          <Pop start={90}>
            <Title size={84} style={{ color: C.ink2 }}>
              is the screen that tells you what you're signing.
            </Title>
          </Pop>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: a2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 140 }}>
        <div style={{ width: 620, height: 440, position: "relative" }}>
          {/* a drawer with a plain device inside; the front slides shut */}
          <div style={{ position: "absolute", inset: 0, borderRadius: 26, background: "#EEF0F5", border: `1px solid ${C.line}` }} />
          <div style={{ position: "absolute", left: 210, top: 150, width: 200, height: 120, borderRadius: 18, background: "#C9CCD6", boxShadow: "inset 0 -6px 0 rgba(0,0,0,0.08)" }}>
            <div style={{ position: "absolute", left: 30, top: 34, width: 140, height: 40, borderRadius: 8, background: "#9EA3B0" }} />
          </div>
          <div style={{ position: "absolute", left: -10, right: -10, bottom: -10, height: 270 * close, borderRadius: 28, background: "#fff", border: `1px solid ${C.line}`, boxShadow: "0 30px 60px -30px rgba(31,35,48,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 120, height: 14, borderRadius: 7, background: "#D9DCE4", opacity: close }} />
          </div>
        </div>
        <div style={{ width: 720 }}>
          <Pop start={half + 10}>
            <Title size={84}>Hardware wallets fix that.</Title>
          </Pop>
          <Pop start={half + 70}>
            <Title size={84} style={{ color: C.ink2 }}>
              But they live in a drawer.
            </Title>
          </Pop>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* 3 · the idea: the safest screen is from 1989 */
export function Idea({ dur }: P) {
  const f = useCurrentFrame();
  const mid = Math.round(dur * 0.42);
  const q = interpolate(f, [0, 18, mid - 10, mid + 8], [0, 1, 1, 0], clamp);
  const reveal = useSpring(mid);
  return (
    <AbsoluteFill>
      <Glow shift={80} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: q }}>
        <Title size={110} style={{ textAlign: "center", width: 1500 }}>
          What if the safest screen
          <br />
          you own is from <span style={{ fontFamily: PX, fontWeight: 400, letterSpacing: 0 }}>1989</span>?
        </Title>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: reveal }}>
        <Img src={a("01-renders/hero-gameboy-3q.png")} style={{ position: "absolute", right: -160, top: 10, width: 1640, WebkitMaskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, #000 62%, transparent 100%)", maskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, #000 62%, transparent 100%)", transform: `translateY(${(1 - reveal) * 60}px)` }} />
        <div style={{ position: "absolute", left: 140, top: 330, width: 760, display: "flex", flexDirection: "column", gap: 26 }}>
          <Pop start={mid + 10}>
            <div style={{ whiteSpace: "nowrap" }}><Eyebrow>No Wi-Fi · no apps · no browser</Eyebrow></div>
          </Pop>
          <Pop start={mid + 24}>
            <Title size={150}>kagiboy</Title>
          </Pop>
          <Pop start={mid + 40}>
            <div style={{ fontFamily: SANS, fontSize: 48, lineHeight: 1.25, color: C.ink }}>Your keys, in a Game Boy cartridge.</div>
          </Pop>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* 4 · how it feels: setup like a new game, then hold A */
const STEPS = [
  { at: 0.0, eyebrow: "Step 1", title: "Mash and shake", screens: ["03-mash-buttons", "04-shake"] },
  { at: 0.2, eyebrow: "Step 2", title: "Write 12 words", screens: ["05-recovery-words"] },
  { at: 0.3, eyebrow: "Step 3", title: "Pick a PIN", screens: ["06-choose-pin"] },
  { at: 0.4, eyebrow: "Step 4", title: "Pair your phone", screens: ["08-pair-code"] },
  { at: 0.58, eyebrow: "Every request", title: "Hold A to sign", screens: ["11-approve-send", "12-signed-confirmed"] },
];
export function How({ dur }: P) {
  const f = useCurrentFrame();
  const p = f / dur;
  const all = STEPS.flatMap((s) => s.screens);
  // which screen shows: each step's screens split its stretch of time
  let idx = 0;
  STEPS.forEach((s, i) => {
    const end = STEPS[i + 1]?.at ?? 1;
    if (p >= s.at) {
      const k = Math.min(s.screens.length - 1, Math.floor(((p - s.at) / (end - s.at)) * s.screens.length));
      idx = all.indexOf(s.screens[k]);
    }
  });
  const signStart = STEPS[4].at * dur;
  const hold = interpolate(f, [signStart + 45, signStart + 110], [0, 1], clamp);
  const pairing = p >= STEPS[3].at && p < STEPS[4].at;
  return (
    <AbsoluteFill>
      <Glow shift={120} />
      <div style={{ position: "absolute", left: 150, top: 150, display: "flex", flexDirection: "column", gap: 34 }}>
        <Pop start={0}>
          <Eyebrow>Setup feels like starting a new game</Eyebrow>
        </Pop>
        {STEPS.map((s, i) => {
          const on = p >= s.at && p < (STEPS[i + 1]?.at ?? 1.01);
          const seen = p >= s.at;
          return (
            <div key={s.title} style={{ opacity: seen ? (on ? 1 : 0.35) : 0.12, transition: "none", display: "flex", alignItems: "baseline", gap: 28 }}>
              <span style={{ fontFamily: PX, fontSize: 28, color: on ? C.accent : C.ink3, width: 300, whiteSpace: "nowrap" }}>{s.eyebrow}</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 70, letterSpacing: -2.5, color: C.ink }}>{s.title}</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", right: 170, top: 60 }}>
        <GameBoy
          screens={all}
          at={idx}
          height={960}
          overlay={
            // the HOLD TO SIGN bar fills while A is held (approve screen only)
            idx === all.indexOf("11-approve-send") ? (
              <div style={{ position: "absolute", left: "13.6%", top: "91.4%", width: `${72.8 * hold}%`, height: "2.2%", background: "#526658", borderRadius: 4 }} />
            ) : null
          }
        />
      </div>
      {pairing && (
        <div style={{ position: "absolute", left: 150, top: 800, opacity: interpolate(f, [STEPS[3].at * dur, STEPS[3].at * dur + 15], [0, 1], clamp) }}>
          <Card style={{ padding: "26px 34px", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: SANS, fontSize: 22, color: C.ink2 }}>On your phone</span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 64, letterSpacing: 6, color: C.ink }}>636073</span>
          </Card>
        </div>
      )}
    </AbsoluteFill>
  );
}

/* 5 · it works today: the live demo, a swap, the real console */
export function Proof({ dur }: P) {
  const f = useCurrentFrame();
  const b1 = Math.round(dur * 0.5);
  const s1 = interpolate(f, [0, 18, b1 - 10, b1 + 6], [0, 1, 1, 0], clamp);
  const s2 = interpolate(f, [b1, b1 + 18], [0, 1], clamp);
  const chains = ["solana", "ethereum", "base", "arbitrum", "hyperevm"];
  return (
    <AbsoluteFill>
      <Glow shift={160} />
      <AbsoluteFill style={{ opacity: s1, alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 1500, borderRadius: 24, overflow: "hidden", background: "#fff", boxShadow: "0 50px 90px -40px rgba(31,35,48,0.5)", border: `1px solid ${C.line}`, transform: `scale(${1 + (f / b1) * 0.04})` }}>
          <div style={{ height: 56, background: "#F3F4F8", display: "flex", alignItems: "center", gap: 10, padding: "0 22px" }}>
            {["#FF6159", "#FFBD2E", "#28C941"].map((c) => (
              <span key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
            ))}
            <span style={{ marginLeft: 24, background: "#fff", borderRadius: 10, padding: "6px 18px", fontFamily: SANS, fontSize: 22, color: C.ink2 }}>kagiboy.xyz/demo</span>
          </div>
          <Img src={a("03-website-screenshots/desktop-13-demo.png")} style={{ width: "100%", display: "block" }} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: s2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 120 }}>
        <GameBoy screens={["13-approve-swap"]} height={900} />
        <div style={{ width: 760, display: "flex", flexDirection: "column", gap: 30 }}>
          <Pop start={b1 + 6}>
            <Eyebrow>Live demo · six chains</Eyebrow>
          </Pop>
          <Pop start={b1 + 16}>
            <Title size={80}>Six chains. Every swap checked on the Game Boy first.</Title>
          </Pop>
          <Pop start={b1 + 34}>
            <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
              {chains.map((c) => (
                <Img key={c} src={a(`07-chain-logos/${c}.png`)} style={{ width: 72, height: 72, borderRadius: 36 }} />
              ))}
              <Img src={a("07-chain-logos/robinhood.svg")} style={{ width: 72, height: 72, borderRadius: 36 }} />
            </div>
          </Pop>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* 6 · what's inside */
const CHIPS = [
  ["NXP SE050E2", "Keeps your keys. Five wrong PINs and it wipes."],
  ["RP2350", "Talks to the Game Boy, reads every request."],
  ["CYW43439", "Bluetooth to your phone. Public data only."],
  ["LIS3DH", "Turns a shake into randomness."],
];
export function Inside({ dur }: P) {
  const step = Math.round((dur * 0.7) / CHIPS.length);
  return (
    <AbsoluteFill>
      <Glow shift={200} />
      <Pop start={0} style={{ position: "absolute", left: 180, top: 60 }} y={40}>
        <Img src={a("01-renders/cartridge-exploded.png")} style={{ height: 1000, WebkitMaskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, #000 55%, transparent 100%)", maskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, #000 55%, transparent 100%)" }} />
      </Pop>
      <div style={{ position: "absolute", left: 900, top: 170, width: 860, display: "flex", flexDirection: "column", gap: 26 }}>
        <Pop start={4}>
          <Eyebrow>Inside the cartridge</Eyebrow>
        </Pop>
        {CHIPS.map(([n, d], i) => (
          <Pop key={n} start={16 + i * step}>
            <Card style={{ padding: "28px 34px", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontFamily: PX, fontSize: 34, color: C.ink }}>{n}</span>
              <span style={{ fontFamily: SANS, fontSize: 32, color: C.ink2 }}>{d}</span>
            </Card>
          </Pop>
        ))}
      </div>
    </AbsoluteFill>
  );
}

/* 7 · who it's for: the Game Boy generation, and a wallet you'd keep on a shelf */
const PRODUCTS: { h: string; d: string; art: "cart" | "limited" | "japan" | "bundle" }[] = [
  { h: "$129", d: "The cartridge", art: "cart" },
  { h: "Limited", d: "Numbered colourways", art: "limited" },
  { h: "Japan", d: "A Japan-only edition", art: "japan" },
  { h: "Bundle", d: "With a restored Game Boy", art: "bundle" },
];

/** The picture on each product card: studio renders of the real model (assets/3d/products.py), one size. */
function ProductArt({ art }: { art: (typeof PRODUCTS)[number]["art"] }) {
  const dark = art === "japan";
  return (
    <div style={{ position: "relative", height: 300, borderRadius: 22, overflow: "hidden", background: dark ? "radial-gradient(70% 70% at 50% 42%, #2b3150, #0f1119)" : "linear-gradient(165deg,#EEF3FF,#FBF3F7)" }}>
      <Img src={a(`01-renders/prod-${art}.png`)} style={{ position: "absolute", left: "50%", top: "50%", width: 352, height: 352, transform: "translate(-50%, -50%)", objectFit: "cover" }} />
      {art === "limited" && <div style={{ position: "absolute", right: 14, bottom: 14, background: C.ink, color: "#fff", borderRadius: 999, padding: "8px 14px", fontFamily: PX, fontSize: 20, letterSpacing: 2 }}>No. 001/500</div>}
      {dark && (
        <>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 700, fontSize: 110, color: "rgba(255,255,255,0.9)" }}>?</div>
          <div style={{ position: "absolute", left: 16, top: 14, fontFamily: PX, fontSize: 20, letterSpacing: 3, color: "#cfe2ff" }}>JAPAN ONLY</div>
        </>
      )}
    </div>
  );
}

export function Who({ dur, marks = [] }: P) {
  const f = useCurrentFrame();
  // the shelf holds until the products line, then the cards come in as they're named
  const b1 = marks.find((m) => m.text.startsWith("You put it on your shelf"))?.at ?? Math.round(dur * 0.3);
  const b2 = marks.find((m) => m.text.startsWith("We're starting"))?.at ?? Math.round(dur * 0.6);
  const s1 = interpolate(f, [0, 18, b1 - 10, b1 + 6], [0, 1, 1, 0], clamp);
  const s2 = interpolate(f, [b1, b1 + 18, b2 - 10, b2 + 6], [0, 1, 1, 0], clamp);
  const s3 = interpolate(f, [b2, b2 + 18], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Glow shift={240} />
      <AbsoluteFill style={{ opacity: s1, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20 }}>
        <Eyebrow>Game Boy and Game Boy Color sold</Eyebrow>
        <Title size={260} style={{ letterSpacing: -10 }}>118.69M</Title>
        <div style={{ fontFamily: SANS, fontSize: 22, color: C.ink3 }}>Source: Wikipedia</div>
      </AbsoluteFill>
      <Sequence from={b1 - 4} durationInFrames={b2 - b1 + 14}>
        <AbsoluteFill style={{ opacity: s2 }}>
          {/* a slow turn, like an object on a shelf */}
          <Console
            screens={["01-boot"]}
            shot={{ p: () => 0, screen: () => "01-boot", pose: (t) => ({ az: -0.9 + t * 0.16, el: 0.14, dist: 0.5, tx: 0.004, ty: 0.03, lift: 0, shift: 0.2 }) }}
          />
          <div style={{ position: "absolute", left: 140, top: 420, width: 760 }}>
            <Pop start={14}>
              <Title size={92}>Something you put on a shelf.</Title>
            </Pop>
          </div>
        </AbsoluteFill>
      </Sequence>
      <AbsoluteFill style={{ opacity: s3, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 48 }}>
        <Pop start={b2 + 4}>
          <Eyebrow>For the Game Boy generation</Eyebrow>
        </Pop>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 380px)", gap: 28 }}>
          {PRODUCTS.map((pr, i) => (
            <Pop key={pr.h} start={b2 + [20, 48, 80, 140][i]}>
              <Card style={{ width: 380, height: 500, padding: 14, display: "flex", flexDirection: "column", gap: 16, boxSizing: "border-box" }}>
                <ProductArt art={pr.art} />
                <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 52, letterSpacing: -1.5, color: C.ink, lineHeight: 1.05 }}>{pr.h}</span>
                  <span style={{ fontFamily: SANS, fontSize: 26, color: C.ink2, whiteSpace: "nowrap" }}>{pr.d}</span>
                </div>
              </Card>
            </Pop>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

const ROAD = ["A real cartridge", "The kagiboy brand", "Security audits", "Then on sale"];
export function Next({ dur, marks = [] }: P) {
  const f = useCurrentFrame();
  // the closing line comes up as it's spoken
  const b = marks.find((m) => m.text.startsWith("Crypto"))?.at ?? Math.round(dur * 0.55);
  const s1 = interpolate(f, [0, 18, b - 10, b + 6], [0, 1, 1, 0], clamp);
  const s2 = interpolate(f, [b, b + 24], [0, 1], clamp);
  const line = interpolate(f, [10, b - 30], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Glow shift={280} />
      <AbsoluteFill style={{ opacity: s1, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 70 }}>
        <Eyebrow>What's next</Eyebrow>
        <div style={{ position: "relative", width: 1500, display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div style={{ position: "absolute", left: "12.5%", right: "12.5%", top: 23, height: 4, background: C.line }} />
          <div style={{ position: "absolute", left: "12.5%", width: `${75 * line}%`, top: 23, height: 4, background: C.accent }} />
          {ROAD.map((r, i) => {
            const on = line >= i / 3 - 0.001;
            return (
              <div key={r} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
                <div style={{ width: 50, height: 50, borderRadius: 25, background: on ? C.accent : "#fff", border: `4px solid ${on ? C.accent : C.line}`, position: "relative" }} />
                <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 44, letterSpacing: -1.5, color: on ? C.ink : C.ink3, textAlign: "center" }}>{r}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: s2, alignItems: "center", justifyContent: "center" }}>
        <Title size={96} style={{ textAlign: "center", width: 1500 }}>
          Crypto shouldn't feel scary.
          <br />
          <span style={{ color: C.ink2 }}>It should feel like that day at the flea market.</span>
        </Title>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* end card */
export function End() {
  const gb = useSpring(0);
  return (
    <AbsoluteFill>
      <Glow shift={320} />
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 130 }}>
        <GameBoy screens={["01-boot"]} height={860} style={{ opacity: gb, transform: `translateY(${(1 - gb) * 40}px)` }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 30, width: 760 }}>
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
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, textAlign: "center", fontFamily: SANS, fontSize: 22, color: C.ink3 }}>
        Testnets only. The cartridge hardware is in progress. Not affiliated with Nintendo; Game Boy is a trademark of Nintendo.
      </div>
    </AbsoluteFill>
  );
}
