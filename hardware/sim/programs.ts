// The cartridge's PIO programs, generated for a given system clock so the sample points land where
// the bus is valid. These are the programs the real firmware would load; the simulation runs them
// instruction by instruction.
//
// GPIO map (RP2350B, all bus pins inside one 32-pin PIO window):
//   0-15 A0-A15 · 16 /RD · 17 /CS · 18-25 D0-D7 · 26 DIR (Rev B only) · 27 /WR · 28 PHI (CLK, cart pin 2)
//   then off the bus: I²C (SE050 + LIS3DH), SE050 ENA, RM2 (4), CONFIRM button, LED, /RES
//
// One state machine answers every read. Its DMA chain looks the byte up in a 64 KB "bus image" in
// SRAM (ROM at 0x0000-0x7FFF, the 256-byte mailbox mirrored over 0xA000-0xBFFF), so the ROM and the
// mailbox need no separate state machines. Both read paths must live in the PIO block that owns
// D0-D7 (a GPIO belongs to one PIO block), so they share its 32 instruction slots.

import { assemble, type Program, type SmConfig } from "./pio";
import { BUS, SHIFTER, hi, lo } from "./params";

export const PIN = { A0: 0, A14: 14, A15: 15, RD: 16, CS: 17, D0: 18, DIR: 26, WR: 27, PHI: 28 } as const;

export type Rev = "A" | "B"; // A: TXB0108 auto-direction, B: SN74LVC8T245 with DIR from PIO
/**
 * romWindow: the Game Boy reads the mailbox through ROM space (0x7F00), so every read is a ROM read: look the
 *   byte up as soon as A0-A14 are valid and drive it if A15 and /RD say it's a ROM read. (recommended)
 * speculative: the mailbox stays at 0xA000; look ROM bytes up early, mailbox bytes only after decoding.
 * decodeFirst: wait for A15 and /CS, then look the byte up.
 */
export type Variant = "romWindow" | "speculative" | "decodeFirst";

export interface SmSpec {
  name: string;
  prog: Program;
  cfg: SmConfig;
  x?: number;
  y?: number;
  table: "bus" | "romimg" | "ring";
}

export interface Design {
  variant: Variant;
  rev: Rev;
  mhz: number;
  sms: SmSpec[];
  /** nominal sample times after the PHI edge, ns, for the report */
  notes: Record<string, number>;
  /** instructions in the block that drives D0-D7 */
  driveBlock: number;
}

/** "nop" lines that burn exactly n cycles (no side-set, so delays up to 31). */
function burn(n: number) {
  const out: string[] = [];
  while (n > 0) {
    const k = Math.min(n, 32);
    out.push(`    nop [${k - 1}]`);
    n -= k;
  }
  return out.join("\n");
}

export const GUARD_NS = 2; // setup margin into the input flop

const clean = (s: string) => s.replace(/\n\s*\n/g, "\n");

