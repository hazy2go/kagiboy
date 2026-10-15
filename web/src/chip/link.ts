import { Transaction } from "@solana/web3.js";
import { getAddress, parseTransaction, serializeTransaction, toHex, type TransactionSerializableEIP1559 } from "viem";
import bs58 from "bs58";
import type { CartChip, FailReason, SignRequest, SignResult, SwapIntent, TxState } from "./chip";
import type { Chain } from "./protocol";

/**
 * The phone link: what the companion app and the cartridge say to each other over Bluetooth.
 * Spec: docs/phone-link.md. The ESP32-C3 passes messages through unchanged; the RP2350 answers them
 * (firmware/rp2350/core/src/phone.rs, which must match `ChipServer` here byte for byte).
 *
 * Request:  [op] [tag] [body...]            at most 240 bytes
 * Reply:    [op | 0x80] [tag] [status] [body...]   status 0 ok, 1 refused (body = the reason as text), 2 malformed
 */

export const LINK_MAX = 240;
export const CHUNK = 232;
export const STAGE = 2048;

export const OP = {
  STATUS: 0x01,
  PAIR: 0x02,
  UNPAIR: 0x03,
  NETWORK: 0x04,
  BALANCE: 0x05,
  TXSTATUS: 0x06,
  PUT: 0x07,
  SIGN: 0x08,
  RESULT: 0x09,
  GET: 0x0a,
} as const;

export const ST = { OK: 0, REFUSED: 1, MALFORMED: 2 } as const;
const RESULT_KIND = { WAIT: 0, SOL: 1, EVM: 2, SWAP: 3, REFUSED: 4 } as const;
const PAIR_END = ["none", "accepted", "refused", "lapsed"] as const;
export type PairEnd = (typeof PAIR_END)[number];
const REFUSALS = ["rejected", "power", "locked", "error"] as const;

// ---------------------------------------------------------------- bytes

class W {
  private b: number[] = [];
  u8(v: number) {
    this.b.push(v & 0xff);
    return this;
  }
  u16(v: number) {
    return this.u8(v).u8(v >> 8);
  }
  u32(v: number) {
    return this.u16(v & 0xffff).u16(v >>> 16);
  }
  big(v: bigint, n: number) {
    for (let i = 0; i < n; i++) this.u8(Number((v >> BigInt(8 * i)) & 0xffn));
    return this;
  }
  bytes(v: Uint8Array) {
    for (const x of v) this.b.push(x);
    return this;
  }
  /** a length-prefixed string; `null` is written as length 0xFF */
  str(v: string | null | undefined) {
    if (v == null) return this.u8(0xff);
    const e = new TextEncoder().encode(v);
    if (e.length > 0xfe) throw new Error("text too long for the link");
    return this.u8(e.length).bytes(e);
  }
  done() {
    return Uint8Array.from(this.b);
  }
}

