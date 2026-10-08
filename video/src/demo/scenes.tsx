import type { ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, DISPLAY, EASE, Glow, PX, SANS, a } from "../ui";
import { Explode } from "./ExplodeView";
import type { ExplodeAnchor } from "../../../web/src/landing/explode";
import {
  AT,
  Big,
  CAM,
  Callout,
  Check,
  Code,
  EXPLORER,
  GREEN,
  LcdGameBoy,
  LcdPanel,
  MONO,
  PINK,
  Panel,
  PhoneCrop,
  Pill,
  Rec,
  SceneFade,
  SectionTag,
  Show,
  c,
  clamp,
  k,
  markSec,
  p,
  s,
  useCamera,
  type P,
  type Seg,
} from "./kit";
// the chip's real errors, captured by running these requests against web/src/chip/chip.ts
import refusals from "./refusals.json";

const useT = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return f / fps;
};
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (u: number, v: number, t: number) => u + (v - u) * t;

/* 0 · how kagiboy works: an isometric exploded view of the console and the cartridge */
type Tag = { anchor: ExplodeAnchor; eyebrow: string; line: string; side: "left" | "right"; y: number; at: number };
// labels sit in two tidy columns, each with a leader line to its part
const OPEN_TAGS: Tag[] = [
  { anchor: "gb:Bezel", eyebrow: "LENS", line: "Bezel and glass", side: "left", y: 250, at: 0 },
  { anchor: "gb:DPad", eyebrow: "BUTTONS", line: "You approve here", side: "left", y: 365, at: 0.2 },
  { anchor: "gb:Screen", eyebrow: "SCREEN", line: "Shows every request", side: "left", y: 480, at: 0.4 },
  { anchor: "gb:CPU", eyebrow: "MAIN BOARD", line: "Runs the kagiboy ROM", side: "left", y: 595, at: 0.6 },
  { anchor: "gb:Batteries", eyebrow: "4 × AA", line: "No network, no OS", side: "left", y: 710, at: 0.8 },
  { anchor: "cart:SecureElement", eyebrow: "NXP SE050", line: "Holds the keys", side: "right", y: 280, at: 0.6 },
  { anchor: "cart:MCU", eyebrow: "RP2350", line: "Talks to the Game Boy", side: "right", y: 400, at: 0.85 },
  { anchor: "cart:BLE", eyebrow: "CYW43439", line: "Bluetooth, public data", side: "right", y: 520, at: 1.1 },
  { anchor: "cart:Accel", eyebrow: "LIS3DH", line: "Shake for randomness", side: "right", y: 640, at: 1.35 },
];
export function D0({ dur }: P) {
  const t = useT();
  const sec = dur / 30;
  const go = 1.3; // the title first, then it comes apart
  const apart = (u: number) => ease(interpolate(u, [go, go + 2.4], [0, 1], clamp));
  const tagsAt = go + 2.2;
  return (
    <SceneFade>
      <Glow shift={20} />
      <Explode
        p={apart}
        view={(u) => ({ az: lerp(0.7, 0.86, u / sec), el: 0.58, zoom: lerp(0.26, 0.46, apart(u)), cx: 0.004, cy: lerp(0.015, 0.115, apart(u)), cz: 0 })}
        anchors={OPEN_TAGS.map((g) => g.anchor)}
        labels={(at) => (
          <>
            <svg style={{ position: "absolute", inset: 0 }} width={1920} height={1080}>
              {OPEN_TAGS.map((g) => {
                const o = interpolate(t, [tagsAt + g.at, tagsAt + g.at + 0.4], [0, 1], clamp);
                const p0 = at[g.anchor];
                const x1 = g.side === "left" ? 360 : 1560;
                return o > 0 && p0 ? <path key={g.anchor} d={`M ${x1} ${g.y + 34} L ${(x1 + p0.x) / 2} ${g.y + 34} L ${p0.x} ${p0.y}`} fill="none" stroke={C.ink3} strokeWidth={1.5} strokeDasharray="4 5" opacity={o * 0.8} /> : null;
              })}
              {OPEN_TAGS.map((g) => {
                const o = interpolate(t, [tagsAt + g.at, tagsAt + g.at + 0.4], [0, 1], clamp);
                const p0 = at[g.anchor];
                return o > 0 && p0 ? <circle key={g.anchor + "d"} cx={p0.x} cy={p0.y} r={5} fill={C.accent} opacity={o} /> : null;
              })}
            </svg>
            {OPEN_TAGS.map((g) => (
              <Show key={g.anchor} from={tagsAt + g.at} style={{ position: "absolute", inset: 0 }}>
                <Callout x={g.side === "left" ? 360 : 1560} y={g.y} eyebrow={g.eyebrow} anchor={g.side === "left" ? "right" : "left"}>
                  {g.line}
                </Callout>
              </Show>
            ))}
          </>
        )}
      />
      <Show from={0.2} to={go + 0.8} style={{ position: "absolute", left: 0, right: 0, top: 70, textAlign: "center" }}>
        <span style={{ fontFamily: PX, fontSize: 22, letterSpacing: 6, color: C.accent }}>TECHNICAL WALKTHROUGH</span>
        <Big size={88} style={{ marginTop: 14 }}>How kagiboy works</Big>
      </Show>
    </SceneFade>
  );
}

