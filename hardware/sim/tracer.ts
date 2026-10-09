// Turns the emulator's instruction stream into the sequence of machine cycles the cartridge sees.
//
// Every M-cycle is one of: a ROM read or write (A15 low), a read or write of the cartridge RAM
// window 0xA000-0xBFFF (the mailbox), a work-RAM access 0xC000-0xFDFF (/CS also goes low for
// these on a DMG, so the cartridge must decode A14 and stay off the bus), or "none" (internal
// cycles, VRAM, OAM, I/O, HRAM: A15 and /CS stay high). OAM DMA reads its source over the
// cartridge bus for 160 cycles while the CPU runs from HRAM; that is modelled too.
//
// Accesses inside one instruction are placed on consecutive cycles from the opcode fetch
// (operand bytes first, in address order), and the instruction's remaining cycles are idle.
// That packs accesses at least as tightly as the real CPU does, so gap statistics are conservative.

import { GameBoy } from "../../web/src/emu/gameboy";

/** the chip-owned half of the mailbox, read through ROM space (rom/Makefile `hw`) */
export const MAILBOX_ROM = 0x7f00;

export type Kind = "romR" | "romW" | "cramR" | "cramW" | "wramR" | "wramW" | "none";

export interface CartPort {
  /** the Game Boy reads 0xA000-0xBFFF or the mailbox's ROM window */
  read(addr: number, t: number): number;
  /** the Game Boy writes 0xA000-0xBFFF */
  write(addr: number, value: number, t: number): void;
}

export interface CycleSink {
  cycle(kind: Kind, addr: number, value: number, t: number): void;
  /** n idle cycles starting at t (fast path; no cartridge activity) */
  idle(n: number, t: number): void;
}

type Access = { w: boolean; addr: number; value: number };

const classify = (addr: number, w: boolean): Kind =>
  addr < 0x8000 ? (w ? "romW" : "romR")
  : addr < 0xa000 ? "none"
  : addr < 0xc000 ? (w ? "cramW" : "cramR")
  : addr < 0xfe00 ? (w ? "wramW" : "wramR")
  : "none";

interface Core {
  memoryReader: ((c: Core, a: number) => number)[];
  memoryWriter: ((c: Core, a: number, v: number) => void)[];
  memoryHighWriter: ((c: Core, a: number, v: number) => void)[];
  OPCODE: ((c: Core) => void)[];
  CPUTicks: number;
  programCounter: number;
  updateCore: () => void;
  launchIRQ: () => void;
  memory: Uint8Array;
}

export class TracedGameBoy extends GameBoy {
  /** T-cycles (4.194304 MHz) since power-on */
  t = 0;
  private buf: Access[] = [];
  private pendingIdle = 0;
  private inOpcode = false;
  private inIrq = false;
  private dmaLeft = 0;
  private dmaSrc = 0;
  sinks: CycleSink[] = [];
  /** cycles emitted per kind, for the whole run */
  counts: Record<Kind, number> = { romR: 0, romW: 0, cramR: 0, cramW: 0, wramR: 0, wramW: 0, none: 0 };

