import type { ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, DISPLAY, EASE, Glow, PX, SANS, a } from "../ui";
import { Console } from "../Three";
import { poseAt as poseAtP } from "../../../web/src/landing/scene";
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

/* 1 · the system: the live demo, and its three parts named */
export function D1({ dur, marks }: P) {
  const M = markSec(marks);
  const t = useT();
  const push = M(1, 4.8) - 0.5;
  const cams = [
    { t: 0, ...CAM.top },
    { t: push, ...CAM.top },
    { t: push + 1.3, ...CAM.duo },
  ];
  const cam = useCamera(cams, { w: 1920, h: 1080 });
  const at = (x: number, y: number) => cam.to(x, y);
  const key = t >= M(4, 14);
  const dim = key ? 0.38 : 1;
  const gbL = at(600, 470);
  const phR = at(1549, 470);
  const chip = at(1080, 560);
  return (
    <SceneFade>
      <Rec src="demo/create.mp4" segs={[{ at: 0, from: 0.6 }]} cams={cams} />
      <SectionTag n="01">The system</SectionTag>
      <Show from={0.35} to={push} style={{ position: "absolute", left: 96, bottom: 150 }}>
        <div style={{ padding: "26px 34px 30px", borderRadius: 28, background: "rgba(255,255,255,0.94)", border: `1px solid ${C.line}`, boxShadow: "0 30px 60px -34px rgba(40,44,90,0.5)" }}>
          <div style={{ fontFamily: PX, fontSize: 20, letterSpacing: 5, color: C.accent }}>TECHNICAL WALKTHROUGH</div>
          <Big size={76} style={{ marginTop: 10 }}>How kagiboy works</Big>
          <div style={{ fontFamily: SANS, fontSize: 26, color: C.ink2, marginTop: 10 }}>Recorded live at kagiboy.xyz/demo · testnets</div>
        </div>
      </Show>
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

function Mailbox({ from, write, reply }: { from: number; write: number; reply: number }) {
  const t = useT();
  return (
    <Show from={from} style={{ position: "absolute", left: 600, top: 236, width: 420 }}>
      <Panel title="MAILBOX · 0xD800" style={{ width: 420 }}>
        <div style={{ padding: "12px 18px 18px", fontFamily: MONO, fontSize: 21 }}>
          {MB_ROWS.map(([addr, name, val, kind], i) => {
            if (kind === "gap") return <div key={i} style={{ height: 10 }} />;
            // the request is written first (the sequence number last), then the reply (its sequence number last)
            const order = kind === "req" ? (i === 0 ? 4 : i - 1) : i === 6 ? 4 : i - 7;
            const on = kind === "req" ? write + order * 0.28 : reply + order * 0.28;
            const lit = interpolate(t, [on, on + 0.25], [0, 1], clamp);
            const fade = kind === "req" ? interpolate(t, [reply - 0.4, reply], [1, 0.45], clamp) : 1;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 1fr auto", gap: 12, alignItems: "center", padding: "6px 10px", borderRadius: 10, background: lit > 0 ? `rgba(${kind === "req" ? "207,226,255" : "255,220,232"},${0.85 * lit * fade})` : "transparent" }}>
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

export function D2({ marks }: P) {
  const M = markSec(marks);
  const t = useT();
  const trust = interpolate(t, [M(6, 18), M(6, 18) + 0.8], [0, 1], { ...clamp, easing: EASE });
  return (
    <SceneFade>
      <Glow shift={60} />
      <SectionTag n="02">Architecture</SectionTag>
      {/* the trust boundary: everything the keys depend on is in your hands */}
      {trust > 0 && (
        <>
          <svg style={{ position: "absolute", inset: 0 }} width={1920} height={1080}>
            <rect x={96} y={170} width={1290} height={720} rx={40} fill="rgba(207,226,255,0.16)" stroke={C.accent} strokeWidth={3} strokeDasharray="14 12" opacity={trust} pathLength={1} strokeDashoffset={0} />
          </svg>
          <div style={{ position: "absolute", left: 130, top: 150, opacity: trust }}>
            <Pill color="#fff" bg={C.accent}>
              IN YOUR HANDS
            </Pill>
          </div>
          <div style={{ position: "absolute", left: 1640, top: 270, transform: "translateX(-50%)", opacity: trust }}>
            <Pill color="#fff" bg={PINK}>
              NEVER TRUSTED
            </Pill>
          </div>
        </>
      )}
      <Show from={0.3} style={{ position: "absolute", left: 170, top: 240 }}>
        <img src={a("01-renders/gameboy-front.png")} style={{ height: 480, filter: "drop-shadow(0 30px 40px rgba(60,70,120,0.25))" }} />
      </Show>
      <Show from={0.3} style={{ position: "absolute", left: 160, top: 740, display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontFamily: PX, fontSize: 17, letterSpacing: 3, color: C.accent }}>GAME BOY · ROM IN C</span>
        <div style={{ display: "flex", gap: 10 }}>
          <Show from={M(0, 0.5) + 1.2}>
            <Pill color={C.ink2} bg="#F1F2F6">
              NO NETWORK
            </Pill>
          </Show>
          <Show from={M(0, 0.5) + 1.9}>
            <Pill color={C.ink2} bg="#F1F2F6">
              NO OS
            </Pill>
          </Show>
        </div>
      </Show>
      <Wire x1={442} y1={480} x2={598} y2={480} from={M(1, 3.8)} label={"CARTRIDGE\nSLOT"} pulse={M(2, 5.2)} />
      <Mailbox from={M(3, 6.4)} write={M(3, 6.4) + 0.9} reply={M(3, 6.4) + 3.4} />
      <Wire x1={1022} y1={480} x2={1110} y2={480} from={M(3, 6.4) + 2.2} />
      <Node x={1110} y={380} w={250} h={200} title="CHIP" sub="Keys never leave it" from={M(3, 6.4) + 2.2} accent={PINK}>
        <span style={{ fontFamily: SANS, fontSize: 19, color: C.ink3, lineHeight: 1.3 }}>secure element · signs</span>
      </Node>
      <Wire x1={1362} y1={480} x2={1508} y2={480} from={M(4, 12.3)} dashed label={"BLUETOOTH\nPUBLIC DATA\nONLY"} />
      <Node x={1508} y={330} w={300} h={300} title="PHONE APP" sub="Builds requests, broadcasts" from={M(4, 12.3)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, fontFamily: MONO, fontSize: 19, color: C.ink2 }}>
          <span>@solana/web3.js</span>
          <span>viem</span>
          <span>SODAX SDK</span>
        </div>
      </Node>
      <Show from={M(4, 12.3) + 0.6} style={{ position: "absolute", left: 1508, top: 660, width: 300, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontFamily: PX, fontSize: 15, letterSpacing: 2, color: C.ink3 }}>TALKS TO</span>
        <Pill color={C.ink} bg="#fff" style={{ border: `1px solid ${C.line}` }}>
          SOLANA DEVNET RPC
        </Pill>
        <Pill color={C.ink} bg="#fff" style={{ border: `1px solid ${C.line}` }}>
          EVM TESTNETS
        </Pill>
        <Pill color={C.ink} bg="#fff" style={{ border: `1px solid ${C.line}` }}>
          SODAX API
        </Pill>
      </Show>
      <Show from={M(5, 16)} style={{ position: "absolute", left: 1110, top: 600 }}>
        <Pill color="#fff" bg={C.ink}>
          ← REQUESTS IN
        </Pill>
      </Show>
      <Show from={M(5, 16) + 0.8} style={{ position: "absolute", left: 1110, top: 650 }}>
        <Pill color="#fff" bg={C.accent}>
          SIGNATURES OUT →
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
      <Show from={paths - 0.2} style={{ position: "absolute", left: 720, top: 640 }}>
        <Panel title="KEYS · chip/keys.ts" style={{ width: 1060 }}>
          <Code
            size={23}
            at={[paths, paths + 0.5, paths + 2.2, paths + 3.6, M(4, 23.5)]}
            hi={{ from: M(3, 20.6), line: [2, 3] }}
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
    { t: M(2, 7.7) - 0.4, ...CAM.codes },
    { t: M(2, 7.7) + 0.9, ...CAM.duo },
  ];
  return (
    <SceneFade>
      <Rec src="demo/create.mp4" segs={[{ at: 0, from: 33.3, rate: 0.96 }]} cams={cams} />
      <SectionTag n="04">Pairing</SectionTag>
      <Show from={M(1, 3.3) + 0.5} to={M(2, 7.7) - 0.2} style={{ position: "absolute", left: 800, top: 360 }}>
        <Callout x={0} y={0} eyebrow="SAME SIX DIGITS">
          on the Game Boy and on the phone
        </Callout>
      </Show>
      <Show from={M(2, 7.7) + 0.3} style={{ position: "absolute", left: 960, top: 60 }}>
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
  const screenAt = M(4, 16.1);
  const holdAt = M(5, 19.5);
  const fakeAt = M(6, 25);
  const devnet = M(8, 31.6);
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
                <Check at={M(3, 9.5) + 1.6}>Exactly one instruction</Check>
                <Check at={M(3, 9.5) + 3.0}>System Program · Transfer</Check>
                <Check at={M(3, 9.5) + 4.4}>From this cartridge, fits the screen in full</Check>
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
                hi={{ from: M(7, 27) + 0.2, line: [2] }}
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

function Explorer({ from, end }: { from: number; end: number }) {
  const t = useT();
  const cut = from + (end - from) * 0.5;
  const top = { x: 380, y: 60, w: 1160 };
  const low = { x: 0, y: 150, w: 1600 };
  const second = t >= cut;
  const o = interpolate(t, [from, from + 0.4], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      {!second ? (
        <Rec src="demo/explorer.mp4" page={EXPLORER} segs={[{ at: from, from: 0.9 }]} cams={[{ t: 0, ...top }, { t: from + 0.3, ...top }, { t: cut, ...top, x: 400, y: 80, w: 1100 }]} />
      ) : (
        <Rec src="demo/explorer.mp4" page={EXPLORER} segs={[{ at: cut, from: 12.7, rate: 0.45 }]} cams={[{ t: 0, ...low }]} />
      )}
      <SectionTag n="05" dark>
        On Solana devnet
      </SectionTag>
      {!second ? (
        <Show from={from + 0.5} style={{ position: "absolute", right: 70, top: 150 }}>
          <Callout x={0} y={0} eyebrow="SAME SIGNATURE" anchor="right">
            as on the Game Boy
          </Callout>
        </Show>
      ) : (
        <Show from={cut + 0.3} style={{ position: "absolute", right: 70, top: 800 }}>
          <Callout x={0} y={0} eyebrow="SYSTEM PROGRAM · TRANSFER" anchor="right">
            0.05 SOL, as decoded on the chip
          </Callout>
        </Show>
      )}
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
  const gaps = [0, 1.25, 2.4, 3.9, 5.0];
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
const NETS: [string, string][] = [
  ["Ethereum", "ethereum.png"],
  ["Base", "base.png"],
  ["Arbitrum", "arbitrum.png"],
  ["HyperEVM", "hyperevm.png"],
  ["Robinhood", "robinhood.svg"],
];
export function D7({ marks }: P) {
  const M = markSec(marks);
  const t = useT();
  const swap = M(1, 8);
  const screen = M(3, 14.4) + 0.4;
  const sent = M(4, 19.6);
  // the take: RIGHT through the networks, the swap tab and quote, the swap screen, A held
  const netRate = (21.9 - 13.0) / (swap - 0.2);
  const recSegs: Seg[] = [{ at: 0, from: 13.0, rate: netRate }];
  const phoneSegs: Seg[] = [{ at: 0, from: 25.0, rate: (33.9 - 25.0) / (screen - swap) }];
  const lcdSegs: Seg[] = [
    { at: 0, from: 37.6, rate: (42.0 - 37.6) / (sent - screen) },
    { at: sent - screen, from: 42.0 },
  ];
  // which network the Game Boy is on: the take's RIGHT presses, in scene time
  const take = 13.0 + t * netRate;
  const presses = [15.13, 16.81, 18.55, 20.2, 21.9];
  const net = presses.filter((x) => take >= x).length % 5;
  return (
    <SceneFade>
      {t < swap ? (
        <>
          <Rec src="demo/evm.mp4" segs={recSegs} cams={[{ t: 0, ...CAM.duo }, { t: 1.2, x: 520, y: 260, w: 1180 }]} />
          <Show from={0.6} style={{ position: "absolute", left: 420, top: 40, display: "flex", gap: 12 }}>
            {NETS.map(([n, logo], i) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px 12px 14px", borderRadius: 999, background: i === net ? C.ink : "rgba(255,255,255,0.95)", color: i === net ? "#fff" : C.ink, border: `1px solid ${C.line}`, fontFamily: SANS, fontWeight: 600, fontSize: 22, boxShadow: "0 14px 30px -20px rgba(40,44,90,0.5)" }}>
                <Img src={a(`07-chain-logos/${logo}`)} style={{ width: 28, height: 28, borderRadius: 14, objectFit: "contain", background: "#fff" }} />
                {n}
              </div>
            ))}
          </Show>
          <Show from={M(0, 0.5) + 3.2} style={{ position: "absolute", right: 80, top: 150 }}>
            <Callout x={0} y={0} eyebrow="CHAIN ALLOWLIST · FEE CAP" anchor="right">
              Max fee 0.01 of the network's coin
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
                    at={[swap + 0.6, swap + 0.9, M(2, 11.2), M(2, 11.2) + 0.3, swap + 1.2, M(2, 11.2) + 0.6, swap + 1.5]}
                    hi={{ from: M(2, 11.2), line: [2, 5] }}
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
              <Show from={M(3, 14.4) - 1.2} style={{ position: "absolute", left: 760, top: 650 }}>
                <Panel title="THE CARTRIDGE'S OWN LIST · chip/tokens.ts" style={{ width: 1010 }}>
                  <Code
                    size={23}
                    at={[M(3, 14.4) - 1, M(3, 14.4) - 0.6]}
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
export function D8({ dur, marks }: P) {
  const M = markSec(marks);
  const t = useT();
  const sec = dur / 30;
  const endAt = M(2, 10.6);
  const card = interpolate(t, [endAt - 0.2, endAt + 0.6], [0, 1], { ...clamp, easing: EASE });
  return (
    <SceneFade>
      <Glow shift={300} />
      <AbsoluteFill style={{ opacity: 1 - card }}>
        <Console
          screens={["09-home"]}
          shot={{
            p: (u) => lerp(0.38, 0.56, ease(Math.min(1, u / (sec * 0.4)))),
            screen: () => "09-home",
            pose: (u) => {
              const at = poseAtP(lerp(0.38, 0.56, ease(Math.min(1, u / (sec * 0.4)))));
              return { ...at, dist: at.dist + 0.09, shift: 0.21 };
            },
          }}
        />
        <div style={{ position: "absolute", left: 130, top: 230, width: 720, display: "flex", flexDirection: "column", gap: 22 }}>
          <Show from={0.4}>
            <span style={{ fontFamily: PX, fontSize: 22, letterSpacing: 5, color: C.accent }}>THE REAL CARTRIDGE</span>
          </Show>
          {HW.map(([n, d], i) => (
            <Show key={n} from={0.8 + i * 1.6}>
              <div style={{ padding: "22px 30px", borderRadius: 24, background: "rgba(255,255,255,0.9)", border: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontFamily: PX, fontSize: 30, color: C.ink }}>{n}</span>
                <span style={{ fontFamily: SANS, fontSize: 27, color: C.ink2 }}>{d}</span>
              </div>
            </Show>
          ))}
          <Show from={M(1, 9.1)}>
            <Pill color="#fff" bg={C.ink} style={{ fontSize: 18 }}>
              THE ROM DOESN'T CHANGE
            </Pill>
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

export const DEMO_SCENES = [D1, D2, D3, D4, D5, D6, D7, D8];