/* 1 · the system: the live demo, and its three parts named */
export function D1({ dur, marks }: P) {
  const M = markSec(marks);
  const t = useT();
  const push = Math.max(1.6, M(1, 4.8) - 0.5);
  const cams = [
    { t: 0, ...CAM.top },
    { t: push, ...CAM.top },
    { t: push + 1.3, ...CAM.duo },
  ];
  const cam = useCamera(cams, { w: 1920, h: 1080 });
  const at = (x: number, y: number) => cam.to(x, y);
  const key = t >= M(5, 14);
  const dim = key ? 0.38 : 1;
  const gbL = at(600, 470);
  const phR = at(1549, 470);
  const chip = at(1080, 560);
  return (
    <SceneFade>
      <Rec src="demo/create.mp4" segs={[{ at: 0, from: 0.6 }]} cams={cams} />
      <SectionTag n="01">The system</SectionTag>
      <Show from={M(1, 5)} style={{ position: "absolute", inset: 0, opacity: dim }}>
        <Callout x={gbL.x - 22} y={gbL.y} eyebrow="GAME BOY" anchor="right">
          The real ROM · C, GBDK
        </Callout>
      </Show>
      <Show from={M(2, 10)} style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", inset: 0, transform: `scale(${key ? 1.08 : 1})`, transformOrigin: `${chip.x}px ${chip.y - 110}px` }}>
          <Callout x={chip.x} y={chip.y - 150} eyebrow="CARTRIDGE CHIP" accent={key ? PINK : C.accent}>
            {key ? "Holds the keys" : "Simulated in the browser"}
          </Callout>
        </div>
      </Show>
      <Show from={M(3, 12)} style={{ position: "absolute", inset: 0, opacity: dim }}>
        <Callout x={phR.x + 18} y={phR.y} eyebrow="PHONE APP" anchor="left">
          web3.js · viem · SODAX
        </Callout>
      </Show>
    </SceneFade>
  );
}

/* 2 · architecture: the cartridge slot is the only wire */
const MB_ROWS: [string, string, string, "req" | "resp" | "gap"][] = [
  ["D800", "REQ_SEQ", "07", "req"],
  ["D801", "CMD", "08 SIGN", "req"],
  ["D802", "REQ_LEN", "01", "req"],
  ["D803", "ARG", "01", "req"],
  ["D804", "REQ …", "", "req"],
  ["", "", "", "gap"],
  ["D840", "RESP_SEQ", "07", "resp"],
  ["D841", "STATUS", "00 OK", "resp"],
  ["D842", "RESP_LEN", "00", "resp"],
  ["D844", "RESP …", "", "resp"],
];

