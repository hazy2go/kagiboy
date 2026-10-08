import { Message, PublicKey, SystemInstruction, SystemProgram, Transaction } from "@solana/web3.js";
import { formatUnits, getAddress, keccak256, parseTransaction, serializeTransaction, type TransactionSerializableEIP1559 } from "viem";
import { sha256 } from "@noble/hashes/sha2.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import qrcode from "qrcode-generator";
import bs58 from "bs58";
import { CHIP_MAGIC, CMD, CMD_NAME, MAILBOX, MB, RESP_MAX, type Bus, type Chain } from "./protocol";
import { DEFAULT_EVM, EVM_NETWORKS, evmNetwork, type EvmNetwork } from "./networks";
import { concat, mnemonicFromIndices, newMnemonic, suggestWords, walletFromMnemonic, type Wallet } from "./keys";

/**
 * Software stand-in for the cartridge's MCU + secure element.
 *
 * It owns the keys and answers the Game Boy over the mailbox. The phone can ask
 * it to sign, but only the Game Boy's buttons can approve. The chip snapshots
 * each transaction when it's requested, decodes that snapshot for the screen,
 * and signs exactly those bytes. Every string on the Game Boy screen is written
 * by the chip; the phone only supplies numbers and fixed status codes.
 */

/** What the secure element keeps across power cycles. */
export interface Persisted {
  mnemonic: string;
  pinSalt: string;
  pinHash: string;
  triesLeft: number;
  /** a phone was approved on the Game Boy; it goes with the wallet (a wipe or a new wallet forgets it) */
  paired?: boolean;
}

export interface Storage {
  load(): Persisted | null;
  save(p: Persisted): void;
  clear(): void;
}

/** Where a swap's coins leave from or arrive: Solana, or one of the cartridge's EVM networks. */
export type SwapSide = { chain: "sol" } | { chain: "evm"; net: number };

/**
 * A cross-chain swap as the phone asks for it (quoted by SODAX). The cartridge shows exactly this
 * on the Game Boy and signs a digest of it; the recipient is always this cartridge's own address.
 */
export interface SwapIntent {
  src: SwapSide;
  dst: SwapSide;
  sellSymbol: string;
  sellDecimals: number;
  sellAmount: bigint;
  buySymbol: string;
  buyDecimals: number;
  /** the least the user accepts: the quote minus slippage, after every fee */
  minReceive: bigint;
  /** partner + solver fee, in the sell token */
  fees: bigint;
  /** unix seconds */
  deadline: number;
}

export type SignRequest =
  | { chain: "sol"; tx: Transaction }
  | { chain: "evm"; tx: TransactionSerializableEIP1559 }
  | { chain: "swap"; swap: SwapIntent };

export type SignResult =
  | { approved: true; chain: "sol"; signed: Transaction }
  | { approved: true; chain: "evm"; signed: `0x${string}` }
  /** demo: the swap is signed on the cartridge but not broadcast */
  | { approved: true; chain: "swap"; signature: string; digest: string }
  | { approved: false; reason: "rejected" | "power" | "locked" | "error" };

export type TxState = "SIGNED" | "BROADCAST" | "CONFIRMED" | "FAILED" | "UNKNOWN" | "DEMO";
const TX_STATES = new Set<string>(["SIGNED", "BROADCAST", "CONFIRMED", "FAILED", "UNKNOWN", "DEMO"]);
/** what the Game Boy says after a swap is signed in this demo build */
const SWAP_DEMO_NOTE = "SWAPS GO LIVE WITH THE CARTRIDGE";

/** Fixed texts the phone can pick from; it never sends free text to the screen. */
export const FAIL_REASON = {
  NO_FUNDS: "NOT ENOUGH FUNDS",
  EXPIRED: "TOOK TOO LONG",
  NETWORK: "NETWORK ERROR",
  REJECTED: "NETWORK REJECTED IT",
  CHECK_EXPLORER: "CHECK THE EXPLORER",
} as const;
export type FailReason = keyof typeof FAIL_REASON;

export interface BusEvent {
  t: number;
  dir: "gb>chip" | "chip>gb";
  cmd: string;
  hex: string;
}

