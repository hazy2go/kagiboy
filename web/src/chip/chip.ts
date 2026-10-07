import { SystemInstruction, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { formatEther, type TransactionSerializableEIP1559 } from "viem";
import { sha256 } from "@noble/hashes/sha2.js";
import qrcode from "qrcode-generator";
import { CHIP_MAGIC, CMD, CMD_NAME, MAILBOX, MB, RESP_MAX, type Bus, type Chain } from "./protocol";
import { concat, newMnemonic, walletFromMnemonic, type Wallet } from "./keys";

/**
 * Software stand-in for the cartridge's MCU + secure element.
 *
 * It owns the keys and answers the Game Boy over the mailbox. The phone can ask
 * it to sign, but only the Game Boy's buttons can approve, and the chip decodes
 * each transaction itself so the screen shows what is actually being signed.
 */

/** What the secure element keeps across power cycles. */
export interface Persisted {
  mnemonic: string;
  pinSalt: string;
  pinHash: string;
  triesLeft: number;
}

export interface Storage {
  load(): Persisted | null;
  save(p: Persisted): void;
  clear(): void;
}

export type SignRequest =
  | { chain: "sol"; tx: Transaction }
  | { chain: "evm"; tx: TransactionSerializableEIP1559 };

export type SignResult =
  | { approved: true; chain: "sol"; signed: Transaction }
  | { approved: true; chain: "evm"; signed: `0x${string}` }
  | { approved: false };

export interface BusEvent {
  t: number;
  dir: "gb>chip" | "chip>gb";
  cmd: string;
  hex: string;
  note?: string;
}

interface Reply {
  status: number;
  data?: Uint8Array | string;
}

interface Pending {
  req: SignRequest;
  to: string;
  amount: string;
  resolve: (r: SignResult) => void;
}

const MAX_TRIES = 5;

export class CartChip {
  private wallet: Wallet | null = null;
  private persisted: Persisted | null;
  private unlocked = false;
  private pool: Uint8Array = new Uint8Array(32);
  private lastSeq = 0;
  private inFlight: { seq: number; reply: Promise<Reply> } | null = null;
  private ready: { seq: number; reply: Reply } | null = null;
  private pending: Pending | null = null;
  private balances: Record<Chain, string> = { sol: "-- SOL", evm: "-- ETH" };
  private txStatus = { state: "", sig: "" };
  accel = { x: 0, y: 0 };

  private listeners = new Set<() => void>();
  readonly log: BusEvent[] = [];

  private storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
    this.persisted = storage.load();
  }

  // ---------- phone-facing API (over Bluetooth on the real thing) ----------

  get state(): "none" | "locked" | "unlocked" {
    if (!this.persisted) return "none";
    return this.unlocked ? "unlocked" : "locked";
  }

  /** Public addresses only; keys never leave the chip. */
  get addresses(): Record<Chain, string> | null {
    if (!this.wallet) return null;
    return { sol: this.wallet.sol.publicKey.toBase58(), evm: this.wallet.evm.address };
  }

  get hasPending() {
    return this.pending !== null;
  }

  setBalance(chain: Chain, text: string) {
    this.balances[chain] = text;
  }

  /** `detail` is a signature/hash (shortened for the screen) or, on failure, a short reason. */
  setTxStatus(state: string, detail = "") {
    const isHash = !detail.includes(" ") && detail.length > 20;
    this.txStatus = { state, sig: isHash ? `${detail.slice(0, 8)}..${detail.slice(-8)}` : detail.slice(0, 36) };
    this.emit();
  }

  /** Resolves once the user approves or rejects on the Game Boy. */
  requestSignature(req: SignRequest): Promise<SignResult> {
    if (this.pending) return Promise.reject(new Error("a request is already waiting on the Game Boy"));
    const { to, amount } = describe(req);
    return new Promise((resolve) => {
      this.pending = { req, to, amount, resolve };
      this.txStatus = { state: "", sig: "" };
      this.emit();
    });
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Power cycle: RAM state goes, the secure element's storage stays. */
  reset() {
    this.unlocked = false;
    this.wallet = null;
    this.lastSeq = 0;
    this.inFlight = null;
    this.ready = null;
    this.pool = new Uint8Array(32);
    this.pending?.resolve({ approved: false });
    this.pending = null;
    this.emit();
  }

  // ---------- Game Boy-facing side: called once per emulated frame ----------

  tick(bus: Bus) {
    const w = (off: number, v: number) => bus.write(MAILBOX + off, v & 0xff);
    const r = (off: number) => bus.read(MAILBOX + off);

    w(MB.MAGIC, CHIP_MAGIC);
    w(MB.ACCEL_X, this.accel.x);
    w(MB.ACCEL_Y, this.accel.y);
    w(MB.PENDING, this.pending && this.unlocked ? 1 : 0);

    if (this.ready) {
      const { seq, reply } = this.ready;
      this.ready = null;
      this.writeReply(bus, seq, reply);
      return;
    }
    if (this.inFlight) return;

    const seq = r(MB.REQ_SEQ);
    if (seq === 0 || seq === this.lastSeq) return;
    this.lastSeq = seq;

    const cmd = r(MB.CMD);
    const arg = r(MB.ARG);
    const len = Math.min(r(MB.REQ_LEN), 60);
    const data = new Uint8Array(len);
    for (let i = 0; i < len; i++) data[i] = r(MB.REQ + i);
    this.record("gb>chip", cmd, concat(new Uint8Array([cmd, arg]), data));

    const result = this.handle(cmd, arg, data);
    if (result instanceof Promise) {
      const reply = result.catch((e): Reply => {
        console.error(e);
        return { status: 0xff };
      });
      this.inFlight = { seq, reply };
      reply.then((rep) => {
        this.inFlight = null;
        this.ready = { seq, reply: rep };
      });
    } else {
      this.writeReply(bus, seq, result);
    }
  }

  private writeReply(bus: Bus, seq: number, reply: Reply) {
    const bytes = typeof reply.data === "string" ? ascii(reply.data) : (reply.data ?? new Uint8Array());
    const n = Math.min(bytes.length, RESP_MAX);
    for (let i = 0; i < n; i++) bus.write(MAILBOX + MB.RESP + i, bytes[i]);
    bus.write(MAILBOX + MB.RESP_LEN, n);
    bus.write(MAILBOX + MB.STATUS, reply.status);
    bus.write(MAILBOX + MB.RESP_SEQ, seq); // last, so the Game Boy never reads a half-written reply
    this.record("chip>gb", bus.read(MAILBOX + MB.CMD), concat(new Uint8Array([reply.status]), bytes.slice(0, n)));
    this.emit();
  }

  private handle(cmd: number, arg: number, data: Uint8Array): Reply | Promise<Reply> {
    switch (cmd) {
      case CMD.PING:
        return { status: 0, data: new Uint8Array([{ none: 0, locked: 1, unlocked: 2 }[this.state]]) };

      case CMD.ENTROPY:
        this.pool = sha256(concat(this.pool, data));
        return { status: 0, data: this.pool.slice(0, 4) };

      case CMD.CREATE: {
        const mnemonic = newMnemonic(this.pool);
        this.pool = new Uint8Array(32);
        this.wallet = walletFromMnemonic(mnemonic);
        return { status: 0, data: mnemonic };
      }

      case CMD.SET_PIN: {
        if (!this.wallet || data.length !== 4) return { status: 1 };
        const pinSalt = hex(crypto.getRandomValues(new Uint8Array(16)));
        this.persisted = {
          mnemonic: this.wallet.mnemonic,
          pinSalt,
          pinHash: pinHash(pinSalt, data),
          triesLeft: MAX_TRIES,
        };
        this.storage.save(this.persisted);
        this.unlocked = true;
        return { status: 0 };
      }

      case CMD.UNLOCK: {
        const p = this.persisted;
        if (!p) return { status: 2 };
        if (pinHash(p.pinSalt, data) === p.pinHash) {
          p.triesLeft = MAX_TRIES;
          this.storage.save(p);
          this.wallet = walletFromMnemonic(p.mnemonic);
          this.unlocked = true;
          return { status: 0 };
        }
        p.triesLeft -= 1;
        if (p.triesLeft <= 0) {
          this.wipe();
          return { status: 2 };
        }
        this.storage.save(p);
        return { status: 1, data: new Uint8Array([p.triesLeft]) };
      }

      case CMD.ACCOUNT: {
        if (!this.unlocked || !this.addresses) return { status: 1 };
        const chain: Chain = arg === 0 ? "sol" : "evm";
        return { status: 0, data: `${this.addresses[chain]}\0${this.balances[chain]}\0` };
      }

      case CMD.PENDING: {
        if (!this.unlocked || !this.pending) return { status: 1 };
        const { req, to, amount } = this.pending;
        return {
          status: 0,
          data: concat(new Uint8Array([req.chain === "sol" ? 0 : 1]), ascii(`${to}\0${amount}\0`)),
        };
      }

      case CMD.SIGN: {
        const p = this.pending;
        if (!this.unlocked || !this.wallet || !p) return { status: 1 };
        this.pending = null;
        if (arg !== 1) {
          p.resolve({ approved: false });
          this.setTxStatus("REJECTED");
          return { status: 0 };
        }
        return this.sign(this.wallet, p).then(() => ({ status: 0 }));
      }

      case CMD.QR: {
        if (!this.unlocked || !this.addresses) return { status: 1 };
        return { status: 0, data: qrBits(this.addresses[arg === 0 ? "sol" : "evm"]) };
      }

      case CMD.TXSTATUS:
        return { status: 0, data: `${this.txStatus.state}\0${this.txStatus.sig}\0` };

      case CMD.LOCK:
        this.unlocked = false;
        this.wallet = null;
        return { status: 0 };

      case CMD.WIPE:
        this.wipe();
        return { status: 0 };

      default:
        return { status: 0xff };
    }
  }

  private async sign(wallet: Wallet, p: Pending) {
    this.setTxStatus("SIGNED");
    if (p.req.chain === "sol") {
      const tx = p.req.tx;
      tx.partialSign(wallet.sol);
      p.resolve({ approved: true, chain: "sol", signed: tx });
    } else {
      const signed = await wallet.evm.signTransaction(p.req.tx);
      p.resolve({ approved: true, chain: "evm", signed });
    }
  }

  private wipe() {
    this.storage.clear();
    this.persisted = null;
    this.wallet = null;
    this.unlocked = false;
    this.pending?.resolve({ approved: false });
    this.pending = null;
  }

  private record(dir: BusEvent["dir"], cmd: number, bytes: Uint8Array) {
    const secret = cmd === CMD.CREATE && dir === "chip>gb";
    this.log.push({
      t: Date.now(),
      dir,
      cmd: CMD_NAME[cmd] ?? `0x${cmd.toString(16)}`,
      hex: secret ? "** recovery words, shown on the Game Boy only **" : hex(bytes.slice(0, 24)) + (bytes.length > 24 ? " .." : ""),
    });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

/**
 * The chip decodes the transaction itself instead of trusting the phone's
 * summary. Anything it can't decode, it refuses to sign (no blind signing).
 */
function describe(req: SignRequest): { to: string; amount: string } {
  if (req.chain === "sol") {
    const ixs = req.tx.instructions;
    if (ixs.length !== 1 || !ixs[0].programId.equals(SystemProgram.programId)) {
      throw new Error("only plain SOL transfers can be shown on the Game Boy yet");
    }
    const { toPubkey, lamports } = SystemInstruction.decodeTransfer(ixs[0]);
    return { to: toPubkey.toBase58(), amount: `${fmt(Number(lamports) / LAMPORTS_PER_SOL)} SOL` };
  }
  if (!req.tx.to) throw new Error("contract deployment is not supported");
  if (req.tx.data && req.tx.data !== "0x") throw new Error("only plain ETH transfers can be shown on the Game Boy yet");
  return { to: req.tx.to, amount: `${fmt(Number(formatEther(req.tx.value ?? 0n)))} ETH` };
}

/**
 * The address as a QR code, small enough for the Game Boy to draw:
 * byte 0 is the side length, then the modules row by row, 1 bit each (1 = dark).
 * A 44-character Solana address fits version 3 (29×29) at error level L.
 */
export function qrBits(text: string): Uint8Array {
  const qr = qrcode(0, "L");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  if (n > 29) throw new Error(`QR too big for the screen (${n} modules)`);
  const out = new Uint8Array(1 + Math.ceil((n * n) / 8));
  out[0] = n;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (qr.isDark(r, c)) out[1 + (i >> 3)] |= 0x80 >> (i & 7);
    }
  return out;
}

function fmt(n: number) {
  return n.toFixed(n !== 0 && n < 0.0001 ? 8 : 4);
}

function pinHash(salt: string, pin: Uint8Array) {
  return hex(sha256(concat(ascii(salt), pin)));
}

function ascii(s: string) {
  return Uint8Array.from(s, (c) => {
    const code = c.charCodeAt(0);
    return code < 128 ? code : 63;
  });
}

export function hex(b: Uint8Array) {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
}