function Node({ x, y, w, h, title, sub, children, from, accent = C.accent }: { x: number; y: number; w: number; h: number; title: string; sub?: string; children?: ReactNode; from: number; accent?: string }) {
  return (
    <Show from={from} style={{ position: "absolute", left: x, top: y, width: w, height: h }}>
      <div style={{ width: w, height: h, boxSizing: "border-box", borderRadius: 26, background: "#fff", border: `1px solid ${C.line}`, boxShadow: "0 30px 60px -36px rgba(60,70,120,0.5)", padding: "22px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontFamily: PX, fontSize: 17, letterSpacing: 3, color: accent }}>{title}</span>
        {sub && <span style={{ fontFamily: SANS, fontSize: 23, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{sub}</span>}
        {children}
      </div>
    </Show>
  );
}

function Wire({ x1, y1, x2, y2, from, dashed = false, label, pulse }: { x1: number; y1: number; x2: number; y2: number; from: number; dashed?: boolean; label?: string; pulse?: number }) {
  const t = useT();
  const d = interpolate(t, [from, from + 0.6], [0, 1], { ...clamp, easing: EASE });
  if (d <= 0) return null;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const pp = pulse !== undefined ? interpolate(t, [pulse, pulse + 0.9], [0, 1], clamp) : -1;
  return (
    <>
      <svg style={{ position: "absolute", inset: 0, overflow: "visible" }} width={1920} height={1080}>
        <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * d} y2={y1 + (y2 - y1) * d} stroke={dashed ? "#9AA3BD" : C.ink} strokeWidth={dashed ? 3 : 4} strokeDasharray={dashed ? "10 10" : undefined} strokeLinecap="round" />
        {pp > 0 && pp < 1 && <circle cx={lerp(x1, x2, pp)} cy={lerp(y1, y2, pp)} r={9} fill={C.accent} />}
      </svg>
      {label && (
        <div style={{ position: "absolute", left: (x1 + x2) / 2, top: Math.max(y1, y2) + 22, transform: "translateX(-50%)", opacity: d, fontFamily: PX, fontSize: 14, letterSpacing: 2, lineHeight: 1.5, color: C.ink3, textAlign: "center", whiteSpace: "pre" }}>
          {label}
        </div>
      )}
      {len === 0 && null}
    </>
  );
}

function Mailbox({ from, write, reply, x, y }: { from: number; write: number; reply: number; x: number; y: number }) {
  const t = useT();
  return (
    <Show from={from} style={{ position: "absolute", left: x, top: y, width: 400 }}>
      <Panel title="MAILBOX · 0xD800" style={{ width: 400 }}>
        <div style={{ padding: "12px 16px 16px", fontFamily: MONO, fontSize: 20 }}>
          {MB_ROWS.map(([addr, name, val, kind], i) => {
            if (kind === "gap") return <div key={i} style={{ height: 10 }} />;
            // the request is written first (the sequence number last), then the reply (its sequence number last)
            const order = kind === "req" ? (i === 0 ? 4 : i - 1) : i === 6 ? 4 : i - 7;
            const on = kind === "req" ? write + order * 0.28 : reply + order * 0.28;
            const lit = interpolate(t, [on, on + 0.25], [0, 1], clamp);
            const fade = kind === "req" ? interpolate(t, [reply - 0.4, reply], [1, 0.45], clamp) : 1;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "66px 1fr auto", gap: 12, alignItems: "center", padding: "5px 10px", borderRadius: 10, background: lit > 0 ? `rgba(${kind === "req" ? "207,226,255" : "255,220,232"},${0.85 * lit * fade})` : "transparent" }}>
                <span style={{ color: C.ink3 }}>{addr}</span>
                <span style={{ color: C.ink }}>{name}</span>
                <span style={{ color: kind === "req" ? C.accent : PINK, opacity: lit }}>{val}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </Show>
  );
}

/** a short label on a line: one word above it, a few below, never on top of the line itself */
function LineLabel({ x, y, above, below, from }: { x: number; y: number; above?: string; below?: string; from: number }) {
  const st = { position: "absolute" as const, left: x, transform: "translateX(-50%)", fontFamily: PX, fontSize: 14, letterSpacing: 2, color: C.ink3, whiteSpace: "pre" as const, textAlign: "center" as const, lineHeight: 1.5 };
  return (
    <Show from={from} style={{ position: "absolute", inset: 0 }}>
      {above && <div style={{ ...st, top: y - 34 }}>{above}</div>}
      {below && <div style={{ ...st, top: y + 16 }}>{below}</div>}
    </Show>
  );
}

// the diagram's grid: one row of parts on y = ROW
const ROW = 500;
export function D2({ marks }: P) {
  const M = markSec(marks);
  const t = useT();
  const slot = M(2, 3.8);
  const rom = M(4, 6.4);
  const phone = M(5, 12.3);
  const trust = interpolate(t, [M(7, 18), M(7, 18) + 0.8], [0, 1], { ...clamp, easing: EASE });
  return (
    <SceneFade>
      <Glow shift={60} />
      <SectionTag n="02">Architecture</SectionTag>
      {/* the trust boundary: everything the keys depend on is in your hands; the phone is outside */}
      {trust > 0 && (
        <>
          <svg style={{ position: "absolute", inset: 0 }} width={1920} height={1080}>
            <rect x={96} y={190} width={1250} height={640} rx={40} fill="rgba(207,226,255,0.16)" stroke={C.accent} strokeWidth={3} strokeDasharray="14 12" opacity={trust} />
          </svg>
          <div style={{ position: "absolute", left: 128, top: 172, opacity: trust }}>
            <Pill color="#fff" bg={C.accent}>
              IN YOUR HANDS
            </Pill>
          </div>
          <div style={{ position: "absolute", left: 1680, top: 258, transform: "translateX(-50%)", opacity: trust }}>
            <Pill color="#fff" bg={PINK}>
              NEVER TRUSTED
            </Pill>
          </div>
        </>
      )}
      <Show from={0.3} style={{ position: "absolute", left: 156, top: ROW - 230 }}>
        <img src={a("01-renders/gameboy-front.png")} style={{ height: 440, filter: "drop-shadow(0 30px 40px rgba(60,70,120,0.25))" }} />
      </Show>
      <Show from={0.3} style={{ position: "absolute", left: 150, top: ROW + 236, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontFamily: PX, fontSize: 16, letterSpacing: 3, color: C.accent }}>GAME BOY · ROM IN C</span>
        <div style={{ display: "flex", gap: 10 }}>
          <Show from={M(0, 0.5) + 0.8}>
            <Pill color={C.ink2} bg="#F1F2F6">
              NO NETWORK
            </Pill>
          </Show>
          <Show from={M(1, 1.5) + 0.1}>
            <Pill color={C.ink2} bg="#F1F2F6">
              NO OS
            </Pill>
          </Show>
        </div>
      </Show>
      <Wire x1={418} y1={ROW} x2={556} y2={ROW} from={slot} pulse={M(3, 5.2)} />
      <LineLabel x={487} y={ROW} above="SLOT" below="THE WIRE" from={slot} />
      <Mailbox x={556} y={ROW - 250} from={rom} write={rom + 0.9} reply={rom + 3.2} />
      <Wire x1={956} y1={ROW} x2={1040} y2={ROW} from={rom + 2.2} />
      <Node x={1040} y={ROW - 100} w={262} h={200} title="CHIP" sub="Keys never leave it" from={rom + 2.2} accent={PINK}>
        <span style={{ fontFamily: SANS, fontSize: 19, color: C.ink3, lineHeight: 1.3 }}>secure element · signs</span>
      </Node>
      <Show from={M(6, 16)} style={{ position: "absolute", left: 1040, top: ROW + 130, display: "flex", flexDirection: "column", gap: 12 }}>
        <Pill color="#fff" bg={C.ink}>
          ← REQUESTS IN
        </Pill>
        <Show from={M(6, 16) + 0.6}>
          <Pill color="#fff" bg={C.accent}>
            SIGNATURES OUT →
          </Pill>
        </Show>
      </Show>
      <Wire x1={1302} y1={ROW} x2={1540} y2={ROW} from={phone} dashed />
      <LineLabel x={1443} y={ROW} above="BLUETOOTH" below={"PUBLIC DATA\nONLY"} from={phone} />
      <Node x={1540} y={ROW - 150} w={290} h={300} title="PHONE APP" sub="Builds requests, broadcasts" from={phone}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontFamily: MONO, fontSize: 19, color: C.ink2 }}>
          <span>@solana/web3.js</span>
          <span>viem</span>
          <span>SODAX SDK</span>
        </div>
      </Node>
      <Show from={phone + 0.6} style={{ position: "absolute", left: 1540, top: ROW + 180, width: 290, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontFamily: PX, fontSize: 15, letterSpacing: 2, color: C.ink3 }}>TALKS TO</span>
        <Pill color={C.ink} bg="#fff" style={{ border: `1px solid ${C.line}` }}>
          SOLANA DEVNET
        </Pill>
        <Pill color={C.ink} bg="#fff" style={{ border: `1px solid ${C.line}` }}>
          EVM TESTNETS
        </Pill>
        <Pill color={C.ink} bg="#fff" style={{ border: `1px solid ${C.line}` }}>
          SODAX API
        </Pill>
      </Show>
    </SceneFade>
  );
}

/* 3 · keys: entropy in, twelve words out, both derivation paths */
export function D3({ marks }: P) {
  const M = markSec(marks);
  // the take: mashing, the shake, the words (slowed while they're explained), then the PIN twice
  const segs: Seg[] = [
    { at: 0, from: 7.8 },
    { at: 6.0, from: 15.0 },
    { at: 12.5, from: 21.5, rate: 0.5 },
    { at: 21.5, from: 26.2, rate: 0.85 },
  ];
  const paths = M(2, 12.4);
  // the code card comes in with the first line it explains
  return (
    <SceneFade>
      <Glow shift={120} />
      <SectionTag n="03">Keys</SectionTag>
      <div style={{ position: "absolute", left: 130, top: 120 }}>
        <LcdGameBoy src="demo/create-lcd.mp4" segs={segs} height={860} />
      </div>
      <Show from={11.6} to={22} style={{ position: "absolute", left: 250, top: 54 }}>
        <span style={{ fontFamily: SANS, fontSize: 21, color: C.ink3 }}>A fresh test wallet, made for this recording</span>
      </Show>
      <Show from={0.3} style={{ position: "absolute", left: 720, top: 112 }}>
        <Panel title="CARTRIDGE BUS · LIVE" right={<Pill color={GREEN} bg="#DFF3E6">REC</Pill>}>
          <Rec src="demo/create.mp4" segs={segs} cams={[{ t: 0, ...AT.busLog, x: AT.busLog.x - 6, w: AT.busLog.w + 12 }]} box={{ w: 1060, h: 449 }} />
        </Panel>
      </Show>
      <Show from={M(0, 0.5) + 0.8} style={{ position: "absolute", left: 720, top: 640 }}>
        <Panel title="KEYS · chip/keys.ts" style={{ width: 1060 }}>
          <Code
            size={23}
            at={[M(0, 0.5) + 1.0, M(1, 6) - 0.2, paths, paths + 1.6, M(3, 23.5)]}
            hi={{ from: paths + 3.2, line: [2, 3] }}
            lines={[
              [c("entropy  "), p("SHA-256( button + shake pool ‖ chip TRNG )")],
              [c("phrase   "), p("BIP-39 · 12 words · 128 bits")],
              [c("solana   "), p("SLIP-10 ed25519   "), s("m/44'/501'/0'/0'"), c("   Phantom")],
              [c("evm      "), p("BIP-32 secp256k1  "), s("m/44'/60'/0'/0/0"), c("   MetaMask")],
              [c("pin      "), p("entered twice · salted SHA-256 · "), k("5 wrong → wipe")],
            ]}
          />
        </Panel>
      </Show>
    </SceneFade>
  );
}

/* 4 · pairing: the same six digits on both screens, and only while the Game Boy listens */
export function D4({ marks }: P) {
  const M = markSec(marks);
  const cams = [
    { t: 0, ...CAM.duo },
    { t: M(1, 3.3) - 0.6, ...CAM.duo },
    { t: M(1, 3.3) + 0.6, ...CAM.codes },
  ];
  return (
    <SceneFade>
      <Rec src="demo/create.mp4" segs={[{ at: 0, from: 33.3, rate: 0.96 }]} cams={cams} />
      <SectionTag n="04">Pairing</SectionTag>
      <Show from={M(1, 3.3) + 0.6} style={{ position: "absolute", left: 800, top: 360 }}>
        <Callout x={0} y={0} eyebrow="SAME SIX DIGITS">
          on the Game Boy and on the phone
        </Callout>
      </Show>
      <Show from={M(0, 0.5) + 0.4} to={M(1, 3.3) - 0.2} style={{ position: "absolute", left: 960, top: 60 }}>
        <Callout x={0} y={0} eyebrow="PAIR WINDOW" accent={PINK}>
          Only while the Game Boy is listening
        </Callout>
      </Show>
    </SceneFade>
  );
}

/* 5 · signing on Solana: the raw message, decoded on the chip, signed, confirmed, on devnet */
export function D5({ dur, marks }: P) {
  const M = markSec(marks);
  const t = useT();
  const sec = dur / 30;
  const chipAt = M(2, 6.3);
  const screenAt = M(6, 16.1);
  const holdAt = M(7, 19.5);
  const fakeAt = M(8, 25);
  const devnet = M(9, 31.6);
  // the take: typing on the phone, the request arriving, the sign screen, A held, confirmed
  const phoneSegs: Seg[] = [{ at: 0, from: 17.0 }];
  const lcdSegs: Seg[] = [
    { at: 0, from: 17.0 },
    { at: chipAt, from: 23.4, rate: (27.4 - 23.4) / (screenAt - chipAt) },
    { at: screenAt, from: 27.4, rate: (30.9 - 27.4) / (holdAt - screenAt) },
    { at: holdAt, from: 30.9 },
    { at: holdAt + 3.6, from: 34.5, rate: 0.5 },
  ];
  const phase = t < chipAt ? 0 : t < screenAt ? 1 : t < holdAt ? 2 : t < fakeAt ? 3 : t < devnet ? 4 : 5;
  const x1 = interpolate(t, [chipAt - 0.5, chipAt + 0.5], [0, 1], { ...clamp, easing: EASE });
  const zoom = interpolate(t, [screenAt - 0.5, screenAt + 0.6, holdAt - 0.3, holdAt + 0.6], [0, 1, 1, 0], { ...clamp, easing: EASE });
  return (
    <SceneFade>
      <Glow shift={160} />
      <SectionTag n="05">Signing on Solana</SectionTag>
      {phase < 5 && (
        <>
          {/* the phone, until the chip takes over */}
          <div style={{ position: "absolute", left: lerp(170, -520, x1), top: 110, opacity: 1 - x1 }}>
            <PhoneCrop src="demo/solana.mp4" segs={phoneSegs} height={880} />
          </div>
          <Show from={M(1, 2.4)} to={chipAt + 0.2} style={{ position: "absolute", left: 760, top: 210 }}>
            <Panel title="PHONE · phone/phone.ts" style={{ width: 1000 }}>
              <Code
                size={23}
                at={[M(1, 2.4), M(1, 2.4) + 0.4, M(1, 2.4) + 0.8, M(1, 2.4) + 1.6, M(1, 2.4) + 2.4]}
                lines={[
                  [k("const "), p("tx = "), k("new "), p("Transaction({ feePayer, recentBlockhash })")],
                  [p("  .add(SystemProgram."), k("transfer"), p("({ fromPubkey, toPubkey, lamports }));")],
                  [],
                  [c("// only the serialized message crosses Bluetooth")],
                  [p("chip."), k("requestSignature"), p("({ chain: "), s('"sol"'), p(", tx });")],
                ]}
              />
            </Panel>
          </Show>
          {/* the Game Boy: the request lands, the chip's checks, then the sign screen up close */}
          <div style={{ position: "absolute", left: lerp(1300, 150, x1) + lerp(0, 420, zoom), top: lerp(120, 100, x1) - zoom * 20, opacity: x1 > 0 ? 1 : 0, transform: `scale(${1 + zoom * 0.2})`, transformOrigin: "50% 40%" }}>
            {phase >= 1 && phase < 4 && (zoom > 0.98 ? (
              <LcdPanel src="demo/solana-lcd.mp4" segs={lcdSegs} width={820} />
            ) : (
              <LcdGameBoy src="demo/solana-lcd.mp4" segs={lcdSegs} height={860} />
            ))}
          </div>
          <Show from={chipAt + 0.3} to={screenAt - 0.2} style={{ position: "absolute", left: 790, top: 160 }}>
            <Panel title="CHIP · decodeRequest · chip/chip.ts" style={{ width: 980 }}>
              <div style={{ padding: "26px 30px 30px", display: "flex", flexDirection: "column", gap: 20 }}>
                <Check at={chipAt + 0.9}>Copies the message bytes, decodes them itself</Check>
                <Check at={M(3, 9.5) + 0.3}>Fee payer is this cartridge</Check>
                <Check at={M(4, 11) + 0.2}>Exactly one instruction</Check>
                <Check at={M(5, 12.5) + 0.2}>System Program · Transfer</Check>
                <Check at={M(5, 12.5) + 1.5}>From this cartridge, fits the screen in full</Check>
              </div>
            </Panel>
          </Show>
          <Show from={screenAt + 0.4} to={holdAt - 0.1} style={{ position: "absolute", left: 120, top: 330, display: "flex", flexDirection: "column", gap: 22 }}>
            <Callout x={0} y={0} eyebrow="AMOUNT" anchor="left">
              Exact, to the lamport
            </Callout>
            <Callout x={0} y={118} eyebrow="FEE" anchor="left">
              From the message itself
            </Callout>
            <Callout x={0} y={236} eyebrow="TO" anchor="left">
              The full address, 3 lines
            </Callout>
          </Show>
          {phase >= 3 && phase < 5 && (
            <div style={{ position: "absolute", left: 150, top: 100 }}>
              <LcdGameBoy src="demo/solana-lcd.mp4" segs={lcdSegs} height={860} />
            </div>
          )}
          <Show from={holdAt + 0.2} to={fakeAt - 0.1} style={{ position: "absolute", left: 790, top: 250 }}>
            <Panel title="HOLD A · ONE SECOND" style={{ width: 980 }}>
              <div style={{ padding: "26px 30px 30px", display: "flex", flexDirection: "column", gap: 20 }}>
                <Check at={holdAt + 0.6}>The chip signs the same bytes: ed25519</Check>
                <Check at={holdAt + 2.0}>The phone only broadcasts</Check>
                <Check at={holdAt + 3.4}>Confirmed on devnet</Check>
              </div>
            </Panel>
          </Show>
          <Show from={fakeAt} to={devnet} style={{ position: "absolute", left: 790, top: 220 }}>
            <Panel title="CHIP · setTxStatus · chip/chip.ts" style={{ width: 1000 }}>
              <Code
                size={23}
                at={[fakeAt + 0.2, fakeAt + 0.5, fakeAt + 1.0, fakeAt + 1.4]}
                hi={{ from: fakeAt + 1.6, line: [2] }}
                lines={[
                  [c("// the chip knows the hash of what it signed;")],
                  [c("// the phone can't put any other on the screen")],
                  [k("if "), p("(!cur.hash || detail.hash !== cur.hash) "), k("return"), p(";")],
                  [p("text = "), s("`${hash.slice(0, 8)}..${hash.slice(-8)}`"), p(";")],
                ]}
              />
            </Panel>
          </Show>
        </>
      )}
      {phase === 5 && <Explorer from={devnet} end={sec} />}
    </SceneFade>
  );
}

// the explorer page, captured whole (scripts/record/explorer-page.mjs), in CSS px
const EXPLORER_PAGE = { w: 1920, h: 1901 };
function Explorer({ from, end }: { from: number; end: number }) {
  const t = useT();
  const glide = from + Math.min(2.2, (end - from) * 0.35);
  const settle = glide + 2.4;
  const top = { x: 420, y: 70, w: 1100 };
  const low = { x: 0, y: 830, w: 1920 };
  const cams = [
    { t: from, ...top },
    { t: glide, ...top },
    { t: settle, ...low },
  ];
  const cam = useCamera(cams, { w: 1920, h: 1080 });
  const o = interpolate(t, [from, from + 0.4], [0, 1], clamp);
  const sigRow = cam.to(1460, 366);
  const amount = cam.to(940, 1680);
  return (
    <AbsoluteFill style={{ opacity: o, background: "#1b1d1e" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: EXPLORER_PAGE.w, height: EXPLORER_PAGE.h, transform: `translate(${cam.ox}px, ${cam.oy}px) scale(${cam.s})`, transformOrigin: "0 0" }}>
        <Img src={staticFile("demo/explorer-page.png")} style={{ width: EXPLORER_PAGE.w, height: EXPLORER_PAGE.h, display: "block" }} />
      </div>
      <SectionTag n="05" dark>
        On Solana devnet
      </SectionTag>
      <Show from={from + 0.5} to={glide + 0.2} style={{ position: "absolute", inset: 0 }}>
        <Callout x={sigRow.x - 20} y={sigRow.y + 40} eyebrow="SAME SIGNATURE" anchor="right">
          as on the Game Boy
        </Callout>
      </Show>
      <Show from={settle - 0.2} style={{ position: "absolute", inset: 0 }}>
        <Callout x={amount.x + 30} y={amount.y - 110} eyebrow="SYSTEM PROGRAM · TRANSFER" anchor="left">
          0.05 SOL, as decoded on the chip
        </Callout>
      </Show>
    </AbsoluteFill>
  );
}

/* 6 · refusals: the chip's own errors for requests it can't show in full */
const SHORT: Record<string, string> = {
  "SPL token instruction": "A token instruction",
  "two transfers in one": "A second transfer",
  "someone else pays the fee": "Someone else pays the fee",
  "contract call on Base": "A contract call on Base",
  "fee above the cap": "A fee above the cap",
};
export function D6({ marks }: P) {
  const M = markSec(marks);
  const list = M(2, 4.7);
  const rows = (refusals as { name: string; error: string }[]).filter((r) => SHORT[r.name]);
  const gaps = [0, 0.9, 1.9, 2.7, 3.4];
  return (
    <SceneFade>
      <Glow shift={200} />
      <SectionTag n="06">What it refuses</SectionTag>
      <Show from={0.3} style={{ position: "absolute", left: 140, top: 150 }}>
        <Big size={70}>No blind signing.</Big>
        <div style={{ fontFamily: SANS, fontSize: 28, color: C.ink2, marginTop: 14 }}>The chip's real answers to requests it can't show in full.</div>
      </Show>
      <div style={{ position: "absolute", left: 140, top: 350, width: 1640, display: "flex", flexDirection: "column", gap: 16 }}>
        {rows.map((r, i) => (
          <Show key={r.name} from={list + gaps[i]} y={10}>
            <div style={{ display: "grid", gridTemplateColumns: "400px 1fr auto", alignItems: "center", gap: 26, padding: "20px 28px", borderRadius: 22, background: "#fff", border: `1px solid ${C.line}`, boxShadow: "0 20px 40px -32px rgba(60,70,120,0.5)" }}>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 28, color: C.ink }}>{SHORT[r.name]}</span>
              <span style={{ fontFamily: MONO, fontSize: 21, color: C.ink2, whiteSpace: "nowrap" }}>Error: {r.error}</span>
              <Pill color="#fff" bg={PINK}>
                REFUSED
              </Pill>
            </div>
          </Show>
        ))}
      </div>
    </SceneFade>
  );
}