class R {
  p = 0;
  private b: Uint8Array;
  constructor(b: Uint8Array) {
    this.b = b;
  }
  private need(n: number) {
    if (this.p + n > this.b.length) throw new Malformed();
  }
  u8() {
    this.need(1);
    return this.b[this.p++];
  }
  u16() {
    return this.u8() | (this.u8() << 8);
  }
  u32() {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  big(n: number) {
    let v = 0n;
    for (let i = 0; i < n; i++) v |= BigInt(this.u8()) << BigInt(8 * i);
    return v;
  }
  bytes(n: number) {
    this.need(n);
    const s = this.b.slice(this.p, this.p + n);
    this.p += n;
    return s;
  }
  rest() {
    return this.bytes(this.b.length - this.p);
  }
  str(): string | null {
    const n = this.u8();
    if (n === 0xff) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(this.bytes(n));
  }
  end() {
    if (this.p !== this.b.length) throw new Malformed();
  }
}

class Malformed extends Error {
  constructor() {
    super("malformed message");
  }
}

// ---------------------------------------------------------------- requests (phone side)

export const msg = {
  status: (nowMs: number) => (tag: number) => new W().u8(OP.STATUS).u8(tag).big(BigInt(nowMs), 8).done(),
  pair: (name: string) => (tag: number) => new W().u8(OP.PAIR).u8(tag).str(name.slice(0, 64)).done(),
  unpair: () => (tag: number) => new W().u8(OP.UNPAIR).u8(tag).done(),
  network: (id: number) => (tag: number) => new W().u8(OP.NETWORK).u8(tag).big(BigInt(id), 8).done(),
  balance: (chain: Chain, units: bigint | null) => (tag: number) =>
    new W()
      .u8(OP.BALANCE)
      .u8(tag)
      .u8(chain === "sol" ? 0 : 1)
      .u8(units === null ? 0 : 1)
      .big(units ?? 0n, 16)
      .done(),
  txStatus: (id: number, state: string, hash?: string, reason?: string) => (tag: number) =>
    new W().u8(OP.TXSTATUS).u8(tag).u32(id).str(state).str(hash).str(reason).done(),
  put: (offset: number, data: Uint8Array) => (tag: number) => new W().u8(OP.PUT).u8(tag).u16(offset).bytes(data).done(),
  signBytes: (kind: 0 | 1, len: number) => (tag: number) => new W().u8(OP.SIGN).u8(tag).u8(kind).u16(len).done(),
  signSwap: (s: WireSwap) => (tag: number) =>
    new W()
      .u8(OP.SIGN)
      .u8(tag)
      .u8(2)
      .big(BigInt(s.src), 8)
      .big(BigInt(s.dst), 8)
      .big(s.sellAmount, 16)
      .big(s.minReceive, 16)
      .big(BigInt.asUintN(64, BigInt(s.deadline)), 8)
      .str(s.sellToken)
      .str(s.buyToken)
      .done(),
  result: (id: number) => (tag: number) => new W().u8(OP.RESULT).u8(tag).u32(id).done(),
  get: (offset: number) => (tag: number) => new W().u8(OP.GET).u8(tag).u16(offset).done(),
};
export type Msg = (tag: number) => Uint8Array;

export interface WireSwap {
  src: number;
  dst: number;
  sellToken: string;
  sellAmount: bigint;
  buyToken: string;
  minReceive: bigint;
  deadline: number;
}

export function wireSwap(s: SwapIntent): WireSwap {
  return {
    src: s.src.chain === "sol" ? 0 : s.src.net,
    dst: s.dst.chain === "sol" ? 0 : s.dst.net,
    sellToken: s.sellToken,
    sellAmount: s.sellAmount,
    buyToken: s.buyToken,
    minReceive: s.minReceive,
    deadline: s.deadline,
  };
}

/** The messages that ask the cartridge to sign: the bytes go up in chunks, then SIGN names them. */
export function signMessages(req: SignRequest): Msg[] {
  if (req.chain === "swap") return [msg.signSwap(wireSwap(req.swap))];
  const bytes =
    req.chain === "sol"
      ? "message" in req
        ? Uint8Array.from(req.message)
        : new Uint8Array(req.tx.serializeMessage())
      : hexBytes(serializeTransaction({ ...req.tx, type: "eip1559" }));
  if (bytes.length > STAGE) throw new Error("this transaction is too large for the cartridge");
  const out: Msg[] = [];
  for (let o = 0; o < bytes.length; o += CHUNK) out.push(msg.put(o, bytes.subarray(o, o + CHUNK)));
  out.push(msg.signBytes(req.chain === "sol" ? 0 : 1, bytes.length));
  return out;
}

// ---------------------------------------------------------------- replies

export interface Reply {
  op: number;
  tag: number;
  status: number;
  body: Uint8Array;
}

export function parseReply(b: Uint8Array): Reply {
  if (b.length < 3 || !(b[0] & 0x80)) throw new Error("bad reply from the cartridge");
  return { op: b[0] & 0x7f, tag: b[1], status: b[2], body: b.slice(3) };
}

function reply(req: Uint8Array, status: number, body: Uint8Array = new Uint8Array()) {
  return Uint8Array.from([(req[0] ?? 0) | 0x80, req[1] ?? 0, status, ...body]);
}

export interface Status {
  state: "none" | "locked" | "unlocked";
  paired: boolean;
  hasPending: boolean;
  pairWindowOpen: boolean;
  pairingCode: string | null;
  pairEnd: PairEnd;
  evmNetwork: number;
  addresses: Record<Chain, string> | null;
  phone: { name: string; id: string; since: number } | null;
}

export function parseStatus(body: Uint8Array): Status {
  const r = new R(body);
  const state = (["none", "locked", "unlocked"] as const)[r.u8()] ?? "none";
  const f = r.u8();
  const pairEnd = PAIR_END[r.u8()] ?? "none";
  const evmNetwork = Number(r.big(8));
  const pairingCode = f & 16 ? new TextDecoder().decode(r.bytes(6)) : null;
  let addresses: Status["addresses"] = null;
  if (f & 8) {
    const sol = bs58.encode(r.bytes(32));
    const evm = toChecksum(r.bytes(20));
    addresses = { sol, evm };
  }
  let phone: Status["phone"] = null;
  if (f & 1) phone = { name: r.str() ?? "", id: r.str() ?? "", since: Number(r.big(8)) };
  r.end();
  return { state, paired: !!(f & 1), hasPending: !!(f & 2), pairWindowOpen: !!(f & 4), pairingCode, pairEnd, evmNetwork, addresses, phone };
}

// ---------------------------------------------------------------- the reference server (the cartridge's side)

/**
 * Answers phone-link messages from a chip. The browser demo can run it over a loopback; on the cartridge the
 * RP2350 firmware does the same in Rust, and the recorded sessions hold both sides' bytes.
 */
export class ChipServer {
  private stageIn = new Uint8Array(STAGE);
  private stageOut: Uint8Array = new Uint8Array();
  private results = new Map<number, SignResult>();
  private lastResult: { id: number; body: Uint8Array; out: Uint8Array } | null = null;
  private pairEnd = 0;
  private pairGen = 0;
  private last: { req: string; rep: Uint8Array } | null = null;