  constructor(rom: Uint8Array, cart: CartPort) {
    super(rom);
    const core = (this as unknown as { core: Core }).core;

    // record every access the CPU makes through the memory map
    for (let a = 0; a <= 0xffff; a++) {
      const r = core.memoryReader[a];
      const w = core.memoryWriter[a];
      if ((a >= 0xa000 && a < 0xc000) || (a >= MAILBOX_ROM && a < MAILBOX_ROM + 0x100)) {
        // the cartridge RAM window and the mailbox's ROM read window: answered by the cartridge MCU model
        core.memoryReader[a] = (_c, addr) => {
          const value = cart.read(addr, this.t);
          this.buf.push({ w: false, addr, value });
          return value;
        };
        core.memoryWriter[a] = (_c, addr, value) => {
          cart.write(addr, value, this.t);
          this.buf.push({ w: true, addr, value });
        };
        continue;
      }
      core.memoryReader[a] = (c, addr) => {
        const value = r(c, addr);
        this.buf.push({ w: false, addr, value });
        return value;
      };
      core.memoryWriter[a] = (c, addr, value) => {
        const n = this.buf.length;
        w(c, addr, value);
        if (addr === 0xff46) {
          this.buf.length = n; // the emulator copies OAM instantly through the read hooks; not bus cycles
          this.startDma(value);
        }
        this.buf.push({ w: true, addr, value });
      };
    }
    // ldh writes to 0xFF46 go through the high-page table
    const hw = core.memoryHighWriter[0x46];
    core.memoryHighWriter[0x46] = (c, addr, value) => {
      const n = this.buf.length;
      hw(c, addr, value);
      this.buf.length = n;
      this.startDma(value);
    };

    core.OPCODE = core.OPCODE.map((op) => (c: Core) => {
      this.inOpcode = true;
      op(c);
      this.inOpcode = false;
      this.emitInstr(core.CPUTicks);
    });
    const updateCore = core.updateCore.bind(core);
    core.updateCore = () => {
      updateCore();
      if (this.inIrq) return; // emitted by the IRQ wrapper
      if (this.inOpcode) this.pendingIdle += core.CPUTicks;
      else this.emitIdle(core.CPUTicks >> 2);
    };
    const launchIRQ = core.launchIRQ.bind(core);
    core.launchIRQ = () => {
      const before = this.buf.length;
      this.inIrq = true;
      launchIRQ();
      this.inIrq = false;
      const pushes = this.buf.splice(before);
      if (pushes.length) {
        // 2 idle, push PC high, push PC low, 1 idle
        this.emitIdle(2);
        for (const p of pushes) this.emit(p);
        this.emitIdle(1);
      }
    };
  }

  private startDma(page: number) {
    this.dmaSrc = page << 8;
    this.dmaLeft = 160;
  }

  private emit(a: Access) {
    let kind = classify(a.addr, a.w);
    let { addr, value } = a;
    if (this.dmaLeft > 0) {
      if (kind === "none") {
        // the CPU is in HRAM (invisible); the bus carries the DMA source read
        addr = this.dmaSrc + (160 - this.dmaLeft);
        kind = classify(addr, false);
        value = (this as unknown as { core: Core }).core.memory[addr] ?? 0;
      } else {
        this.dmaConflicts++;
        this.conflictAddrs.set(addr, (this.conflictAddrs.get(addr) ?? 0) + 1);
      }
      this.dmaLeft--;
    }
    this.counts[kind]++;
    for (const s of this.sinks) s.cycle(kind, addr, value, this.t);
    this.t += 4;
  }
  /** cartridge-bus accesses the CPU made while OAM DMA owned the bus (should stay 0) */
  dmaConflicts = 0;
  conflictAddrs = new Map<number, number>();

  private emitIdle(n: number) {
    while (n > 0 && this.dmaLeft > 0) {
      // the OAM DMA source read happens on the external bus
      const addr = this.dmaSrc + (160 - this.dmaLeft);
      const kind = classify(addr, false);
      const core = (this as unknown as { core: Core }).core;
      const value = core.memory[addr] ?? 0;
      this.counts[kind]++;
      for (const s of this.sinks) s.cycle(kind, addr, value, this.t);
      this.t += 4;
      this.dmaLeft--;
      n--;
    }
    if (n <= 0) return;
    this.counts.none += n;
    for (const s of this.sinks) s.idle(n, this.t);
    this.t += 4 * n;
  }

  private emitInstr(ticks: number) {
    const acc = this.buf;
    this.buf = [];
    if (acc.length) {
      // opcode first, then operand bytes in address order (JS evaluates the high byte first)
      const pc = acc[0].addr;
      const ops = acc.slice(1).filter((a) => !a.w && (a.addr === ((pc + 1) & 0xffff) || a.addr === ((pc + 2) & 0xffff)));
      const rest = acc.slice(1).filter((a) => !ops.includes(a));
      ops.sort((a, b) => a.addr - b.addr);
      for (const a of [acc[0], ...ops, ...rest]) this.emit(a);
    }
    this.emitIdle((ticks >> 2) - acc.length + (this.pendingIdle >> 2));
    this.pendingIdle = 0;
  }
}