/* 7 · EVM and swaps: one key, five testnets; SODAX quotes, checked against the cartridge's own list */
// the cartridge's EVM allowlist (testnets), in the order LEFT/RIGHT steps through them
const NETS: [string, string, string][] = [
  ["Ethereum Sepolia", "ethereum.png", "11155111"],
  ["Base Sepolia", "base.png", "84532"],
  ["Arbitrum Sepolia", "arbitrum.png", "421614"],
  ["HyperEVM testnet", "hyperevm.png", "998"],
  ["Robinhood Chain", "robinhood.svg", "46630"],
];
export function D7({ marks }: P) {
  const M = markSec(marks);
  const t = useT();
  const swap = M(1, 8);
  const sent = M(2, 19.6);
  const screen = Math.max(swap + 4.2, sent - 3.6);
  // the take: RIGHT through the networks, the swap tab and quote, the swap screen, A held
  const netRate = (21.9 - 13.0) / (swap - 0.2);
  const recSegs: Seg[] = [{ at: 0, from: 13.0, rate: netRate }];
  const phoneSegs: Seg[] = [{ at: 0, from: 27.5, rate: (33.9 - 27.5) / (screen - swap) }];
  const lcdSegs: Seg[] = [
    { at: 0, from: 37.6, rate: (42.0 - 37.6) / (sent - screen) },
    { at: sent - screen, from: 42.0 },
  ];
  // which network the Game Boy is on: the take's RIGHT presses, in scene time
  const take = 13.0 + t * netRate;
  // the take logged each mark after the press and its 1.5 s wait, so the presses were 1.62 s earlier
  const presses = [15.13, 16.81, 18.55, 20.2, 21.9].map((m) => m - 1.62);
  const net = presses.filter((x) => take >= x).length % 5;
  return (
    <SceneFade>
      {t < swap ? (
        <>
          <Glow shift={240} />
          {/* the Game Boy's own screen as RIGHT steps through the networks, and the list it steps through */}
          <div style={{ position: "absolute", left: 170, top: 110 }}>
            <LcdGameBoy src="demo/evm-lcd.mp4" segs={recSegs} height={860} />
          </div>
          <Show from={0.4} style={{ position: "absolute", left: 820, top: 150, width: 560 }}>
            <Panel title="NETWORKS · chip/networks.ts">
              <div style={{ padding: "14px 16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                {NETS.map(([n, logo, id], i) => (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderRadius: 16, background: i === net ? C.ink : "transparent", color: i === net ? "#fff" : C.ink }}>
                    <Img src={a(`07-chain-logos/${logo}`)} style={{ width: 34, height: 34, borderRadius: 17, objectFit: "contain", background: "#fff" }} />
                    <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 27, flex: 1 }}>{n}</span>
                    <span style={{ fontFamily: MONO, fontSize: 19, opacity: 0.6 }}>{id}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </Show>
          <Show from={M(0, 0.5) + 2.6} style={{ position: "absolute", left: 1420, top: 330 }}>
            <Callout x={0} y={0} eyebrow="ALLOWLIST" anchor="left">
              Other chains are refused
            </Callout>
            <Callout x={0} y={118} eyebrow="FEE CAP" anchor="left">
              0.01 of the network's coin
            </Callout>
          </Show>
        </>
      ) : (
        <>
          <Glow shift={240} />
          {t < screen ? (
            <>
              <div style={{ position: "absolute", left: 170, top: 110 }}>
                <PhoneCrop src="demo/evm.mp4" segs={phoneSegs.map((g) => ({ ...g, at: g.at + swap }))} height={880} />
              </div>
              <Show from={swap + 0.4} style={{ position: "absolute", left: 760, top: 180 }}>
                <Panel title="SWAP INTENT · what the phone sends" style={{ width: 1010 }}>
                  <Code
                    size={23}
                    at={[swap + 0.6, swap + 0.9, swap + 1.2, swap + 1.5, swap + 1.8, swap + 2.1, swap + 2.4]}
                    hi={{ from: swap + 2.6, line: [2, 5] }}
                    lines={[
                      [p("{ src: { chain: "), s('"sol"'), p(" },")],
                      [p("  dst: { chain: "), s('"evm"'), p(", net: "), k("84532"), p(" },")],
                      [p("  sellToken: "), s('"11111111111111111111111111111111"'), p(",")],
                      [p("  sellAmount: "), k("1000000000n"), p(",")],
                      [p("  minReceive: "), k("111990495n"), p(",")],
                      [p("  buyToken: "), s('"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"'), p(" }")],
                      [c("// quoted live by the SODAX SDK")],
                    ]}
                  />
                </Panel>
              </Show>
              <Show from={swap + 2.8} style={{ position: "absolute", left: 760, top: 650 }}>
                <Panel title="THE CARTRIDGE'S OWN LIST · chip/tokens.ts" style={{ width: 1010 }}>
                  <Code
                    size={23}
                    at={[swap + 3.0, swap + 3.3]}
                    lines={[
                      [s('"11111111111111111111111111111111"'), p(": { symbol: "), s('"SOL"'), p(", decimals: "), k("9"), p(" }")],
                      [s('"0x833589fc…bda02913"'), p(": { symbol: "), s('"USDC"'), p(", decimals: "), k("6"), p(" }")],
                    ]}
                  />
                </Panel>
              </Show>
            </>
          ) : (
            <>
              <div style={{ position: "absolute", left: 150, top: 120 }}>
                <LcdPanel src="demo/evm-lcd.mp4" segs={lcdSegs.map((g) => ({ ...g, at: g.at + screen }))} width={760} />
              </div>
              <Show from={screen + 0.3} style={{ position: "absolute", left: 1090, top: 260, display: "flex", flexDirection: "column", gap: 24 }}>
                <Callout x={0} y={0} eyebrow="SEND" anchor="left">
                  1 SOL, symbol from the cartridge
                </Callout>
                <Callout x={0} y={118} eyebrow="GET AT LEAST" anchor="left">
                  USDC on Base, after every fee
                </Callout>
              </Show>
              <Show from={sent} style={{ position: "absolute", left: 1090, top: 560 }}>
                <Callout x={0} y={0} eyebrow="DEMO BUILD" anchor="left" accent={PINK}>
                  Signed on the cartridge, never sent
                </Callout>
              </Show>
            </>
          )}
        </>
      )}
      <SectionTag n="07">EVM and swaps</SectionTag>
    </SceneFade>
  );
}