  private chip: CartChip;
  constructor(chip: CartChip) {
    this.chip = chip;
  }

  async handle(req: Uint8Array): Promise<Uint8Array> {
    // a message sent again with the same tag (its reply was lost) gets the same reply, not a second effect
    const key = hexOf(req);
    if (this.last && this.last.req === key && req.length >= 2 && req[1] !== 0) return this.last.rep;
    let rep: Uint8Array;
    try {
      rep = await this.serve(req);
    } catch (e) {
      rep = e instanceof Malformed ? reply(req, ST.MALFORMED) : reply(req, ST.REFUSED, new TextEncoder().encode(errText(e)));
    }
    this.last = { req: key, rep };
    return rep;
  }

  private async serve(req: Uint8Array): Promise<Uint8Array> {
    const r = new R(req);
    const op = r.u8();
    r.u8(); // tag
    const chip = this.chip;
    switch (op) {
      case OP.STATUS: {
        r.big(8); // the phone's clock: the cartridge sets its own from it; the browser chip has Date.now()
        r.end();
        return reply(req, ST.OK, this.status());
      }
      case OP.PAIR: {
        const name = r.str() ?? "PHONE";
        r.end();
        // a request refused up front doesn't replace the pairing already waiting, nor its outcome
        const gen = this.pairGen + 1;
        const p = chip.requestPairing(name);
        let refused: unknown = null;
        let settled = false;
        p.then(
          (ok) => {
            if (gen === this.pairGen) this.pairEnd = ok ? 1 : chip.lastPairingEnd === "lapsed" ? 3 : 2;
          },
          (e) => {
            refused = e;
            settled = true;
          },
        );
        await Promise.resolve();
        await Promise.resolve();
        if (settled) throw refused;
        this.pairGen = gen;
        this.pairEnd = 0;
        return reply(req, ST.OK, new TextEncoder().encode(chip.pairingCode ?? ""));
      }
      case OP.UNPAIR:
        r.end();
        chip.unpair();
        return reply(req, ST.OK);
      case OP.NETWORK: {
        const id = Number(r.big(8));
        r.end();
        chip.setEvmNetwork(id);
        return reply(req, ST.OK);
      }
      case OP.BALANCE: {
        const chain: Chain = r.u8() === 0 ? "sol" : "evm";
        const has = r.u8();
        const units = r.big(16);
        r.end();
        chip.setBalance(chain, has ? units : null);
        return reply(req, ST.OK);
      }
      case OP.TXSTATUS: {
        const id = r.u32();
        const state = r.str() ?? "";
        const hash = r.str() ?? undefined;
        const reason = r.str() ?? undefined;
        r.end();
        chip.setTxStatus(id, state as TxState, { hash, reason: reason as FailReason | undefined });
        return reply(req, ST.OK);
      }
      case OP.PUT: {
        const off = r.u16();
        const data = r.rest();
        if (off + data.length > STAGE) throw new Malformed();
        this.stageIn.set(data, off);
        return reply(req, ST.OK);
      }
      case OP.SIGN: {
        const kind = r.u8();
        let sreq: SignRequest;
        if (kind === 0 || kind === 1) {
          const len = r.u16();
          r.end();
          if (len > STAGE) throw new Malformed();
          const bytes = this.stageIn.slice(0, len);
          sreq = kind === 0 ? { chain: "sol", message: bytes } : { chain: "evm", tx: evmFromWire(bytes) };
        } else if (kind === 2) {
          const src = Number(r.big(8));
          const dst = Number(r.big(8));
          const sellAmount = r.big(16);
          const minReceive = r.big(16);
          const deadline = Number(BigInt.asIntN(64, r.big(8)));
          const sellToken = r.str() ?? "";
          const buyToken = r.str() ?? "";
          r.end();
          const side = (n: number) => (n === 0 ? { chain: "sol" as const } : { chain: "evm" as const, net: n });
          sreq = { chain: "swap", swap: { src: side(src), dst: side(dst), sellToken, sellAmount, buyToken, minReceive, deadline } };
        } else throw new Malformed();
        const { id, result } = chip.requestSignature(sreq);
        result.then((res) => this.results.set(id, res));
        return reply(req, ST.OK, new W().u32(id).done());
      }
      case OP.RESULT: {
        const id = r.u32();
        r.end();
        if (this.lastResult?.id === id) {
          this.stageOut = this.lastResult.out;
          return reply(req, ST.OK, this.lastResult.body);
        }
        const res = this.results.get(id);
        if (!res) return reply(req, ST.OK, Uint8Array.of(RESULT_KIND.WAIT));
        this.results.delete(id);
        let body: Uint8Array;
        let out: Uint8Array = new Uint8Array();
        if (!res.approved) body = new W().u8(RESULT_KIND.REFUSED).str(res.reason).done();
        else if (res.chain === "swap") body = new W().u8(RESULT_KIND.SWAP).str(res.signature).str(res.digest).done();
        else {
          out = res.chain === "sol" ? new Uint8Array(res.signed.serialize()) : hexBytes(res.signed);
          body = new W()
            .u8(res.chain === "sol" ? RESULT_KIND.SOL : RESULT_KIND.EVM)
            .u16(out.length)
            .done();
        }
        this.stageOut = out;
        this.lastResult = { id, body, out };
        return reply(req, ST.OK, body);
      }
      case OP.GET: {
        const off = r.u16();
        r.end();
        if (off > this.stageOut.length) throw new Malformed();
        return reply(req, ST.OK, this.stageOut.slice(off, off + CHUNK));
      }
    }
    throw new Malformed();
  }

