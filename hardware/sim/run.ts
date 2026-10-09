// Runs the whole simulation and writes hardware/sim/out/results.json plus a summary on stdout.
//   cd web && pnpm sim            (or: hardware/sim/node_modules/.bin/tsx hardware/sim/run.ts)
// Needs rom/build/wallet-hw.gb: cd rom && make hw

import { mkdirSync, writeFileSync } from "node:fs";
import { buildDesign, PIN, type Rev, type Variant } from "./programs";
import { mailboxAtA000, rng, sampleTrial, simulate, type SimResult } from "./cartsim";
import { runSession, WindowRecorder, FRAME_T } from "./session";
import { tToMs, type Corner } from "./firmware";
import { power } from "./power";
import { RP2350, SE050 } from "./params";
import type { CycleSink, Kind } from "./tracer";

const MHZ = Number(process.env.MHZ ?? 150);
const TRIALS = Number(process.env.TRIALS ?? 12);
const out = new URL("./out/", import.meta.url);
mkdirSync(out, { recursive: true });
const log = (...a: unknown[]) => console.log(...a);

/** Whole-run statistics of the bus traffic the cartridge has to serve. */
class BusStats implements CycleSink {
  cycles = 0;
  kinds: Record<Kind, number> = { romR: 0, romW: 0, cramR: 0, cramW: 0, wramR: 0, wramW: 0, none: 0 };
  run = 0;
  maxRun = 0;
  recent: number[] = [];
  maxWritesIn8 = 0;
  mailboxReads = 0;
  cycle(kind: Kind, addr: number) {
    this.cycles++;
    this.kinds[kind]++;
    if (kind === "romR" || kind === "cramR") this.maxRun = Math.max(this.maxRun, ++this.run);
    else this.run = 0;
    if (kind === "romR" && addr >= 0x7f00) this.mailboxReads++;
    if (kind === "romW" || kind === "cramW" || kind === "wramW") {
      this.recent.push(this.cycles);
      while (this.recent[0] <= this.cycles - 8) this.recent.shift();
      this.maxWritesIn8 = Math.max(this.maxWritesIn8, this.recent.length);
    }
  }
  idle(n: number) {
    this.cycles += n;
    this.kinds.none += n;
    this.run = 0;
  }
}