/* 8 · hardware and source */
const HW: [string, string][] = [
  ["NXP SE050", "Keys move into the secure element"],
  ["RP2350", "Speaks the same 0xD800 mailbox"],
  ["CYW43439", "Bluetooth LE to the phone"],
];
// hazy's own Game Boy running the ROM from a flash cart (the About page's photos), in the order of the flow
const PRINTS: { src: string; w: number; h: number; x: number; y: number; rot: number }[] = [
  { src: "real/boot.webp", w: 440, h: 414, x: 930, y: 110, rot: -6 },
  { src: "real/mash.webp", w: 360, h: 450, x: 1350, y: 80, rot: 4 },
  { src: "real/pin.webp", w: 360, h: 450, x: 1010, y: 410, rot: 3 },
  { src: "real/home.webp", w: 380, h: 475, x: 1420, y: 385, rot: -3 },
];
function Print({ src, w, h, x, y, rot, at }: { src: string; w: number; h: number; x: number; y: number; rot: number; at: number }) {
  const t = useT();
  const q = ease(interpolate(t, [at, at + 0.7], [0, 1], clamp));
  if (q <= 0) return null;
  // settles from a little higher and more tilted, then keeps drifting very slowly
  const drift = (t - at) * 1.4;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y + (1 - q) * -50 + drift * 0.4,
        width: w,
        padding: 12,
        paddingBottom: 34,
        background: "#fff",
        borderRadius: 6,
        boxShadow: "0 30px 60px -28px rgba(40,44,90,0.55), 0 2px 6px rgba(40,44,90,0.12)",
        transform: `rotate(${rot + (1 - q) * 5}deg) scale(${1.04 - 0.04 * q})`,
        opacity: q,
      }}
    >
      <Img src={staticFile(src)} style={{ display: "block", width: w - 24, height: h - 24 * (h / w), objectFit: "cover", borderRadius: 2 }} />
    </div>
  );
}
export function D8({ marks }: P) {
  const M = markSec(marks);
  const t = useT();
  const romAt = M(0, 0.5) + 3.6;
  const endAt = M(2, 9.3); // "go try it yourself"
  const card = interpolate(t, [endAt - 0.2, endAt + 0.6], [0, 1], { ...clamp, easing: EASE });
  return (
    <SceneFade>
      <Glow shift={300} />
      <AbsoluteFill style={{ opacity: 1 - card }}>
        {PRINTS.map((pr, i) => (
          <Print key={pr.src} {...pr} at={0.5 + i * 0.55} />
        ))}
        <div style={{ position: "absolute", left: 120, top: 190, width: 700, display: "flex", flexDirection: "column", gap: 18 }}>
          <Show from={0.4}>
            <span style={{ fontFamily: PX, fontSize: 22, letterSpacing: 5, color: C.accent }}>THE REAL CARTRIDGE</span>
          </Show>
          {HW.map(([n, d], i) => (
            <Show key={n} from={0.7 + i * 0.6}>
              <div style={{ padding: "18px 26px", borderRadius: 22, background: "rgba(255,255,255,0.9)", border: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: PX, fontSize: 26, color: C.ink }}>{n}</span>
                <span style={{ fontFamily: SANS, fontSize: 24, color: C.ink2 }}>{d}</span>
              </div>
            </Show>
          ))}
          <Show from={romAt}>
            <div style={{ marginTop: 10, padding: "22px 26px", borderRadius: 22, background: C.ink, color: "#fff", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: PX, fontSize: 19, letterSpacing: 3, color: "#9FE3B8" }}>
                <span style={{ width: 11, height: 11, borderRadius: 6, background: "#47D17C" }} />
                ALREADY RUNNING
              </span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 38, letterSpacing: -1 }}>On a real Game Boy, today</span>
              <span style={{ fontFamily: SANS, fontSize: 23, color: "rgba(255,255,255,0.72)" }}>The same ROM, from a flash cart, on an original DMG</span>
            </div>
          </Show>
        </div>
      </AbsoluteFill>
      {card > 0 && <EndCard o={card} foot={false} />}
      {card < 1 && <SectionTag n="08">Hardware and source</SectionTag>}
    </SceneFade>
  );
}