  private status(): Uint8Array {
    const c = this.chip;
    const code = c.pairingCode;
    const a = c.addresses;
    const ph = c.phone;
    const f = (c.paired ? 1 : 0) | (c.hasPending ? 2 : 0) | (c.pairWindowOpen ? 4 : 0) | (a ? 8 : 0) | (code ? 16 : 0);
    const w = new W()
      .u8(["none", "locked", "unlocked"].indexOf(c.state))
      .u8(f)
      .u8(this.pairEnd)
      .big(BigInt(c.evmNetworkId), 8);
    if (code) w.bytes(new TextEncoder().encode(code));
    if (a) w.bytes(bs58.decode(a.sol)).bytes(hexBytes(a.evm));
    if (ph) w.str(ph.name).str(ph.id).big(BigInt(ph.since), 8);
    return w.done();
  }
}

// ---------------------------------------------------------------- the phone's view of a cartridge

/** What the phone app uses of a cartridge: the browser chip (`CartChip`) or a real one over Bluetooth (`RemoteChip`). */
export interface PhoneChip {
  readonly state: "none" | "locked" | "unlocked";
  readonly addresses: Record<Chain, string> | null;
  readonly hasPending: boolean;
  readonly paired: boolean;
  readonly pairingCode: string | null;
  readonly pairWindowOpen: boolean;
  readonly phone: { name: string; id: string; since: number } | null;
  readonly lastPairingEnd: "refused" | "lapsed";
  onNetwork: ((id: number) => void) | null;
  requestPairing(name?: string): Promise<boolean>;
  unpair(): void;
  setEvmNetwork(id: number): void;
  setBalance(chain: Chain, units: bigint | null): void;
  setTxStatus(id: number, state: TxState, detail?: { hash?: string; reason?: FailReason }): void;
  /** the browser chip answers at once; a cartridge after the request went over Bluetooth */
  requestSignature(req: SignRequest): SignStarted | Promise<SignStarted>;
  subscribe(fn: () => void): () => void;
}
export type SignStarted = { id: number; result: Promise<SignResult> };

// ---------------------------------------------------------------- the phone's view of a cartridge over the link

export interface LinkTransport {
  /** Sends one message and resolves with the cartridge's reply (throws on timeout or disconnect). */
  exchange(req: Uint8Array): Promise<Uint8Array>;
}

const POLL_MS = 250;

/**
 * The chip as the phone sees it across Bluetooth: the same calls as `CartChip`'s phone-facing side, answered by
 * the cartridge. Getters read the last STATUS, which is polled while connected.
 */
export class RemoteChip implements PhoneChip {
  private st: Status | null = null;
  private tag = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private pairWaiters: ((ok: boolean) => void)[] = [];
  private shownNetwork: number | null = null;
  lastPairingEnd: "refused" | "lapsed" = "refused";
  onNetwork: ((id: number) => void) | null = null;
  /** set when the link stops answering */
  error: string | null = null;