interface Reply {
  status: number;
  data?: Uint8Array | string;
}

/** What the Game Boy shows, decoded by the chip from its own snapshot. */
interface Shown {
  to: string;
  amount: string;
  fee: string;
  network: string;
}

type Snapshot =
  | { chain: "sol"; message: Uint8Array; shown: Shown }
  | { chain: "evm"; tx: TransactionSerializableEIP1559; shown: Shown }
  | { chain: "swap"; intent: SwapIntent; digest: Uint8Array; shown: Shown };

interface Pending {
  id: number;
  snap: Snapshot;
  resolve: (r: SignResult) => void;
}

const MAX_TRIES = 5;
const PLAIN_TRANSFER_GAS = 21000n;
// rollups (Arbitrum, Robinhood Chain) count their L1 cost in gas, so a plain send can need more than 21000
const MAX_TRANSFER_GAS = 600_000n;
const MAX_EVM_FEE_WEI = 10n ** 16n; // 0.01 of the network's coin: anything above that is refused
const SOL_FEE_PER_SIGNATURE = 5000n;

const SECRET_CMDS = new Set<number>([CMD.CREATE, CMD.SET_PIN, CMD.UNLOCK, CMD.WORDS, CMD.RESTORE]);

export class CartChip {
  private wallet: Wallet | null = null;
  private persisted: Persisted | null;
  private unlocked = false;
  private pool: Uint8Array = new Uint8Array(32);
  private lastSeq = 0;
  private generation = 0; // bumped on power cycle so late async replies are dropped
  private inFlight: { seq: number; reply: Promise<Reply> } | null = null;
  private ready: { seq: number; reply: Reply } | null = null;
  private pending: Pending | null = null;
  private nextId = 1;
  private balances: Record<Chain, bigint | null> = { sol: null, evm: null };
  private txStatus: { id: number; chain: Chain | null; state: TxState | ""; detail: string; hash?: string } = { id: 0, chain: null, state: "", detail: "" };
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
    if (!this.wallet || !this.unlocked) return null;
    return { sol: this.wallet.sol.publicKey.toBase58(), evm: this.wallet.evm.address };
  }

  get hasPending() {
    return this.pending !== null;
  }

  /** The phone is allowed to send requests: it was approved on the Game Boy for this wallet. */
  get paired() {
    return !!this.persisted?.paired;
  }

  /** The 6-digit code both screens show while a pairing waits on the Game Boy. */
  get pairingCode() {
    return this.pairing?.code ?? null;
  }

  private pairing: { code: string; resolve: (ok: boolean) => void } | null = null;

  /**
   * The phone asks to pair. Both screens show the same random code and the owner accepts on the
   * Game Boy (Bluetooth numeric comparison), so a stranger's phone in range can't join quietly.
   */
  requestPairing(): Promise<boolean> {
    if (!this.persisted || !this.unlocked) return Promise.reject(new Error("unlock the cartridge first"));
    if (this.pending) return Promise.reject(new Error("a request is already waiting on the Game Boy"));
    this.pairing?.resolve(false);
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    const code = String(n).padStart(6, "0");
    return new Promise<boolean>((resolve) => {
      this.pairing = { code, resolve };
      this.emit();
    });
  }

  /** Forget the phone (from the phone app); the Game Boy asks again next time. */
  unpair() {
    const p = this.persisted;
    if (!p?.paired) return;
    delete p.paired;
    this.storage.save(p);
    this.balances = { sol: null, evm: null };
    this.emit();
  }

  private dropPairing() {
    this.pairing?.resolve(false);
    this.pairing = null;
  }

  /** Balances arrive as base units (lamports / wei); the chip formats them itself. */
  /** What the Game Boy's home screen gets for one account: address, balance, network name. */
  accountReply(chain: Chain): string {
    const a = this.addresses;
    if (!a) return "";
    const sym = chain === "sol" ? "SOL" : this.evmNet.symbol;
    const name = chain === "sol" ? "Solana" : this.evmNet.name;
    return `${a[chain]}\0${balanceText(chain, this.balances[chain], sym)}\0${name}\0`;
  }

  /** The decoded request waiting on the Game Boy, exactly as it will be drawn (read-only). */
  get pendingShown() {
    return this.pending ? { ...this.pending.snap.shown } : null;
  }

  /** The EVM network the phone is showing; the Game Boy's home screen names it and uses its coin. */
  private evmNet: EvmNetwork = DEFAULT_EVM;

  /** Told when the Game Boy switches the EVM network itself, so the phone can follow. */
  onNetwork: ((id: number) => void) | null = null;

  setEvmNetwork(id: number) {
    const net = evmNetwork(id);
    if (!net) return;
    this.evmNet = net;
    this.balances.evm = null;
    this.emit();
  }

  setBalance(chain: Chain, baseUnits: bigint | null) {
    // only a paired phone gets to put numbers on the Game Boy
    if (!this.paired) return;
    this.balances[chain] = baseUnits;
  }

  /** Status for request `id` only; updates for older requests are ignored. */
  setTxStatus(id: number, state: TxState, detail: { hash?: string; reason?: FailReason } = {}) {
    // checked at runtime, not just by types: Bluetooth input is untrusted
    const cur = this.txStatus;
    if (id !== cur.id || !cur.chain || !TX_STATES.has(state)) return;
    let text = "";
    if (detail.reason !== undefined) {
      if (!Object.hasOwn(FAIL_REASON, detail.reason)) return;
      text = FAIL_REASON[detail.reason];
    } else if (detail.hash !== undefined) {
      // the chip knows the hash of what it signed; the phone can't put any other on the screen
      if (!cur.hash || detail.hash.toLowerCase() !== cur.hash.toLowerCase()) return;
      text = `${detail.hash.slice(0, 8)}..${detail.hash.slice(-8)}`;
    }
    this.txStatus = { ...cur, state, detail: text };
    this.emit();
  }

  /**
   * Snapshots the transaction now, so later changes to the phone's object can't
   * change what gets signed. Throws if the chip can't show it on the Game Boy.
   */
  requestSignature(req: SignRequest): { id: number; result: Promise<SignResult> } {
    if (!this.wallet || !this.unlocked) throw new Error("unlock the cartridge first");
    if (!this.paired) throw new Error("pair this phone on the Game Boy first");
    if (this.pending || this.pairing) throw new Error("a request is already waiting on the Game Boy");
    const snap = snapshot(req, this.wallet);
    const id = this.nextId++;
    const result = new Promise<SignResult>((resolve) => {
      this.pending = { id, snap, resolve };
    });
    this.txStatus = { id, chain: snap.chain === "swap" ? snap.intent.src.chain : snap.chain, state: "", detail: "" };
    this.emit();
    return { id, result };
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Power cycle: RAM state goes, the secure element's storage stays. */
  reset() {
    this.generation++;
    this.unlocked = false;
    this.wallet = null;
    this.lastSeq = 0;
    this.inFlight = null;
    this.ready = null;
    this.pool = new Uint8Array(32);
    this.balances = { sol: null, evm: null };
    this.dropPending("power");
    this.dropPairing();
    this.emit();
  }

  // ---------- Game Boy-facing side: called once per emulated frame ----------

  tick(bus: Bus) {
    const w = (off: number, v: number) => bus.write(MAILBOX + off, v & 0xff);
    const r = (off: number) => bus.read(MAILBOX + off);

    w(MB.MAGIC, CHIP_MAGIC);
    w(MB.ACCEL_X, this.accel.x);
    w(MB.ACCEL_Y, this.accel.y);
    // 1: a sign request waits, 2: a phone asks to pair
    w(MB.PENDING, !this.unlocked ? 0 : this.pending ? 1 : this.pairing ? 2 : 0);
    w(MB.PAIRED, this.paired ? 1 : 0);

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

    let result: Reply | Promise<Reply>;
    try {
      result = this.handle(cmd, arg, data);
    } catch (e) {
      console.error(e);
      result = { status: 0xff };
    }
    if (result instanceof Promise) {
      const gen = this.generation;
      const reply = result.catch((e): Reply => {
        console.error(e);
        return { status: 0xff };
      });
      this.inFlight = { seq, reply };
      reply.then((rep) => {
        if (gen !== this.generation) return; // the Game Boy was power-cycled meanwhile
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
        if (this.persisted) return { status: 1 }; // never overwrite a stored seed
        const mnemonic = newMnemonic(this.pool);
        this.pool = new Uint8Array(32);
        this.wallet = walletFromMnemonic(mnemonic);
        this.balances = { sol: null, evm: null };
        return { status: 0, data: mnemonic };
      }

      case CMD.WORDS: {
        // prefix in, then: count, and per suggestion a 2-byte word index plus the word
        if (this.persisted) return { status: 1 };
        const prefix = new TextDecoder().decode(data).toLowerCase();
        const hits = prefix ? suggestWords(prefix) : [];
        const parts = hits.map((h) => concat(new Uint8Array([h.index >> 8, h.index & 0xff]), ascii(`${h.word}\0`)));
        return { status: 0, data: concat(new Uint8Array([hits.length]), ...parts) };
      }

      case CMD.RESTORE: {
        if (this.persisted || data.length !== 24) return { status: 1 };
        const indices = Array.from({ length: 12 }, (_, i) => (data[i * 2] << 8) | data[i * 2 + 1]);
        const mnemonic = mnemonicFromIndices(indices);
        if (!mnemonic) return { status: 2 }; // checksum failed: a word is wrong
        this.wallet = walletFromMnemonic(mnemonic);
        this.balances = { sol: null, evm: null };
        return { status: 0 };
      }

      case CMD.SET_PIN: {
        // only during setup; changing an existing PIN would need the old one
        if (this.persisted || !this.wallet || data.length !== 4) return { status: 1 };
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
        if (!p) return { status: 3 }; // no wallet
        // spend the try before checking, like a secure element: pulling power mid-check can't save a guess
        p.triesLeft -= 1;
        this.storage.save(p);
        if (pinHash(p.pinSalt, data) === p.pinHash) {
          p.triesLeft = MAX_TRIES;
          this.storage.save(p);
          this.wallet = walletFromMnemonic(p.mnemonic);
          this.unlocked = true;
          return { status: 0 };
        }
        if (p.triesLeft <= 0) {
          this.wipe();
          return { status: 2 };
        }
        return { status: 1, data: new Uint8Array([p.triesLeft]) };
      }

      case CMD.PAIR: {
        // arg 0: the code to show, 1: the owner accepted, 2: turned away
        const pr = this.pairing;
        if (!this.unlocked || !pr || !this.persisted) return { status: 1 };
        if (arg === 0) return { status: 0, data: `${pr.code}\0` };
        if (arg !== 1 && arg !== 2) return { status: 1 };
        this.pairing = null;
        if (arg === 1) {
          this.persisted.paired = true;
          this.storage.save(this.persisted);
        }
        pr.resolve(arg === 1);
        this.emit();
        return { status: 0 };
      }

      case CMD.NETWORK: {
        // LEFT/RIGHT on the home screen: the Game Boy picks which EVM network its second card shows
        if (!this.unlocked || (arg !== 1 && arg !== 2)) return { status: 1 };
        const i = EVM_NETWORKS.findIndex((n) => n.id === this.evmNet.id);
        const n = EVM_NETWORKS.length;
        const next = EVM_NETWORKS[(i + (arg === 1 ? 1 : n - 1)) % n];
        this.setEvmNetwork(next.id);
        this.onNetwork?.(next.id);
        return { status: 0 };
      }

      case CMD.ACCOUNT: {
        const a = this.addresses;
        if (!a) return { status: 1 };
        const chain: Chain = arg === 0 ? "sol" : "evm";
        return { status: 0, data: this.accountReply(chain) };
      }

      case CMD.PENDING: {
        if (!this.unlocked || !this.pending) return { status: 1 };
        const { snap } = this.pending;
        const { to, amount, fee, network } = snap.shown;
        return {
          status: 0,
          data: concat(new Uint8Array([snap.chain === "sol" ? 0 : 1]), ascii(`${to}\0${amount}\0${fee}\0${network}\0`)),
        };
      }

      case CMD.SIGN: {
        const p = this.pending;
        if (!this.unlocked || !this.wallet || !p) return { status: 1 };
        this.pending = null;
        if (arg !== 1) {
          p.resolve({ approved: false, reason: "rejected" });
          this.emit();
          return { status: 0 };
        }
        return this.sign(this.wallet, p);
      }

      case CMD.QR: {
        const a = this.addresses;
        if (!a) return { status: 1 };
        return { status: 0, data: qrBits(a[arg === 0 ? "sol" : "evm"]) };
      }

      case CMD.TXSTATUS:
        return { status: 0, data: `${this.txStatus.state}\0${this.txStatus.detail}\0` };

      case CMD.LOCK:
        this.unlocked = false;
        this.wallet = null;
        this.balances = { sol: null, evm: null };
        this.dropPending("locked");
        this.dropPairing();
        return { status: 0 };

      case CMD.WIPE:
        this.wipe();
        return { status: 0 };

      default:
        return { status: 0xff };
    }
  }

  /** Signs the snapshot taken at request time, never the phone's live object. */
  private async sign(wallet: Wallet, p: Pending): Promise<Reply> {
    let hash = "";
    try {
      if (p.snap.chain === "sol") {
        const tx = Transaction.populate(Message.from(p.snap.message));
        tx.partialSign(wallet.sol);
        if (!bytesEqual(tx.serializeMessage(), p.snap.message)) throw new Error("message changed while signing");
        hash = bs58.encode(tx.signature!);
        p.resolve({ approved: true, chain: "sol", signed: tx });
      } else if (p.snap.chain === "evm") {
        const signed = await wallet.evm.signTransaction(p.snap.tx);
        hash = keccak256(signed);
        p.resolve({ approved: true, chain: "evm", signed });
      } else {
        // signed with the key of the chain the coins leave from, over the exact intent shown
        const d = p.snap.digest;
        const signature =
          p.snap.intent.src.chain === "sol"
            ? bs58.encode(ed25519.sign(d, wallet.sol.secretKey.slice(0, 32)))
            : await wallet.evm.signMessage({ message: { raw: d } });
        p.resolve({ approved: true, chain: "swap", signature, digest: Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("") });
        // demo build: nothing is broadcast, and the Game Boy says so instead of waiting for a network
        this.txStatus = { id: p.id, chain: p.snap.intent.src.chain, state: "DEMO", detail: SWAP_DEMO_NOTE };
        this.emit();
        return { status: 0 };
      }
    } catch (e) {
      console.error(e);
      p.resolve({ approved: false, reason: "error" });
      return { status: 1 };
    }
    this.txStatus = { id: p.id, chain: p.snap.chain, state: "SIGNED", detail: "", hash };
    this.emit();
    return { status: 0 };
  }

  private dropPending(reason: "power" | "locked") {
    this.pending?.resolve({ approved: false, reason });
    this.pending = null;
  }

  private wipe() {
    this.storage.clear();
    this.persisted = null;
    this.wallet = null;
    this.unlocked = false;
    this.balances = { sol: null, evm: null };
    this.dropPending("locked");
    this.dropPairing();
  }

  private record(dir: BusEvent["dir"], cmd: number, bytes: Uint8Array) {
    // PINs, recovery words and typed word prefixes stay off the monitor
    const secret = SECRET_CMDS.has(cmd);
    this.log.push({
      t: Date.now(),
      dir,
      cmd: CMD_NAME[cmd] ?? `0x${cmd.toString(16)}`,
      hex: secret ? "** hidden: PIN / recovery words stay on the Game Boy **" : hex(bytes.slice(0, 24)) + (bytes.length > 24 ? " .." : ""),
    });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

/**
 * Freezes the request into bytes the chip owns, then decodes those bytes.
 * Anything the Game Boy can't show faithfully is refused (no blind signing).
 */
function snapshot(req: SignRequest, wallet: Wallet): Snapshot {
  const snap = decodeRequest(req, wallet);
  // room on the Game Boy sign screen: amount 2×18, fee 16, network 16, address 3×16
  const s = snap.shown;
  if (s.amount.length > 36 || s.fee.length > 16 || s.network.length > 16 || s.to.length > 48) {
    throw new Error("this transaction can't be shown in full on the Game Boy");
  }
  return snap;
}

function decodeRequest(req: SignRequest, wallet: Wallet): Snapshot {
  if (req.chain === "swap") return decodeSwap(req.swap, wallet);
  if (req.chain === "sol") {
    const message = new Uint8Array(req.tx.serializeMessage());
    const tx = Transaction.populate(Message.from(message));
    const me = wallet.sol.publicKey;
    if (!tx.feePayer?.equals(me)) throw new Error("the fee payer must be this cartridge's wallet");
    const ixs = tx.instructions;
    if (ixs.length !== 1 || !ixs[0].programId.equals(SystemProgram.programId)) {
      throw new Error("only plain SOL transfers can be shown on the Game Boy yet");
    }
    if (SystemInstruction.decodeInstructionType(ixs[0]) !== "Transfer") throw new Error("only plain SOL transfers are supported");
    const { fromPubkey, toPubkey, lamports } = SystemInstruction.decodeTransfer(ixs[0]);
    if (!fromPubkey.equals(me)) throw new Error("the transfer must come from this cartridge's wallet");
    const signers = Message.from(message).header.numRequiredSignatures;
    return {
      chain: "sol",
      message,
      shown: {
        to: new PublicKey(toPubkey).toBase58(),
        amount: `${exact(BigInt(lamports), 9)} SOL`,
        fee: `${exact(SOL_FEE_PER_SIGNATURE * BigInt(signers), 9)} SOL`,
        // a Solana transaction doesn't name its cluster; the cartridge firmware is built per network
        network: "SOLANA",
      },
    };
  }

  // round-trip through the wire format so later edits to the phone's object can't leak in
  const tx = parseTransaction(serializeTransaction({ ...req.tx, type: "eip1559" })) as TransactionSerializableEIP1559;
  const net = evmNetwork(tx.chainId);
  if (!net) throw new Error("this cartridge doesn't sign on that network");
  if (!tx.to) throw new Error("contract deployment is not supported");
  if (tx.data && tx.data !== "0x") throw new Error("only plain transfers can be shown on the Game Boy yet");
  if (tx.accessList?.length) throw new Error("access lists are not supported");
  const gas = tx.gas ?? 0n;
  if (gas < PLAIN_TRANSFER_GAS || gas > MAX_TRANSFER_GAS) throw new Error("that gas limit doesn't fit a plain transfer");
  const maxFee = gas * (tx.maxFeePerGas ?? 0n);
  if (maxFee > MAX_EVM_FEE_WEI) throw new Error(`the fee is above the cartridge's 0.01 ${net.symbol} limit`);
  return {
    chain: "evm",
    tx,
    shown: {
      to: getAddress(tx.to), // checksummed, so the mixed case can be compared with the phone
      amount: `${exact(tx.value ?? 0n, 18)} ${net.symbol}`,
      // the fee line holds 16 characters: longer coin names get fewer decimals, still rounded up
      fee: `MAX ${ceilDecimals(maxFee, 18, Math.min(6, 9 - net.symbol.length))} ${net.symbol}`,
      network: net.label,
    },
  };
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

/** Exact decimal amount: nothing rounded away, trailing zeros trimmed. */
export function exact(units: bigint, decimals: number) {
  return formatUnits(units, decimals);
}

const SWAP_SYMBOL = /^[A-Za-z0-9.]{1,8}$/;

function sideName(side: SwapSide): string {
  if (side.chain === "sol") return "SOLANA";
  const net = evmNetwork(side.net);
  if (!net) throw new Error("this cartridge doesn't swap on that network");
  return net.name.toUpperCase();
}

/** Checks a swap field by field (the phone is untrusted) and lays it out for the sign screen. */
function decodeSwap(input: SwapIntent, wallet: Wallet): Snapshot {
  const i: SwapIntent = structuredClone(input);
  if (!SWAP_SYMBOL.test(i.sellSymbol) || !SWAP_SYMBOL.test(i.buySymbol)) throw new Error("unknown token symbol");
  for (const d of [i.sellDecimals, i.buyDecimals]) if (!Number.isInteger(d) || d < 0 || d > 36) throw new Error("bad decimals");
  if (i.sellAmount <= 0n || i.minReceive <= 0n || i.fees < 0n || i.fees >= i.sellAmount) throw new Error("bad amounts");
  const now = Date.now() / 1000;
  if (!(i.deadline > now && i.deadline < now + 3600)) throw new Error("the quote has expired");
  const from = sideName(i.src);
  const to = sideName(i.dst);
  const sym = i.sellSymbol.toUpperCase();
  const buy = i.buySymbol.toUpperCase();
  // three 16-column rows in the address box: the promise, the amount, where it lands
  const line = (t: string) => t.padEnd(16, " ");
  const min = fitFloor(i.minReceive, i.buyDecimals, 16 - buy.length - 1);
  const fee = fitCeil(i.fees, i.sellDecimals, 16 - sym.length - 1);
  // the coins arrive at this cartridge's own address on the destination chain
  const recipient = i.dst.chain === "sol" ? wallet.sol.publicKey.toBase58() : wallet.evm.address;
  const canonical = [
    "kagiboy-swap-v1",
    i.src.chain === "sol" ? "sol" : `evm:${i.src.net}`,
    i.dst.chain === "sol" ? "sol" : `evm:${i.dst.net}`,
    sym, i.sellDecimals, i.sellAmount, buy, i.buyDecimals, i.minReceive, i.fees, i.deadline, recipient,
  ].join("|");
  return {
    chain: "swap",
    intent: i,
    digest: sha256(ascii(canonical)),
    shown: {
      network: `SWAP ${from}`,
      amount: `${exact(i.sellAmount, i.sellDecimals)} ${sym}`,
      fee: `${fee} ${sym}`,
      to: line("GET AT LEAST") + line(`${min} ${buy}`) + line(`ON ${to}`),
    },
  };
}

/** The most decimals that fit `width` characters, rounded down (a minimum must never be overstated). */
function fitFloor(units: bigint, decimals: number, width: number) {
  for (let places = Math.min(decimals, 8); places >= 0; places--) {
    const step = 10n ** BigInt(decimals - places);
    const t = formatUnits((units / step) * step, decimals);
    if (t.length <= width) return t;
  }
  throw new Error("this amount can't be shown on the Game Boy");
}

/** The most decimals that fit `width` characters, rounded up (a fee must never be understated). */
function fitCeil(units: bigint, decimals: number, width: number) {
  for (let places = Math.min(decimals, 8); places >= 0; places--) {
    const t = ceilDecimals(units, decimals, places);
    if (t.length <= width) return t;
  }
  throw new Error("this fee can't be shown on the Game Boy");
}

/** Rounded up to `places` decimals, for a fee ceiling. */
function ceilDecimals(units: bigint, decimals: number, places: number) {
  const step = 10n ** BigInt(decimals - places);
  return formatUnits(((units + step - 1n) / step) * step, decimals);
}

/** Home-screen balance, at most 18 characters. */
function balanceText(chain: Chain, units: bigint | null, sym: string) {
  if (units === null) return `-- ${sym}`;
  const [whole, frac = ""] = formatUnits(units, chain === "sol" ? 9 : 18).split(".");
  const text = `${whole}.${frac.padEnd(4, "0").slice(0, 4)} ${sym}`;
  return text.length <= 18 ? text : `>999999999 ${sym}`;
}

function bytesEqual(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** A stored wallet with a known PIN, for the landing page's attract mode (testnet only). */
export function demoPersisted(mnemonic: string, pin: number[]): Persisted {
  const pinSalt = "demo";
  return { mnemonic, pinSalt, pinHash: pinHash(pinSalt, Uint8Array.from(pin)), triesLeft: 5, paired: true };
}

function pinHash(salt: string, pin: Uint8Array) {
  return hex(sha256(concat(ascii(salt), pin)));
}

function ascii(s: string) {
  return Uint8Array.from(s, (c) => {
    const code = c.charCodeAt(0);
    return code >= 32 && code < 127 ? code : code === 0 ? 0 : 63;
  });
}

export function hex(b: Uint8Array) {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
}
