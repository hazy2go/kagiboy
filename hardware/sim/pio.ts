// A cycle-accurate model of one RP2350 PIO state machine, plus a small assembler for the subset of
// pioasm the cartridge programs use. One instruction per clock (clkdiv 1), delays after the
// instruction completes, stalls on wait / blocking pull / full autopush, side-set on every cycle
// of the instruction. Pins are a 32-bit window (GPIO 0..31).

export type Cond = "always" | "!x" | "x--" | "!y" | "y--" | "x!=y" | "pin" | "!osre";
export type Instr =
  | { op: "jmp"; cond: Cond; target: number }
  | { op: "wait"; pol: 0 | 1; src: "gpio" | "pin"; index: number }
  | { op: "in"; src: "pins" | "x" | "y" | "null" | "isr" | "osr"; n: number }
  | { op: "out"; dst: "pins" | "x" | "y" | "null" | "pindirs" | "isr"; n: number }
  | { op: "push"; block: boolean }
  | { op: "pull"; block: boolean }
  | { op: "mov"; dst: "pins" | "x" | "y" | "isr" | "osr" | "pindirs"; src: "pins" | "x" | "y" | "null" | "isr" | "osr"; invert: boolean }
  | { op: "set"; dst: "pins" | "x" | "y" | "pindirs"; value: number };

export interface Line {
  instr: Instr;
  delay: number;
  side?: number;
  text: string;
}

export interface Program {
  name: string;
  lines: Line[];
  labels: Record<string, number>;
  wrapTarget: number;
  wrap: number;
  sideBits: number;
  sideOpt: boolean;
}

/** Assemble pioasm text. `defs` resolves symbolic numbers (pin numbers, delays). */
export function assemble(src: string, defs: Record<string, number> = {}): Program {
  const num = (t: string) => {
    t = t.trim();
    if (t in defs) return defs[t];
    const v = Number(t);
    if (!Number.isInteger(v)) throw new Error(`pioasm: bad number '${t}'`);
    return v;
  };
  const raw: { text: string; label?: string }[] = [];
  let name = "";
  let sideBits = 0;
  let sideOpt = false;
  let wrapTarget = 0;
  let wrap = -1;
  const labels: Record<string, number> = {};
  const pending: string[] = [];
  for (let line of src.split("\n")) {
    line = line.replace(/;.*$/, "").trim();
    if (!line) continue;
    if (line.startsWith(".program")) name = line.split(/\s+/)[1];
    else if (line.startsWith(".side_set")) {
      const p = line.split(/\s+/);
      sideBits = num(p[1]);
      sideOpt = p[2] === "opt";
    } else if (line === ".wrap_target") wrapTarget = raw.length;
    else if (line === ".wrap") wrap = raw.length - 1;
    else if (line.endsWith(":")) pending.push(line.slice(0, -1));
    else {
      for (const l of pending) labels[l] = raw.length;
      pending.length = 0;
      raw.push({ text: line });
    }
  }
  if (wrap < 0) wrap = raw.length - 1;
  if (raw.length > 32) throw new Error(`pioasm: ${name} has ${raw.length} instructions, a PIO block holds 32`);

  const lines = raw.map(({ text }): Line => {
    let t = text;
    let delay = 0;
    let side: number | undefined;
    const d = t.match(/\[([^\]]+)\]\s*$/);
    if (d) {
      delay = num(d[1]);
      t = t.slice(0, d.index).trim();
    }
    const s = t.match(/\sside\s+(\S+)\s*$/);
    if (s) {
      side = num(s[1]);
      t = t.slice(0, s.index).trim();
    }
    const maxDelay = (1 << (5 - sideBits - (sideOpt ? 1 : 0))) - 1;
    if (delay > maxDelay) throw new Error(`pioasm: delay ${delay} > ${maxDelay} in '${text}'`);
    if (side === undefined && sideBits && !sideOpt) throw new Error(`pioasm: side-set required in '${text}'`);
    const [op, ...rest] = t.split(/\s+/);
    const args = rest.join(" ").split(",").map((a) => a.trim()).filter(Boolean);
    let instr: Instr;
    switch (op) {
      case "nop":
        instr = { op: "mov", dst: "y", src: "y", invert: false };
        break;
      case "jmp": {
        const cond = (args.length === 2 ? args[0] : "always") as Cond;
        const target = args[args.length - 1];
        instr = { op: "jmp", cond, target: target in labels ? labels[target] : num(target) };
        break;
      }
      case "wait": {
        const [pol, srcName, index] = rest;
        instr = { op: "wait", pol: num(pol) as 0 | 1, src: srcName as "gpio" | "pin", index: num(index) };
        break;
      }
      case "in":
        instr = { op: "in", src: args[0] as never, n: num(args[1]) };
        break;
      case "out":
        instr = { op: "out", dst: args[0] as never, n: num(args[1]) };
        break;
      case "push":
        instr = { op: "push", block: !rest.includes("noblock") };
        break;
      case "pull":
        instr = { op: "pull", block: !rest.includes("noblock") };
        break;
      case "mov": {
        const invert = args[1].startsWith("~") || args[1].startsWith("!");
        instr = { op: "mov", dst: args[0] as never, src: args[1].replace(/^[~!]/, "") as never, invert };
        break;
      }
      case "set":
        instr = { op: "set", dst: args[0] as never, value: num(args[1]) };
        break;
      default:
        throw new Error(`pioasm: unknown op '${op}'`);
    }
    return { instr, delay, side, text };
  });
  return { name, lines, labels, wrapTarget, wrap, sideBits, sideOpt };
}

