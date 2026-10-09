// Cycle-level simulation of the cartridge on the Game Boy bus.
//
// The Game Boy side is generated from the recorded machine cycles of the real ROM, with each
// edge placed by the measured DMG timing (params.ts). It passes through the level shifter
// (B -> A delay per pin) and the RP2350's 2-flop input synchronisers into the PIO programs
// (programs.ts), which run instruction by instruction. Their table lookups go through a DMA model
// to SRAM, and their outputs come back through the pads and the shifter to the connector, where
// every Game Boy read is checked against the byte it must see at the latch point.

import { readFileSync } from "node:fs";
import { StateMachine, type Pads } from "./pio";
import { PIN, type Design } from "./programs";
import { BUS, RP2350, SHIFTER, hi, lo, type Source } from "./params";
import type { Kind } from "./tracer";

export const CYC = 953.674; // ns per machine cycle

export interface Window {
  kinds: Kind[];
  addrs: number[];
  values: number[];
}

/** The same bus traffic as if the Game Boy read the mailbox at 0xA000 (the first design), for comparison. */
export function mailboxAtA000(w: Window): Window {
  const kinds = w.kinds.slice();
  const addrs = w.addrs.slice();
  for (let i = 0; i < kinds.length; i++)
    if (kinds[i] === "romR" && addrs[i] >= 0x7f00) {
      kinds[i] = "cramR";
      addrs[i] = 0xa000 | (addrs[i] & 0xff);
    }
  return { kinds, addrs, values: w.values };
}

export interface Trial {
  addrValid: number;
  selectLow: number;
  selectHigh: number;
  clkFall: number;
  wrLow: number;
  wrHigh: number;
  writeData: number;
  dIn: number[]; // per GPIO, connector -> RP pin
  dOut: number[]; // per data bit, RP pin -> connector
  pad: number;
  enB: number;
  disB: number;
  phase: number;
  hop: () => number; // DMA hop, cycles
  contention: () => number;
  label: string;
}

/** Deterministic PRNG so runs are repeatable. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export type Mode = "worst" | "random" | "best";

export function sampleTrial(design: Design, mode: Mode, r: () => number, label: string = mode): Trial {
  const sh = design.rev === "A" ? SHIFTER.txb0108 : SHIFTER.lvc8t245;
  const u = (a: number, b: number) => a + (b - a) * r();
  const pick = (range: readonly [number, number] | number[], worstHigh = true) =>
    mode === "random" ? u(range[0], range[1]) : (mode === "worst") === worstHigh ? range[1] : range[0];
  const rr = (s: Source) => [lo(s), hi(s)] as [number, number];
  const dmaR = rr(RP2350.dmaHop);
  const conR = rr(RP2350.sramContention);
  const T = 1000 / design.mhz;
  return {
    addrValid: pick(rr(BUS.addrValid)),
    selectLow: pick(rr(BUS.selectLow)),
    selectHigh: pick(rr(BUS.selectHigh), false),
    clkFall: pick(rr(BUS.clkFall), false), // an early CLK fall is the tighter read deadline
    wrLow: pick(rr(BUS.wrLow), false),
    wrHigh: pick(rr(BUS.wrHigh), false),
    writeData: pick(rr(BUS.writeDataValid)),
    // worst case: the edges the PIO triggers on (PHI, /WR) arrive early, everything it samples arrives late
    dIn: Array.from({ length: 32 }, (_, pin) => pick(rr(sh.bToA), pin !== PIN.PHI && pin !== PIN.WR)),
    dOut: Array.from({ length: 8 }, () => pick(rr(sh.aToB))),
    pad: pick(rr(RP2350.padOut)),
    enB: design.rev === "B" ? pick(rr(SHIFTER.lvc8t245.enableB)) : 0,
    disB: design.rev === "B" ? pick(rr(SHIFTER.lvc8t245.disableB)) : 0,
    phase: mode === "random" ? u(0, T) : mode === "worst" ? T * 0.999 : 0,
    hop: () => Math.round(mode === "random" ? u(dmaR[0], dmaR[1] + 0.49) : mode === "worst" ? dmaR[1] : dmaR[0]),
    contention: () => Math.round(mode === "random" ? u(conR[0], conR[1] + 0.49) : mode === "worst" ? conR[1] : conR[0]),
    label,
  };
}

export interface SimResult {
  design: string;
  mhz: number;
  trial: string;
  cycles: number;
  reads: number;
  /** min over reads of (latch - setup - data valid), ns, for each latch hypothesis */
  marginEarly: number;
  marginLate: number;
  errorsEarly: number;
  errorsLate: number;
  holdViolations: number;
  contention: number;
  contentionNs: number;
  spurious: number;
  writes: number;
  writeErrors: number;
  dmaMaxQueue: number;
  firstError?: string;
  /** data-valid time after the cycle start, ns: worst and typical over all reads */
  validWorst: number;
  validMean: number;
}