export function EndCard({ o = 1, foot = true }: { o?: number; foot?: boolean }) {
  return (
    <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 34 }}>
      <Glow shift={340} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
        <span style={{ fontFamily: PX, fontSize: 24, letterSpacing: 6, color: C.accent }}>OPEN SOURCE · MIT</span>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 150, letterSpacing: -6, color: C.ink, lineHeight: 1 }}>kagiboy</div>
        <div style={{ display: "inline-flex", background: C.ink, color: "#fff", borderRadius: 999, padding: "22px 44px", fontFamily: SANS, fontWeight: 600, fontSize: 42 }}>kagiboy.xyz/demo</div>
        <div style={{ fontFamily: SANS, fontSize: 32, color: C.ink2 }}>github.com/hazy2go/kagiboy</div>
        <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
          {["SOLANA DEVNET", "EVM TESTNETS", "SWAPS NEVER BROADCAST"].map((x) => (
            <Pill key={x} color={C.ink2} bg="#fff" style={{ border: `1px solid ${C.line}` }}>
              {x}
            </Pill>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 40, fontFamily: SANS, fontSize: 21, color: C.ink3, opacity: foot ? 1 : 0 }}>
        The cartridge chip is simulated in the web demo; the hardware is in progress. Not affiliated with Nintendo.
      </div>
    </AbsoluteFill>
  );
}

export const DEMO_SCENES = [D0, D1, D2, D3, D4, D5, D6, D7, D8];