export interface Pads {
  val: number;
  dir: number;
}

export interface SmConfig {
  inBase: number;
  outBase: number;
  outCount: number;
  setBase?: number;
  setCount?: number;
  sideBase?: number;
  jmpPin?: number;
  inShiftLeft: boolean;
  outShiftRight: boolean;
  autopush?: number; // threshold in bits, or undefined for off
}

const mask = (n: number) => (n >= 32 ? 0xffffffff : (1 << n) - 1) >>> 0;
const rotr = (v: number, n: number) => (n === 0 ? v >>> 0 : ((v >>> n) | (v << (32 - n))) >>> 0);

export class StateMachine {
  pc: number;
  x = 0;
  y = 0;
  isr = 0;
  osr = 0;
  inCount = 0;
  outCount = 32; // empty
  delay = 0;
  rx: number[] = [];
  tx: number[] = [];
  readonly depth = 4;
  stalls = 0;

  constructor(
    readonly prog: Program,
    readonly cfg: SmConfig,
    /** the PIO block's pad registers: state machines in one block share them (last write wins) */
    readonly pads: Pads = { val: 0, dir: 0 },
  ) {
    this.pc = prog.wrapTarget;
  }

  private setPins(base: number, count: number, value: number, dirs: boolean) {
    const m = (mask(count) << base) >>> 0;
    const v = (value << base) >>> 0;
    if (dirs) this.pads.dir = ((this.pads.dir & ~m) | (v & m)) >>> 0;
    else this.pads.val = ((this.pads.val & ~m) | (v & m)) >>> 0;
  }