const WRITE: Partial<Record<Kind, true>> = { romW: true, cramW: true, wramW: true };
const CART_READ: Partial<Record<Kind, true>> = { romR: true, cramR: true };

let ROM: Uint8Array | null = null;
const rom = () => (ROM ??= new Uint8Array(readFileSync(new URL("../../rom/build/wallet-hw.gb", import.meta.url))));

type InEv = { t: number; pin: number; level: number };
type OutEv = { t: number; bit: number; what: "val" | "drv" | "dir"; v: number };

export function simulate(win: Window, design: Design, trial: Trial, limit = win.kinds.length): SimResult {
  const T = 1000 / design.mhz;
  const setup = BUS.readSetup.value as number;
  const hold = BUS.readHold.value as number;
  const romImg = rom();
  const mailbox = new Uint8Array(256);

  // Rev B: DIR's output latch is held at 1 (set once at boot); a pull-down makes it 0 when released
  const drivePads: Pads = { val: design.rev === "B" ? 1 << PIN.DIR : 0, dir: 0 };
  const sms = design.sms.map((s) => {
    const sm = new StateMachine(s.prog, s.cfg, s.table === "ring" ? { val: 0, dir: 0 } : drivePads);
    if (s.x !== undefined) sm.x = s.x;
    if (s.y !== undefined) sm.y = s.y;
    return { spec: s, sm };
  });

  const lookup = (table: string, a: number) => {
    if (table === "bus") {
      const x = a & 0xffff;
      return x >= 0x7f00 && x < 0x8000 ? mailbox[x & 0xff] : x < 0x8000 ? romImg[x] : x >= 0xa000 && x < 0xc000 ? mailbox[x & 0xff] : 0xff;
    }
    // ROM image with the mailbox kept at offset 0x7F00 (unused ROM)
    const x = (a - 0x20000000) & 0x7fff;
    return x >= 0x7f00 ? mailbox[x & 0xff] : romImg[x];
  };

  // ---- inputs ----
  let word = (1 << PIN.A15) | (1 << PIN.CS) | (1 << PIN.WR); // PHI low, /RD low
  let sync1 = word;
  let sync2 = word;
  let pending: InEv[] = [];
  let curAddr = 0;
  const push = (t: number, pin: number, level: number) => pending.push({ t: t + trial.dIn[pin], pin, level });

  // ---- outputs at the connector ----
  const out: OutEv[] = [];
  const insertOut = (e: OutEv) => {
    let i = out.length;
    while (i > 0 && out[i - 1].t > e.t) i--;
    out.splice(i, 0, e);
  };
  const conn = Array.from({ length: 8 }, () => ({ val: 0, pin: false, dir: design.rev === "A", since: 0 }));
  let prevVal = 0;
  let prevDir = 0;
  let prevDirPin = 0;

  // ---- checks ----
  type Latch = { t: number; early: boolean; expect: number; i: number };
  const latches: Latch[] = [];
  let watch: { until: number; i: number } | null = null;
  const others: [number, number][] = []; // other drivers on the data bus
  const readWindows: [number, number][] = [];
  let driveStart = -1;
  const res: SimResult = {
    design: `${design.variant}/${design.rev}`, mhz: design.mhz, trial: trial.label, cycles: 0, reads: 0,
    marginEarly: Infinity, marginLate: Infinity, errorsEarly: 0, errorsLate: 0, holdViolations: 0,
    contention: 0, contentionNs: 0, spurious: 0, writes: 0, writeErrors: 0, dmaMaxQueue: 0, validWorst: 0, validMean: 0,
  };
  let validSum = 0;
  const err = (s: string) => (res.firstError ??= s);

  const driving = () => conn[0].pin && conn[0].dir;
  const applyOut = (e: OutEv) => {
    const before = driving();
    for (const c of e.what === "dir" ? conn : [conn[e.bit]]) {
      const was = c.pin && c.dir;
      const oldVal = c.val;
      if (e.what === "val") c.val = e.v;
      else if (e.what === "drv") c.pin = e.v === 1;
      else c.dir = e.v === 1;
      if ((c.pin && c.dir) !== was || (c.pin && c.dir && c.val !== oldVal)) {
        c.since = e.t;
        if (watch && e.t < watch.until && was) {
          res.holdViolations++;
          err(`hold: data changed ${(watch.until - e.t).toFixed(1)} ns early in cycle ${watch.i}`);
        }
      }
    }
    const now = driving();
    if (!before && now) driveStart = e.t;
    if (before && !now) closeDrive(driveStart, e.t);
  };
  const closeDrive = (a: number, b: number) => {
    for (const [x, y] of others) {
      const o = Math.min(b, y) - Math.max(a, x);
      if (o > 0) {
        res.contention++;
        res.contentionNs = Math.max(res.contentionNs, o);
        err(`contention ${o.toFixed(1)} ns at ${a.toFixed(0)}`);
      }
    }
    if (!readWindows.some(([x, y]) => a >= x && b <= y)) {
      res.spurious++;
      err(`drove the bus outside a cartridge read at ${a.toFixed(0)}-${b.toFixed(0)} ns`);
    }
  };
  const checkLatch = (l: Latch) => {
    let ok = true;
    let validAt = -Infinity;
    for (let b = 0; b < 8; b++) {
      const c = conn[b];
      if (!(c.pin && c.dir) || c.val !== ((l.expect >> b) & 1)) ok = false;
      validAt = Math.max(validAt, c.since);
    }
    const t0 = l.i * CYC;
    const margin = l.t - setup - validAt;
    if (!ok || margin < 0) {
      if (l.early) res.errorsEarly++;
      else res.errorsLate++;
      if (!l.early || res.errorsLate === 0) err(`${l.early ? "early" : "late"} latch, cycle ${l.i}: ${ok ? `valid ${(-margin).toFixed(1)} ns too late` : "wrong or undriven byte"}`);
    }
    if (ok) {
      if (l.early) {
        res.marginEarly = Math.min(res.marginEarly, margin);
        res.validWorst = Math.max(res.validWorst, validAt - t0);
        validSum += validAt - t0;
      } else res.marginLate = Math.min(res.marginLate, margin);
    }
    watch = { until: l.t + hold, i: l.i };
  };

  // ---- DMA ----
  type Task = { kind: "addr" | "read" | "ring"; sm: number; v: number };
  const queue: Task[] = [];
  let busyUntil = -1;
  let inFlight: Task | null = null;
  const expectedWrites: { addr: number; value: number; i: number }[] = [];

  let tick = 0;
  for (let i = 0; i < Math.min(limit, win.kinds.length); i++) {
    const kind = win.kinds[i];
    const addr = win.addrs[i];
    const value = win.values[i];
    const t0 = i * CYC;
    res.cycles++;

    // Game Boy edges for this cycle
    push(t0, PIN.PHI, 1);
    push(t0 + trial.clkFall, PIN.PHI, 0);
    if (kind !== "none") {
      for (let b = 0; b < 15; b++) if (((addr ^ curAddr) >> b) & 1) push(t0 + trial.addrValid, b, (addr >> b) & 1);
      curAddr = addr;
    }
    if (kind === "romR" || kind === "romW") {
      push(t0 + trial.selectLow, PIN.A15, 0);
      push(t0 + trial.selectHigh, PIN.A15, 1);
    }
    if (kind === "cramR" || kind === "cramW" || kind === "wramR" || kind === "wramW") {
      push(t0 + trial.selectLow, PIN.CS, 0);
      push(t0 + trial.selectHigh, PIN.CS, 1);
    }
    if (WRITE[kind]) {
      push(t0 + trial.addrValid, PIN.RD, 1);
      push(t0 + CYC + lo(BUS.addrValid as never), PIN.RD, 0);
      push(t0 + trial.wrLow, PIN.WR, 0);
      push(t0 + trial.wrHigh, PIN.WR, 1);
      for (let b = 0; b < 8; b++) push(t0 + trial.writeData, PIN.D0 + b, (value >> b) & 1);
      others.push([t0 + lo(BUS.writeDataValid as never), t0 + CYC + lo(BUS.addrValid as never)]);
      expectedWrites.push({ addr, value, i });
      res.writes++;
    }
    if (kind === "wramR") others.push([t0 + trial.selectLow + 30, t0 + trial.selectHigh + 10]);
    if (others.length > 8) others.splice(0, others.length - 8);
    if (CART_READ[kind]) {
      res.reads++;
      if (kind === "cramR" || addr >= 0x7f00) mailbox[addr & 0xff] = value;
      else if (romImg[addr] !== value) err(`trace/ROM mismatch at ${addr.toString(16)}`);
      latches.push({ t: t0 + trial.clkFall, early: true, expect: value, i }, { t: t0 + CYC, early: false, expect: value, i });
      readWindows.push([t0, t0 + CYC + 120]);
      if (readWindows.length > 8) readWindows.shift();
    }
    pending.sort((a, b) => a.t - b.t);

    // run the RP2350 until the next cycle starts
    const tEnd = t0 + CYC;
    for (;;) {
      const tm = trial.phase + tick * T;
      if (tm >= tEnd) break;
      // inputs that reached the pins by this clock edge
      let k = 0;
      while (k < pending.length && pending[k].t <= tm) {
        const e = pending[k++];
        word = e.level ? word | (1 << e.pin) : word & ~(1 << e.pin);
      }
      if (k) pending = pending.slice(k);
      // connector events and latches, in time order, up to this edge
      for (;;) {
        const nextOut = out.length ? out[0].t : Infinity;
        const nextLatch = latches.length ? latches[0].t : Infinity;
        if (Math.min(nextOut, nextLatch) > tm) break;
        if (nextOut <= nextLatch) applyOut(out.shift()!);
        else checkLatch(latches.shift()!);
      }
      // PIO sees the synchronised pins
      const seen = sync2;
      sync2 = sync1;
      sync1 = word >>> 0;
      for (const { sm } of sms) sm.step(seen);
      // DMA: DREQs, then one hop at a time (a conservative serial engine)
      sms.forEach(({ sm, spec }, n) => {
        while (sm.rx.length) queue.push({ kind: spec.table === "ring" ? "ring" : "addr", sm: n, v: sm.rx.shift()! });
      });
      res.dmaMaxQueue = Math.max(res.dmaMaxQueue, queue.length);
      if (inFlight && tick >= busyUntil) {
        const f = inFlight;
        inFlight = null;
        const target = sms[f.sm];
        if (f.kind === "addr") queue.unshift({ kind: "read", sm: f.sm, v: f.v });
        else if (f.kind === "read") target.sm.tx.push(lookup(target.spec.table, f.v));
        else {
          const w = f.v >>> 6;
          const exp = expectedWrites.shift();
          const a = w & 0xffff;
          const d = (w >>> PIN.D0) & 0xff;
          if (!exp || exp.addr !== a || exp.value !== d) {
            res.writeErrors++;
            err(`write captured ${a.toString(16)}=${d.toString(16)}, expected ${exp ? `${exp.addr.toString(16)}=${exp.value.toString(16)}` : "none"}`);
          }
        }
      }
      if (!inFlight && queue.length) {
        inFlight = queue.shift()!;
        busyUntil = tick + trial.hop() + (inFlight.kind === "read" ? trial.contention() : 0);
      }
      // pad changes reach the connector after the pad and shifter delays
      const val = (drivePads.val >>> PIN.D0) & 0xff;
      const dir = (drivePads.dir >>> PIN.D0) & 0xff;
      const dirPin = (drivePads.dir >>> PIN.DIR) & 1;
      const tOut = tm + T + trial.pad;
      for (let b = 0; b < 8; b++) {
        if (((val ^ prevVal) >> b) & 1) insertOut({ t: tOut + trial.dOut[b], bit: b, what: "val", v: (val >> b) & 1 });
        if (((dir ^ prevDir) >> b) & 1) insertOut({ t: tOut + (design.rev === "A" ? trial.dOut[b] : 0), bit: b, what: "drv", v: (dir >> b) & 1 });
      }
      // released DIR falls through the pull-down: ~50 ns to cross the threshold with 10 kΩ and ~7 pF (assumed)
      if (design.rev === "B" && dirPin !== prevDirPin) insertOut({ t: tOut + (dirPin ? trial.enB : 50 + trial.disB), bit: 0, what: "dir", v: dirPin });
      prevVal = val;
      prevDir = dir;
      prevDirPin = dirPin;
      tick++;
    }
  }
  res.validMean = res.reads ? validSum / res.reads : 0;
  if (expectedWrites.length > 2) {
    res.writeErrors += expectedWrites.length - 2;
    err(`${expectedWrites.length} writes never captured`);
  }
  return res;
}
