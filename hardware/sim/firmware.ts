// The cartridge MCU at the functional level: it answers the 0xA000 window from a 256-byte mailbox
// in SRAM, takes the Game Boy's writes off the PIO write ring, and runs the real wallet logic
// (web/src/chip/chip.ts, the same code the website runs) with the time each command would take
// on an RP2350 + SE050 instead of answering instantly.

import { CartChip } from "../../web/src/chip/chip";
import { CMD, CMD_NAME, MAILBOX, MB, type Bus } from "../../web/src/chip/protocol";
import type { CartPort } from "./tracer";
import { MCU_WORK, SE050, hi, lo, mid, type Source } from "./params";

export const T_CYCLE_NS = 1e9 / 4194304; // one T-cycle
export const tToMs = (t: number) => (t * T_CYCLE_NS) / 1e6;
const msToT = (ms: number) => Math.round((ms * 1e6) / T_CYCLE_NS);

export type Corner = "typ" | "worst";
const pick = (s: Source, c: Corner) => (c === "typ" ? mid(s) : hi(s));
const num = (s: Source) => s.value as number;

/** One step of a command's work, for the breakdown in the report. */
export interface Step {
  what: string;
  ms: number;
}

/** I²C transfer at the SE050's 1 MHz (T=1 over I²C: 5 framing bytes per block of up to 254, 9 clocks per byte). */
function i2c(bytesOut: number, bytesIn: number): number {
  const frame = (n: number) => n + 5 * Math.ceil(Math.max(n, 1) / 254);
  const clocks = (frame(bytesOut) + frame(bytesIn)) * 9;
  return (clocks / num(SE050.i2cMax)) * 1000 + 0.1 + num(SE050.wakeFromPowerDown);
}

export interface Clock {
  mhz: number;
}

/** What a command costs on the real cartridge. */
export function commandCost(
  cmd: number,
  arg: number,
  ctx: { signKind?: "sol" | "evm" | "swap-sol" | "swap-evm"; messageLen?: number },
  clock: Clock,
  c: Corner,
): Step[] {
  const cyc = (n: number) => (n / (clock.mhz * 1e6)) * 1000; // cycles -> ms
  const mcu = (what: string) => ({ what, ms: pick(MCU_WORK.command, c) });
  const seDerive = (): Step[] => {
    const sha = pick(MCU_WORK.sha512Block, c);
    return [
      { what: "BIP-39 seed: PBKDF2-HMAC-SHA512 × 2048 (4096 blocks)", ms: cyc(4098 * sha) },
      { what: "SLIP-10 + BIP-32 paths (~40 HMAC blocks)", ms: cyc(40 * sha) },
      { what: "secp256k1: 3 point multiplications (2 parent keys + address)", ms: cyc(3 * pick(MCU_WORK.secp256k1Mul, c)) },
      { what: "Ed25519 public key (base-point mult)", ms: cyc(pick(MCU_WORK.ed25519Base, c)) },
    ];
  };
  const pinKdf: Step = { what: "PIN → AES auth key (PBKDF2-SHA256 × 1000 on MCU)", ms: cyc(2000 * pick({ value: [3000, 5000], unit: "", source: "", confidence: "assumed" }, c)) };
  switch (cmd) {
    case CMD.CREATE:
      return [
        { what: "SE050 TRNG: 16 bytes at 114 B/s", ms: (16 / num(SE050.trng)) * 1000 + i2c(10, 20) },
        ...seDerive(),
      ];
    case CMD.RESTORE:
      return [mcu("checksum"), ...seDerive()];
    case CMD.SET_PIN:
      return [
        pinKdf,
        { what: "SE050 WriteECKey: Ed25519 key (sign-only, PIN-session policy)", ms: pick(SE050.objectOp, c) + i2c(90, 4) },
        { what: "SE050 WriteECKey: secp256k1 key", ms: pick(SE050.objectOp, c) + i2c(90, 4) },
        { what: "SE050 PIN auth object (max 5 attempts)", ms: pick(SE050.objectOp, c) + i2c(60, 4) },
        { what: "SE050 open PIN session", ms: pick(SE050.sessionOpen, c) + i2c(40, 20) },
        { what: "erase seed from RAM", ms: 0.01 },
      ];
    case CMD.UNLOCK:
      return [
        { what: "SE050 spend one try (counter object)", ms: pick(SE050.objectOp, c) + i2c(20, 4) },
        pinKdf,
        { what: "SE050 open PIN session", ms: pick(SE050.sessionOpen, c) + i2c(40, 20) },
      ];
    case CMD.SIGN: {
      if (arg !== 1) return [mcu("reject")];
      const k = ctx.signKind ?? "sol";
      if (k === "sol" || k === "swap-sol") {
        const n = k === "sol" ? (ctx.messageLen ?? 200) : 32;
        return [
          { what: `send ${n}-byte message to SE050 (PureEdDSA: whole message)`, ms: i2c(n + 20, 0) },
          { what: "SE050 EdDSASign (Ed25519)", ms: num(SE050.ed25519Sign) * (c === "typ" ? 1 : 1.2) },
          { what: "read 64-byte signature", ms: i2c(0, 72) },
        ];
      }
      return [
        { what: k === "evm" ? "keccak256 of the unsigned transaction" : "digest of the swap intent", ms: cyc(60_000) },
        { what: "send 32-byte digest to SE050", ms: i2c(52, 0) },
        { what: "SE050 ECDSASign (secp256k1)", ms: num(SE050.ecdsaSign) * (c === "typ" ? 1 : 1.2) },
        { what: "read DER signature", ms: i2c(0, 74) },
        { what: "low-S normalise + recovery id (pubkey recovery on MCU, 2 point mults)", ms: cyc(2 * pick(MCU_WORK.secp256k1Mul, c)) },
      ];
    }
    case CMD.WIPE:
      return [{ what: "SE050 delete 3 key/auth objects", ms: 3 * (pick(SE050.objectOp, c) + i2c(12, 4)) }];
    case CMD.PAIR:
      if (arg === 1) return [mcu("compare code"), { what: "store BLE bond in flash (4 KB sector erase + program)", ms: c === "typ" ? 50 : 400 }];
      return [mcu(CMD_NAME[cmd] ?? "command")];
    case CMD.PHONE:
      if (arg === 1) return [{ what: "forget BLE bond (flash sector erase)", ms: c === "typ" ? 45 : 400 }];
      return [mcu(CMD_NAME[cmd] ?? "command")];
    case CMD.ENTROPY:
      return [{ what: "SHA-256 into the pool", ms: cyc(20_000) }];
    default:
      return [mcu(CMD_NAME[cmd] ?? "command")];
  }
}