export function buildDesign(variant: Variant, rev: Rev, mhz: number): Design {
  const T = 1000 / mhz;
  const sh = rev === "A" ? SHIFTER.txb0108 : SHIFTER.lvc8t245;
  const dMin = lo(sh.bToA);
  const dMax = hi(sh.bToA);
  const addrMax = hi(BUS.addrValid);
  const selMax = hi(BUS.selectLow);
  // cycles k so that pins sampled k·T after the edge (as the PIO sees it) are late enough
  const atLeast = (need: number) => Math.max(0, Math.ceil((need - dMin + GUARD_NS) / T));
  const DA = 2; // the release path takes this many cycles to get back to "fetch"
  const defs = { PHI: PIN.PHI, WR: PIN.WR };
  const notes: Record<string, number> = {};

  // After `wait 1 gpio PHI [DA]`, the n-th following instruction sees pins sampled (1 + DA + n)·T
  // after the PHI edge reached the pin (+ up to one T of clock phase).
  const decode = `
    jmp pin, skip
    mov osr, pins
    out null, 14
    out x, 2
    jmp x--, r1
    jmp drive
r1:
    jmp x--, r2
    jmp drive
r2:
    jmp x--, skip
    out null, 1
    out x, 1
    jmp x--, skip`;
  // x = A14 | A15<<1 → 0: ROM 0000-3FFF, 1: ROM 4000-7FFF, 2: 8000-BFFF (ours if /CS low), 3: C000+ (never)
  // Rev B: the shifter's DIR pin is the 9th OUT pin, its output latch held at 1 and a pull-down on the
  // board, so `mov pindirs` turns the shifter around in the same cycle that drives D0-D7 (RP2350 PIO v1).
  const driveBlock = `
drive:
    pull block
    out pins, 8
    mov pindirs, ~null
    wait 0 gpio PHI
    wait 1 gpio PHI
    mov pindirs, null [${DA - 2}]
    jmp fetch`;

  let src: string;
  if (variant === "romWindow") {
    const xA = Math.max(0, atLeast(addrMax + dMax) - (2 + DA));
    const xS = Math.max(0, atLeast(selMax + dMax) - (4 + DA + xA));
    notes.addressSample = (2 + DA + xA) * T + dMin;
    notes.decodeSample = (4 + DA + xA + xS) * T + dMin;
    src = `
.program gb_read
top:
    wait 0 gpio PHI
    wait 1 gpio PHI [${DA}]
fetch:
${burn(xA)}
    in y, 17
    in pins, 15
${burn(xS)}
    jmp pin, skip
    mov osr, pins
    out null, 15
    out x, 1
    jmp x--, skip
${driveBlock}
skip:
    pull block
    jmp top
`;
  } else if (variant === "speculative") {
    // A15 only becomes valid with the select strobe, so the early lookup uses A0-A14 (the ROM). A mailbox
    // read drops that byte and looks the mailbox up after decoding (slower), from ROM-image offset 0x7F00,
    // which the ROM leaves empty (it ends at 0x50D0).
    const xA = Math.max(0, atLeast(addrMax + dMax) - (2 + DA)); // `in pins` is instruction xA+2
    const xS = Math.max(0, atLeast(selMax + dMax) - (4 + DA + xA)); // `jmp pin` / `mov osr, pins`
    notes.addressSample = (2 + DA + xA) * T + dMin;
    notes.decodeSample = (4 + DA + xA + xS) * T + dMin;
    src = `
.program gb_read
top:
    wait 0 gpio PHI
    wait 1 gpio PHI [${DA}]
fetch:
${burn(xA)}
    in y, 17
    in pins, 15
${burn(xS)}${decode}
    pull block
    mov x, ~null
    in y, 17
    in x, 7
    in pins, 8
${driveBlock}
skip:
    pull block
    jmp top
`;
  } else {
    const xS = Math.max(0, atLeast(selMax + dMax) - (2 + DA));
    notes.decodeSample = (2 + DA + xS) * T + dMin;
    src = `
.program gb_read
top:
    wait 0 gpio PHI
    wait 1 gpio PHI [${DA}]
fetch:
${burn(xS)}${decode.replace("jmp drive", "jmp look").replace("jmp drive", "jmp look")}
look:
    in y, 16
    in pins, 16
${driveBlock}
skip:
    jmp top
`;
  }
  const prog = assemble(clean(src), defs);
  const sms: SmSpec[] = [
    {
      name: "read",
      prog,
      cfg: { inBase: 0, outBase: PIN.D0, outCount: rev === "B" ? 9 : 8, jmpPin: PIN.RD, inShiftLeft: true, outShiftRight: true, autopush: 32 },
      y: variant === "decodeFirst" ? 0x2001 : 0x4000, // ROM image at 0x2000_0000 / bus image at 0x2001_0000
      table: variant === "decodeFirst" ? "bus" : "romimg",
    },
  ];

  // writes (another PIO block: it only listens): sample while /WR is low, once even late data has settled
  const DW = Math.max(0, atLeast(hi(BUS.writeDataValid) - lo(BUS.wrLow) + dMax) - 1);
  notes.writeSampleAfterWrFall = (1 + DW) * T + dMin;
  const wsrc = `
.program gb_write
.wrap_target
    wait 0 gpio WR [${Math.min(DW, 31)}]
${burn(Math.max(0, DW - 31))}
    in pins, 26
    wait 1 gpio WR
.wrap
`;
  sms.push({
    name: "write",
    prog: assemble(clean(wsrc), defs),
    cfg: { inBase: 0, outBase: PIN.D0, outCount: 8, inShiftLeft: false, outShiftRight: true, autopush: 26 },
    table: "ring",
  });
  return { variant, rev, mhz, sms, notes, driveBlock: prog.lines.length };
}

/** The obvious alternative, one state machine per region, for the report: does it fit one block? */
export function splitDesignSize(): { rom: number; ram: number } {
  // counted from the same building blocks as above (Rev A)
  const rom = 2 + 1 + 6 + 2 + 9; // wait×2, burn, decode (jmp pin, mov, out, out, jmp, out/jmp), in×2, drive
  const ram = 2 + 1 + 9 + 2 + 9;
  return { rom, ram };
}