  /** Advance one system clock. `pins` = what PIO sees (after the input synchronisers). */
  step(pins: number) {
    const line = this.prog.lines[this.pc];
    if (line.side !== undefined && this.delay === 0 && this.cfg.sideBase !== undefined)
      this.setPins(this.cfg.sideBase, this.prog.sideBits, line.side, false);
    if (this.delay > 0) {
      this.delay--;
      return;
    }
    const next = this.pc === this.prog.wrap ? this.prog.wrapTarget : this.pc + 1;
    const i = line.instr;
    let jump: number | null = null;
    switch (i.op) {
      case "jmp": {
        let take = false;
        switch (i.cond) {
          case "always": take = true; break;
          case "!x": take = this.x === 0; break;
          case "!y": take = this.y === 0; break;
          case "x--": take = this.x !== 0; this.x = (this.x - 1) >>> 0; break;
          case "y--": take = this.y !== 0; this.y = (this.y - 1) >>> 0; break;
          case "x!=y": take = this.x !== this.y; break;
          case "pin": take = ((pins >>> (this.cfg.jmpPin ?? 0)) & 1) === 1; break;
          case "!osre": take = this.outCount < 32; break;
        }
        if (take) jump = i.target;
        break;
      }
      case "wait": {
        const idx = i.src === "gpio" ? i.index : (this.cfg.inBase + i.index) % 32;
        if (((pins >>> idx) & 1) !== i.pol) {
          this.stalls++;
          return;
        }
        break;
      }
      case "in": {
        const push = this.cfg.autopush !== undefined && Math.min(32, this.inCount + i.n) >= this.cfg.autopush;
        if (push && this.rx.length >= this.depth) {
          this.stalls++;
          return;
        }
        const v =
          i.src === "pins" ? rotr(pins, this.cfg.inBase)
          : i.src === "x" ? this.x
          : i.src === "y" ? this.y
          : i.src === "isr" ? this.isr
          : i.src === "osr" ? this.osr
          : 0;
        const bits = v & mask(i.n);
        if (this.cfg.inShiftLeft) this.isr = (i.n >= 32 ? bits : ((this.isr << i.n) | bits)) >>> 0;
        else this.isr = (i.n >= 32 ? bits : ((this.isr >>> i.n) | (bits << (32 - i.n)))) >>> 0;
        this.inCount = Math.min(32, this.inCount + i.n);
        if (push) {
          this.rx.push(this.isr);
          this.isr = 0;
          this.inCount = 0;
        }
        break;
      }
      case "out": {
        let v: number;
        if (this.cfg.outShiftRight) {
          v = this.osr & mask(i.n);
          this.osr = i.n >= 32 ? 0 : this.osr >>> i.n;
        } else {
          v = i.n >= 32 ? this.osr : this.osr >>> (32 - i.n);
          this.osr = i.n >= 32 ? 0 : (this.osr << i.n) >>> 0;
        }
        this.outCount = Math.min(32, this.outCount + i.n);
        if (i.dst === "pins") this.setPins(this.cfg.outBase, Math.min(i.n, this.cfg.outCount), v, false);
        else if (i.dst === "pindirs") this.setPins(this.cfg.outBase, Math.min(i.n, this.cfg.outCount), v, true);
        else if (i.dst === "x") this.x = v >>> 0;
        else if (i.dst === "y") this.y = v >>> 0;
        else if (i.dst === "isr") {
          this.isr = v >>> 0;
          this.inCount = i.n;
        }
        break;
      }
      case "pull": {
        if (this.tx.length === 0) {
          if (i.block) {
            this.stalls++;
            return;
          }
          this.osr = this.x;
        } else this.osr = this.tx.shift()!;
        this.outCount = 0;
        break;
      }
      case "push": {
        if (this.rx.length >= this.depth) {
          if (i.block) {
            this.stalls++;
            return;
          }
        } else this.rx.push(this.isr);
        this.isr = 0;
        this.inCount = 0;
        break;
      }
      case "mov": {
        let v =
          i.src === "pins" ? rotr(pins, this.cfg.inBase)
          : i.src === "x" ? this.x
          : i.src === "y" ? this.y
          : i.src === "isr" ? this.isr
          : i.src === "osr" ? this.osr
          : 0;
        if (i.invert) v = ~v >>> 0;
        if (i.dst === "x") this.x = v;
        else if (i.dst === "y") this.y = v;
        else if (i.dst === "isr") {
          this.isr = v;
          this.inCount = 0;
        } else if (i.dst === "osr") {
          this.osr = v;
          this.outCount = 0;
        } else if (i.dst === "pins") this.setPins(this.cfg.outBase, this.cfg.outCount, v, false);
        else if (i.dst === "pindirs") this.setPins(this.cfg.outBase, this.cfg.outCount, v, true);
        break;
      }
      case "set": {
        if (i.dst === "x") this.x = i.value;
        else if (i.dst === "y") this.y = i.value;
        else this.setPins(this.cfg.setBase ?? 0, this.cfg.setCount ?? 1, i.value, i.dst === "pindirs");
        break;
      }
    }
    this.pc = jump ?? next;
    this.delay = line.delay;
  }
}