export interface CallRecord {
  cmd: string;
  arg: number;
  tReq: number; // T-cycles: Game Boy bumped req_seq
  costMs: number; // modelled work
  steps: Step[];
  tReady?: number; // reply visible on the bus
  tSeen?: number; // the Game Boy read the matching resp_seq
  detail?: string;
}

/** The cartridge's mailbox SRAM and the firmware around CartChip. */
export class Firmware implements CartPort {
  readonly sram = new Uint8Array(256);
  /** reply bytes waiting to become visible: [due T, offset, value] in write order */
  private queue: [number, number, number][] = [];
  private current: CallRecord | null = null;
  calls: CallRecord[] = [];
  /** the Game Boy wrote a byte the cartridge owns (ignored, like the firmware would) */
  illegalWrites = 0;
  /** last time each offset was written by the Game Boy, to find write->read hazards */
  private lastGbWrite = new Float64Array(256).fill(-1);
  readBackGaps: number[] = [];
  now = 0;
  private stage: Bus;

  constructor(
    readonly chip: CartChip,
    readonly clock: Clock,
    readonly corner: Corner,
  ) {
    const fw = this;
    this.stage = {
      read: (addr) => fw.sram[(addr - MAILBOX) & 0xff],
      write(addr, value) {
        const off = (addr - MAILBOX) & 0xff;
        if (off >= MB.MAGIC || !fw.current) fw.sram[off] = value; // status bytes: background updates
        else fw.queue.push([fw.dueAt(), off, value]);
      },
    };
  }

  private dueAt() {
    const c = this.current!;
    return Math.max(this.now, c.tReq + msToT(c.costMs));
  }

  private commit(t: number) {
    while (this.queue.length && this.queue[0][0] <= t) {
      const [due, off, v] = this.queue.shift()!;
      this.sram[off] = v;
      if (off === MB.RESP_SEQ && this.current && this.current.tReady === undefined) this.current.tReady = due;
    }
  }

  read(addr: number, t: number) {
    this.now = t;
    this.commit(t);
    const off = addr & 0xff;
    if (this.lastGbWrite[off] >= 0 && off < MB.RESP_SEQ) this.readBackGaps.push((t - this.lastGbWrite[off]) / 4);
    const v = this.sram[off];
    if (off === MB.RESP_SEQ && this.current && this.current.tReady !== undefined && this.current.tSeen === undefined && v === this.sram[MB.REQ_SEQ])
      this.current.tSeen = t;
    return v;
  }

  write(addr: number, value: number, t: number) {
    this.now = t;
    this.commit(t);
    const off = addr & 0xff;
    if (off >= MB.RESP_SEQ) {
      this.illegalWrites++;
      return;
    }
    this.sram[off] = value;
    this.lastGbWrite[off] = t;
    if (off === MB.REQ_SEQ && value !== 0) this.request(t);
  }

  private request(t: number) {
    const cmd = this.sram[MB.CMD];
    const arg = this.sram[MB.ARG];
    const pending = (this.chip as unknown as { pending: { snap: { chain: string; message?: Uint8Array; intent?: { src: { chain: string } } } } | null }).pending;
    const ctx: Parameters<typeof commandCost>[2] = {};
    if (pending) {
      const s = pending.snap;
      ctx.signKind = s.chain === "sol" ? "sol" : s.chain === "evm" ? "evm" : s.intent!.src.chain === "sol" ? "swap-sol" : "swap-evm";
      ctx.messageLen = s.message?.length;
    }
    const steps = commandCost(cmd, arg, ctx, this.clock, this.corner);
    const rec: CallRecord = { cmd: CMD_NAME[cmd] ?? `0x${cmd.toString(16)}`, arg, tReq: t, costMs: steps.reduce((a, s) => a + s.ms, 0), steps };
    if (cmd === CMD.SIGN && arg === 1) rec.detail = `${ctx.signKind}${ctx.messageLen ? `, ${ctx.messageLen}-byte message` : ""}`;
    this.calls.push(rec);
    this.current = rec;
    this.chip.tick(this.stage);
  }

  /** Once per frame: background status, and replies that finished asynchronously. */
  frame(t: number) {
    this.now = t;
    this.commit(t);
    this.chip.tick(this.stage);
  }
}

export { lo, hi };