  private link: LinkTransport;
  private clock: () => number;

  constructor(link: LinkTransport, clock: () => number = Date.now) {
    this.link = link;
    this.clock = clock;
  }

  /** Starts polling; resolves after the first STATUS. */
  async start() {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh().catch(() => {}), POLL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get state() {
    return this.st?.state ?? "none";
  }
  get addresses() {
    return this.st?.state === "unlocked" ? this.st.addresses : null;
  }
  get hasPending() {
    return !!this.st?.hasPending;
  }
  get paired() {
    return !!this.st?.paired;
  }
  get pairingCode() {
    return this.st?.pairingCode ?? null;
  }
  get pairWindowOpen() {
    return !!this.st?.pairWindowOpen;
  }
  get phone() {
    return this.st?.phone ?? null;
  }
  get evmNetworkId() {
    return this.st?.evmNetwork ?? 0;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** One request and its reply, in order with every other; a lost reply is asked for again with the same tag. */
  call(m: Msg): Promise<Reply> {
    const run = async () => {
      this.tag = (this.tag % 255) + 1;
      const req = m(this.tag);
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const rep = parseReply(await this.link.exchange(req));
          if (rep.op !== req[0] || rep.tag !== req[1]) throw new Error("reply out of order");
          if (rep.status === ST.MALFORMED) throw new Error("the cartridge didn't understand the request");
          this.error = null;
          return rep;
        } catch (e) {
          lastErr = e;
        }
      }
      this.error = errText(lastErr);
      this.emit();
      throw lastErr;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  private async ok(m: Msg) {
    const rep = await this.call(m);
    if (rep.status === ST.REFUSED) throw new Error(new TextDecoder().decode(rep.body));
    return rep.body;
  }

  async refresh() {
    const body = await this.ok(msg.status(this.clock()));
    const prev = this.st;
    this.st = parseStatus(body);
    // a pairing this phone asked for has ended: the code is gone and the cartridge says how
    if (this.pairWaiters.length && !this.st.pairingCode && this.st.pairEnd !== "none") {
      const ok = this.st.pairEnd === "accepted";
      if (!ok) this.lastPairingEnd = this.st.pairEnd === "lapsed" ? "lapsed" : "refused";
      for (const w of this.pairWaiters.splice(0)) w(ok);
    }
    // the Game Boy switched networks itself: the app follows
    if (this.shownNetwork !== null && this.st.evmNetwork !== this.shownNetwork) this.onNetwork?.(this.st.evmNetwork);
    this.shownNetwork = this.st.evmNetwork;
    if (!prev || hexOf(body) !== this.lastStatusHex) this.emit();
    this.lastStatusHex = hexOf(body);
  }
  private lastStatusHex = "";

  async requestPairing(name = "PHONE"): Promise<boolean> {
    await this.ok(msg.pair(name));
    const done = new Promise<boolean>((resolve) => this.pairWaiters.push(resolve));
    await this.refresh();
    return done;
  }

  unpair() {
    void this.ok(msg.unpair()).then(() => this.refresh());
  }

  setEvmNetwork(id: number) {
    this.shownNetwork = id;
    void this.ok(msg.network(id)).then(() => this.refresh());
  }

  setBalance(chain: Chain, units: bigint | null) {
    void this.ok(msg.balance(chain, units)).catch(() => {});
  }

  setTxStatus(id: number, state: TxState, detail: { hash?: string; reason?: FailReason } = {}) {
    void this.ok(msg.txStatus(id, state, detail.hash, detail.reason)).catch(() => {});
  }

  async requestSignature(req: SignRequest): Promise<{ id: number; result: Promise<SignResult> }> {
    const msgs = signMessages(req);
    let body: Uint8Array = new Uint8Array();
    for (const m of msgs) body = await this.ok(m);
    const id = new R(body).u32();
    void this.refresh().catch(() => {});
    return { id, result: this.waitResult(id) };
  }

  private async waitResult(id: number): Promise<SignResult> {
    for (;;) {
      const body = await this.ok(msg.result(id)).catch(() => null);
      if (body && body[0] !== RESULT_KIND.WAIT) return this.readResult(body);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  private async readResult(body: Uint8Array): Promise<SignResult> {
    const r = new R(body);
    const kind = r.u8();
    void this.refresh().catch(() => {});
    if (kind === RESULT_KIND.REFUSED) {
      const reason = r.str() ?? "error";
      return { approved: false, reason: (REFUSALS as readonly string[]).includes(reason) ? (reason as (typeof REFUSALS)[number]) : "error" };
    }
    if (kind === RESULT_KIND.SWAP) return { approved: true, chain: "swap", signature: r.str() ?? "", digest: r.str() ?? "" };
    const len = r.u16();
    const out = new Uint8Array(len);
    for (let o = 0; o < len; o += CHUNK) out.set((await this.ok(msg.get(o))).subarray(0, Math.min(CHUNK, len - o)), o);
    if (kind === RESULT_KIND.SOL) return { approved: true, chain: "sol", signed: Transaction.from(out) };
    return { approved: true, chain: "evm", signed: toHex(out) };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

// ---------------------------------------------------------------- helpers

function evmFromWire(bytes: Uint8Array): TransactionSerializableEIP1559 {
  try {
    return parseTransaction(toHex(bytes)) as TransactionSerializableEIP1559;
  } catch {
    throw new Error("that isn't an EIP-1559 transaction");
  }
}

export function hexBytes(h: string): Uint8Array {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  return Uint8Array.from(s.match(/../g) ?? [], (x) => parseInt(x, 16));
}

export function hexOf(b: Uint8Array) {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function toChecksum(b: Uint8Array) {
  return getAddress(toHex(b));
}

function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