// ---------- 1. the real ROM through a whole session, typical and worst-case firmware timing ----------
const stats = new BusStats();
const rec = new WindowRecorder(10, 400);
const t0 = Date.now();
const typ = await runSession({ clock: { mhz: MHZ }, corner: "typ", sinks: [stats, rec], onFrame: (i) => rec.frame(i) });
const worst = await runSession({ clock: { mhz: MHZ }, corner: "worst", sinks: [] });
log(`sessions: ${typ.frames} frames (${(tToMs(typ.gb.t) / 1000).toFixed(1)} s of Game Boy time) each, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
log(`  signed: ${JSON.stringify(typ.signed)}, unlocked after power cycle: ${typ.unlocked}; worst corner: ${JSON.stringify(worst.signed)}, ${worst.unlocked}`);

const latency = (calls: typeof typ.fw.calls) => {
  const by = new Map<string, { n: number; costMax: number; waitMax: number; steps: { what: string; ms: number }[]; detail?: string }>();
  for (const c of calls) {
    const key = c.cmd === "SIGN" && c.arg === 1 ? `SIGN ${c.detail?.split(",")[0]}` : c.cmd === "PAIR" && c.arg === 1 ? "PAIR accept" : c.cmd;
    const waited = c.tSeen !== undefined ? tToMs(c.tSeen - c.tReq) : Infinity;
    const e = by.get(key) ?? { n: 0, costMax: 0, waitMax: 0, steps: c.steps, detail: c.detail };
    e.n++;
    if (c.costMs >= e.costMax) e.steps = c.steps;
    e.costMax = Math.max(e.costMax, c.costMs);
    e.waitMax = Math.max(e.waitMax, waited);
    by.set(key, e);
  }
  return Object.fromEntries(by);
};
const latTyp = latency(typ.fw.calls);
const latWorst = latency(worst.fw.calls);
const timeoutMs = tToMs(600 * FRAME_T);
log("\nfirmware latency (the ROM gives up after 600 frames =", timeoutMs.toFixed(0), "ms):");
for (const k of Object.keys(latWorst))
  log(`  ${k.padEnd(14)} typ ${latTyp[k]?.costMax.toFixed(1).padStart(7)} ms   worst ${latWorst[k].costMax.toFixed(1).padStart(7)} ms   Game Boy waited ≤ ${latWorst[k].waitMax.toFixed(0)} ms`);
const solMsg = typ.fw.calls.find((c) => c.detail?.startsWith("sol"))?.detail;

// ---------- 2. what the bus looks like ----------
const secs = tToMs(typ.gb.t) / 1000;
const readRate = (stats.kinds.romR + stats.kinds.cramR) / secs;
log(`\nbus: ${stats.cycles} machine cycles; ROM reads ${stats.kinds.romR} (${stats.mailboxReads} of them mailbox), RAM-window writes ${stats.kinds.cramW}, ROM-area writes ${stats.kinds.romW}`);
log(`  work-RAM cycles the cartridge must ignore: ${stats.kinds.wramR} reads (incl. OAM DMA), ${stats.kinds.wramW} writes; longest run of back-to-back cartridge reads: ${stats.maxRun}`);
log(`  most writes in any 8 cycles: ${stats.maxWritesIn8}; the Game Boy wrote a chip-owned byte: ${typ.fw.illegalWrites} times; read back its own bytes: ${typ.fw.readBackGaps.length}; OAM DMA conflicts: ${typ.gb.dmaConflicts}`);

// ---------- 3. cycle-level timing ----------
const win = rec;
const winA000 = mailboxAtA000(rec);
log(`\ncycle-level window: ${win.kinds.length} machine cycles (${rec.kept.mailbox} frames with mailbox traffic + ${rec.kept.sampled} sampled frames)`);
interface Row { variant: Variant; rev: Rev; mhz: number; instr: number; worst: SimResult; best: SimResult; random: SimResult[]; notes: Record<string, number> }
const rows: Row[] = [];
const configs: [Variant, Rev, number][] = [];
for (const mhz of [100, 125, 150, 200]) for (const rev of ["A", "B"] as Rev[]) configs.push(["romWindow", rev, mhz]);
configs.push(["speculative", "A", 150], ["decodeFirst", "A", 150], ["decodeFirst", "A", 200], ["decodeFirst", "A", 250]);
for (const [variant, rev, mhz] of configs) {
  let d;
  try {
    d = buildDesign(variant, rev, mhz);
  } catch (e) {
    log(`  ${variant}/${rev} @${mhz}: ${(e as Error).message}`);
    continue;
  }
  const w = variant === "romWindow" ? win : winA000;
  const r = rng(1234 + mhz);
  const trials = variant === "romWindow" ? TRIALS : 3;
  const row: Row = {
    variant, rev, mhz, instr: d.driveBlock, notes: d.notes,
    worst: simulate(w, d, sampleTrial(d, "worst", r)),
    best: simulate(w, d, sampleTrial(d, "best", r)),
    random: Array.from({ length: trials }, (_, i) => simulate(w, d, sampleTrial(d, "random", r, `random ${i}`))),
  };
  rows.push(row);
  const all = [row.worst, row.best, ...row.random];
  const minE = Math.min(...all.map((x) => (x.errorsEarly ? -Infinity : x.marginEarly)));
  const minL = Math.min(...all.map((x) => (x.errorsLate ? -Infinity : x.marginLate)));
  const bad = all.reduce((a, x) => a + x.contention + x.spurious + x.holdViolations + x.writeErrors, 0);
  log(`  ${`${variant}/${rev} @${mhz} MHz`.padEnd(26)} ${String(d.driveBlock).padStart(2)}/32 instr   margin to CLK-fall latch ${Number.isFinite(minE) ? `${minE.toFixed(1)} ns` : "FAILS"}   to next-CLK latch ${Number.isFinite(minL) ? `${minL.toFixed(1)} ns` : "FAILS"}   contention/spurious/hold/write errors ${bad}${row.worst.firstError && !Number.isFinite(minE) ? `   (${row.worst.firstError})` : ""}`);
}

// how much slower could the DMA be before the conservative latch fails? (the datasheet gives no figure)
const sub = { kinds: win.kinds.slice(0, 120_000), addrs: win.addrs.slice(0, 120_000), values: win.values.slice(0, 120_000) };
const dmaSweep: { mhz: number; hop: number; margin: number | null }[] = [];
for (const mhz of [125, 150]) {
  const d = buildDesign("romWindow", "A", mhz);
  const line: string[] = [];
  for (const hop of [4, 8, 12, 16, 20, 24]) {
    const t = { ...sampleTrial(d, "worst", rng(5)), hop: () => hop };
    const r = simulate(sub, d, t);
    const m = r.errorsEarly ? null : r.marginEarly;
    dmaSweep.push({ mhz, hop, margin: m });
    line.push(`${hop}: ${m === null ? "FAIL" : `${m.toFixed(0)} ns`}`);
  }
  log(`  DMA hop (cycles) vs conservative-latch margin @${mhz} MHz, worst corner: ${line.join("  ")}`);
}

// ---------- 4. pins ----------
const pins = {
  bus: [["A0-A15", 16], ["D0-D7", 8], ["/RD", 1], ["/WR", 1], ["PHI (CLK)", 1], ["DIR for the SN74LVC8T245 (Rev B)", 1]] as [string, number][],
  board: [["I²C to SE050 + LIS3DH", 2], ["SE050 ENA (deep power-down)", 1], ["RM2 radio: WL_REG_ON, DATA, CLK, CS", 4], ["CONFIRM button", 1], ["LED", 1], ["/RES (hold the Game Boy in reset until the bus is served)", 1], ["LIS3DH interrupt", 1]] as [string, number][],
};
const pinTotal = [...pins.bus, ...pins.board].reduce((a, [, n]) => a + n, 0);
log(`\npins: ${pinTotal} needed (${pins.bus.reduce((a, [, n]) => a + n, 0)} on the cartridge bus); RP2350A/RP2354A have ${RP2350.gpioA.value}, RP2350B/RP2354B have ${RP2350.gpioB.value}`);
log(`  /CS isn't needed: with the ROM read window, the cartridge never answers 0xA000 reads and decodes writes by address`);

// ---------- 5. power ----------
const pw = power({ mhz: MHZ, phases: typ.phases, calls: typ.fw.calls, totalT: typ.gb.t, readRate, connIntervalMs: 100, regulator: "ldo" });
const pwBuck = power({ mhz: MHZ, phases: typ.phases, calls: typ.fw.calls, totalT: typ.gb.t, readRate, connIntervalMs: 100, regulator: 0.85 });
const pw30 = power({ mhz: MHZ, phases: typ.phases, calls: typ.fw.calls, totalT: typ.gb.t, readRate, connIntervalMs: 30, regulator: "ldo" });
log(`\npower at ${MHZ} MHz, LDO (stock DMG ≈ 235 mW; an original EverDrive adds ≈ 230 mW and runs fine):`);
for (const s of pw.states) log(`  ${s.name.padEnd(44)} ${s.mA.toFixed(1).padStart(5)} mA  ${s.mW.toFixed(0).padStart(4)} mW  (+${s.vsStockPct.toFixed(0)}% of a DMG)`);
log(`  session average ${pw.sessionAvg.mA.toFixed(1)} mA ${pw.sessionAvg.mW.toFixed(0)} mW; peak ${pw.peak.mA.toFixed(0)} mA (${pw.peak.what})`);
log(`  with a buck converter instead: home ${pwBuck.states[0].mA.toFixed(1)} mA; with a 30 ms connection interval: home ${pw30.states[0].mA.toFixed(1)} mA`);

writeFileSync(
  new URL("results.json", out),
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      mhz: MHZ,
      session: { frames: typ.frames, seconds: secs, signed: typ.signed, unlocked: typ.unlocked, worstCorner: { signed: worst.signed, unlocked: worst.unlocked } },
      latency: { typ: latTyp, worst: latWorst, timeoutMs, solanaMessage: solMsg, apduMax: SE050.apduMax.value },
      bus: { ...stats, recent: undefined, readRate, illegalWrites: typ.fw.illegalWrites, readBack: typ.fw.readBackGaps.length, dmaConflicts: typ.gb.dmaConflicts },
      window: { cycles: win.kinds.length, kept: rec.kept },
      timing: rows.map((r) => ({ ...r, random: r.random.map((x) => ({ ...x })) })),
      dmaSweep,
      pins: { ...pins, total: pinTotal, rp2350a: RP2350.gpioA.value, rp2350b: RP2350.gpioB.value, PIN },
      power: { ldo: pw, buck: pwBuck, conn30: pw30 },
    },
    (_k, val) => (val === Infinity ? null : val),
    2,
  ),
);
log(`\nwrote ${new URL("results.json", out).pathname}`);
void ([] as Corner[]);
