// Records reference sessions of the browser chip (src/chip/chip.ts) for the cartridge firmware's differential test.
// Every Game Boy command (request bytes, reply status and bytes, and the chip's half of the mailbox afterwards),
// every phone-side call and its outcome, every random draw and every clock value are written to JSON. The Rust core
// (firmware/rp2350/core) replays the same inputs with the same random bytes and must produce identical output.
// usage: pnpm exec tsx scripts/chip-vectors.ts [out-dir]
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { serializeTransaction, type TransactionSerializableEIP1559 } from "viem";
import { CartChip, type Persisted, type SignRequest, type SignResult, type SwapIntent } from "../src/chip/chip";
import { CMD, MAILBOX, MB } from "../src/chip/protocol";
import { walletFromMnemonic } from "../src/chip/keys";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const outDir = process.argv[2] ?? "../firmware/rp2350/core/tests/vectors";
mkdirSync(outDir, { recursive: true });
process.env.TZ = "UTC";

type Op = Record<string, unknown>;
let ops: Op[] = [];

// ---- deterministic randomness: SHA-256 counter stream, every draw logged ----
let rngCounter = 0;
let rngSeed = "";
function nextBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  let o = 0;
  while (o < n) {
    const block = createHash("sha256").update(`${rngSeed}:${rngCounter++}`).digest();
    const k = Math.min(block.length, n - o);
    out.set(block.subarray(0, k), o);
    o += k;
  }
  return out;
}
Object.defineProperty(globalThis.crypto, "getRandomValues", {
  configurable: true,
  value: <T extends ArrayBufferView | null>(arr: T): T => {
    if (!arr) return arr;
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const r = nextBytes(bytes.length);
    bytes.set(r);
    ops.push({ op: "rng", hex: hexs(r) });
    return arr;
  },
});

// ---- controllable clock ----
let now = Date.UTC(2026, 9, 15, 9, 30, 0);
Date.now = () => now;
// the chip's own timers (the 60 s pairing lapse) run on this clock too
let timers: { at: number; fn: () => void }[] = [];
(globalThis as { setTimeout: unknown }).setTimeout = (fn: () => void, ms = 0) => {
  timers.push({ at: now + ms, fn });
  return 0;
};
function advance(ms: number) {
  now += ms;
  ops.push({ op: "clock", now });
  const due = timers.filter((t) => t.at <= now);
  timers = timers.filter((t) => t.at > now);
  for (const t of due) t.fn();
}

const hexs = (b: Uint8Array) => Buffer.from(b).toString("hex");

// ---- the Game Boy side: a plain 256-byte mailbox ----
const mem = new Uint8Array(256);
const bus = {
  read: (a: number) => mem[a - MAILBOX],
  write: (a: number, v: number) => {
    mem[a - MAILBOX] = v & 0xff;
  },
};
let seq = 0;
let saved: Persisted | null = null;
let chip: CartChip;

function newChip() {
  chip = new CartChip({
    load: () => (saved ? structuredClone(saved) : null),
    save: (p) => (saved = structuredClone(p)),
    clear: () => (saved = null),
  });
}

const flush = () => new Promise((r) => setImmediate(r));

/** One Game Boy command: write the request (sequence number last), tick until the reply carries it. */
async function gb(cmdName: keyof typeof CMD, arg = 0, data: Uint8Array | number[] | string = []) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : Uint8Array.from(data);
  seq = (seq % 255) + 1;
  mem[MB.CMD] = CMD[cmdName];
  mem[MB.ARG] = arg;
  mem[MB.REQ_LEN] = bytes.length;
  mem.set(bytes, MB.REQ);
  mem[MB.REQ_SEQ] = seq;
  for (let i = 0; i < 50 && mem[MB.RESP_SEQ] !== seq; i++) {
    chip.tick(bus);
    await flush();
  }
  if (mem[MB.RESP_SEQ] !== seq) throw new Error(`no reply to ${cmdName}`);
  chip.tick(bus); // status bytes (pending/paired) as the next frame sees them
  ops.push({
    op: "gb",
    cmd: CMD[cmdName],
    name: cmdName,
    seq,
    arg,
    data: hexs(bytes),
    status: mem[MB.STATUS],
    resp: hexs(mem.subarray(MB.RESP, MB.RESP + mem[MB.RESP_LEN])),
    chipHalf: hexs(mem.subarray(MB.RESP_SEQ, 256)),
  });
  return { status: mem[MB.STATUS], resp: mem.slice(MB.RESP, MB.RESP + mem[MB.RESP_LEN]) };
}

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---- the phone side ----
let pairingResult: Promise<boolean> | null = null;
async function phonePairAsync(name: string) {
  // requestPairing rejects (async) when refused up front; record that as a refusal
  const p = chip.requestPairing(name);
  let refused: string | null = null;
  await Promise.race([p.catch((e) => (refused = errText(e))), flush()]);
  if (refused) ops.push({ op: "pair", name, ok: false, error: refused });
  else {
    pairingResult = p;
    ops.push({ op: "pair", name, ok: true, code: chip.pairingCode });
  }
}

const results = new Map<number, SignResult>();
function phoneSign(label: string, req: SignRequest) {
  const wire = wireRequest(req); // throws only for input the phone's own library won't encode
  try {
    const { id, result } = chip.requestSignature(req);
    result.then((r) => results.set(id, r));
    ops.push({ op: "sign", label, ...wire, ok: true, id });
    return id;
  } catch (e) {
    ops.push({ op: "sign", label, ...wire, ok: false, error: errText(e) });
    return -1;
  }
}
async function phoneResult(id: number) {
  await flush();
  const r = results.get(id);
  const rec: Op = { op: "result", id };
  if (!r) rec.pending = true;
  else if (!r.approved) Object.assign(rec, { approved: false, reason: r.reason });
  else if (r.chain === "sol") Object.assign(rec, { approved: true, chain: "sol", signed: hexs(r.signed.serialize()) });
  else if (r.chain === "evm") Object.assign(rec, { approved: true, chain: "evm", signed: r.signed.slice(2) });
  else Object.assign(rec, { approved: true, chain: "swap", signature: r.signature, digest: r.digest });
  ops.push(rec);
}

/** The bytes the phone would send over Bluetooth for each kind of request. */
function wireRequest(req: SignRequest): Op {
  if (req.chain === "sol") return { chain: "sol", message: hexs(req.tx.serializeMessage()) };
  if (req.chain === "evm") return { chain: "evm", tx: serializeTransaction({ ...req.tx, type: "eip1559" }).slice(2) };
  const s = req.swap;
  return {
    chain: "swap",
    swap: {
      src: s.src.chain === "sol" ? 0 : s.src.net,
      dst: s.dst.chain === "sol" ? 0 : s.dst.net,
      sellToken: s.sellToken,
      sellAmount: s.sellAmount.toString(),
      buyToken: s.buyToken,
      minReceive: s.minReceive.toString(),
      deadline: s.deadline,
    },
  };
}

function phone(op: string, fn: () => void, extra: Op = {}) {
  fn();
  ops.push({ op, ...extra });
}

// ---- requests used by the sessions ----
const DEST_SOL = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
function solTransfer(from: PublicKey, lamports: number, opts: { payer?: PublicKey; extra?: boolean; to?: PublicKey } = {}) {
  const tx = new Transaction({ feePayer: opts.payer ?? from, recentBlockhash: "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi" });
  tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: opts.to ?? DEST_SOL, lamports }));
  if (opts.extra) tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: DEST_SOL, lamports: 1 }));
  return tx;
}
const sepolia = (over: Partial<TransactionSerializableEIP1559> = {}): TransactionSerializableEIP1559 => ({
  chainId: 11155111,
  to: "0x000000000000000000000000000000000000dEaD",
  value: 1_250_000_000_000_000n,
  nonce: 3,
  gas: 21000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 1_500_000_000n,
  type: "eip1559",
  ...over,
});

function save(name: string, about: string) {
  writeFileSync(`${outDir}/${name}.json`, JSON.stringify({ about, seed: rngSeed, start: startNow, ops }, null, 1) + "\n");
  console.log(`${name}: ${ops.length} ops`);
}
let startNow = 0;
function begin(seed: string) {
  ops = [];
  rngSeed = seed;
  rngCounter = 0;
  now = Date.UTC(2026, 9, 15, 9, 30, 0);
  startNow = now;
  saved = null;
  mem.fill(0);
  seq = 0;
  results.clear();
  timers = [];
  newChip();
}

// =============================== session 1: create, pair, sign everything ===============================
begin("session-create");
await gb("PING");
await gb("ENTROPY", 0, [0x12, 0x34, 0x56, 0x78, 0x9a]);
await gb("ENTROPY", 0, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
await gb("ACCOUNT", 0);
await gb("SET_PIN", 0, [1, 2, 3, 4]); // no wallet yet: refused
const created = await gb("CREATE");
void text(created.resp);
// in RAM only, not stored: a second CREATE is allowed and makes new words
const mnemonic2 = text((await gb("CREATE")).resp);
await gb("SET_PIN", 0, [1, 2, 3, 10]); // digit out of range
await gb("SET_PIN", 0, [1, 2, 3]); // too short
await gb("SET_PIN", 0, [4, 7, 1, 9]);
await gb("CREATE"); // stored now: never overwritten
await gb("WORDS", 0, "ab"); // only before a wallet exists
await gb("PING");
await gb("ACCOUNT", 0);
await gb("ACCOUNT", 1);
await gb("QR", 0);
await gb("QR", 1);
await gb("TXSTATUS");
await gb("PENDING"); // nothing pending
await gb("SIGN", 1); // nothing to sign
await gb("NETWORK", 3); // bad arg
await gb("NETWORK", 1);
await gb("ACCOUNT", 1);
await gb("NETWORK", 2);
await gb("NETWORK", 2);
await gb("ACCOUNT", 1);
await gb("NETWORK", 1);
await gb("ACCOUNT", 1);

const me = walletFromMnemonic(mnemonic2);
const myEvm = me.evm.address;

// phone: unpaired, so balances are ignored and requests refused
phone("balance", () => chip.setBalance("sol", 2_480_000_000n), { chain: "sol", units: "2480000000" });
await gb("ACCOUNT", 0);
phoneSign("unpaired", { chain: "sol", tx: solTransfer(me.sol.publicKey, 1000) });
await gb("PHONE", 0); // nobody paired
await phonePairAsync("Pixel 9"); // the window is open on the home screen? no: refused until the GB opens it
await gb("PHONE", 2); // open the pairing window
await phonePairAsync("Pixel 9 Pro!");
await phonePairAsync("Second phone"); // one pairing at a time
await gb("PAIR", 0);
await gb("PAIR", 1, "000000"); // wrong digits
await gb("PAIR", 3); // bad arg
await gb("PAIR", 1, chip.pairingCode ?? "");
await gb("PHONE", 0);
await gb("PAIR", 0); // nothing waits now

phone("balance", () => chip.setBalance("sol", 2_480_000_000n), { chain: "sol", units: "2480000000" });
phone("balance", () => chip.setBalance("evm", 420_000_000_000_000_000n), { chain: "evm", units: "420000000000000000" });
await gb("ACCOUNT", 0);
await gb("ACCOUNT", 1);
phone("balance", () => chip.setBalance("sol", 123_456_789_012_345_678n), { chain: "sol", units: "123456789012345678" });
await gb("ACCOUNT", 0);
phone("balance", () => chip.setBalance("sol", 5n), { chain: "sol", units: "5" });
await gb("ACCOUNT", 0);
phone("balance", () => chip.setBalance("sol", null), { chain: "sol", units: null });
await gb("ACCOUNT", 0);

// Solana: refusals, then a real transfer
phoneSign("sol: someone else pays", { chain: "sol", tx: solTransfer(me.sol.publicKey, 1000, { payer: DEST_SOL }) });
phoneSign("sol: two instructions", { chain: "sol", tx: solTransfer(me.sol.publicKey, 1000, { extra: true }) });
phoneSign("sol: not from me", { chain: "sol", tx: solTransfer(DEST_SOL, 1000, { payer: me.sol.publicKey }) });
phoneSign("sol: too many digits", { chain: "sol", tx: solTransfer(me.sol.publicKey, 123_456_789_123_456_789) });
const solId = phoneSign("sol: transfer", { chain: "sol", tx: solTransfer(me.sol.publicKey, 1_234_500_000) });
phoneSign("busy", { chain: "sol", tx: solTransfer(me.sol.publicKey, 1) });
await gb("PENDING");
await gb("TXSTATUS");
await gb("SIGN", 1);
await phoneResult(solId);
await gb("TXSTATUS");
const solSigned = results.get(solId);
const solHash = solSigned && solSigned.approved && solSigned.chain === "sol" ? (await import("bs58")).default.encode(solSigned.signed.signature!) : "";
const status = (id: number, state: string, detail: Op) => {
  chip.setTxStatus(id, state as never, detail as never);
  ops.push({ op: "txstatus", id, state, ...detail });
};
status(solId, "CONFIRMED", { hash: "1111111111111111111111111111111111111111111111111111111111111111" });
await gb("TXSTATUS");
status(solId, "BOGUS", {});
status(solId, "FAILED", { reason: "SEND_MORE" });
status(solId, "FAILED", { reason: "NO_FUNDS" });
await gb("TXSTATUS");
status(solId, "BROADCAST", { hash: solHash });
await gb("TXSTATUS");
status(solId, "FAILED", { reason: "NETWORK" }); // already out: refused
status(solId, "CONFIRMED", { hash: solHash.toLowerCase() === solHash ? solHash : solHash });
await gb("TXSTATUS");
status(solId + 5, "CONFIRMED", { hash: solHash });

// EVM: refusals, then sends on two networks
const evmBad: [string, Partial<TransactionSerializableEIP1559>][] = [
  ["evm: unknown chain", { chainId: 1 }],
  ["evm: data", { data: "0xa9059cbb" }],
  ["evm: gas too low", { gas: 20999n }],
  ["evm: gas too high", { gas: 600_001n }],
  ["evm: fee above 0.01", { gas: 600_000n, maxFeePerGas: 20_000_000_000n }],
  ["evm: access list", { accessList: [{ address: "0x000000000000000000000000000000000000dEaD", storageKeys: [] }] }],
  ["evm: value too long", { value: 123_456_789_123_456_789_123n }],
];
for (const [label, over] of evmBad) phoneSign(label, { chain: "evm", tx: sepolia(over) });
const ethId = phoneSign("evm: sepolia", { chain: "evm", tx: sepolia() });
await gb("PENDING");
await gb("SIGN", 1);
await phoneResult(ethId);
await gb("TXSTATUS");
const ethR = results.get(ethId);
if (ethR?.approved && ethR.chain === "evm") {
  const { keccak256 } = await import("viem");
  const h = keccak256(ethR.signed);
  status(ethId, "CONFIRMED", { hash: h.toUpperCase().replace("0X", "0x") });
  await gb("TXSTATUS");
}
phone("network", () => chip.setEvmNetwork(998), { id: 998 });
phone("network", () => chip.setEvmNetwork(5), { id: 5 }); // unknown: ignored
await gb("ACCOUNT", 1);
phone("balance", () => chip.setBalance("evm", 3_000_000_000_000_000_000n), { chain: "evm", units: "3000000000000000000" });
await gb("ACCOUNT", 1);
const hypeId = phoneSign("evm: hyperevm", { chain: "evm", tx: sepolia({ chainId: 998, nonce: 7, value: 10n ** 18n }) });
await gb("PENDING");
await gb("SIGN", 0); // rejected on the Game Boy
await phoneResult(hypeId);
await gb("TXSTATUS");
const arbId = phoneSign("evm: arbitrum, rollup gas", { chain: "evm", tx: sepolia({ chainId: 421614, gas: 250_000n, nonce: 8, maxFeePerGas: 100_000_000n, maxPriorityFeePerGas: 10_000_000n }) });
await gb("PENDING");
await gb("SIGN", 1);
await phoneResult(arbId);
const rhId = phoneSign("evm: robinhood", { chain: "evm", tx: sepolia({ chainId: 46630, nonce: 9, value: 0n }) });
await gb("PENDING");
await gb("SIGN", 1);
await phoneResult(rhId);

// swaps
const deadline = Math.floor(now / 1000) + 600;
const swaps: [string, SwapIntent][] = [
  ["swap: sol -> eth on robinhood", { src: { chain: "sol" }, dst: { chain: "evm", net: 46630 }, sellToken: "11111111111111111111111111111111", sellAmount: 250_000_000n, buyToken: "0x0000000000000000000000000000000000000000", minReceive: 31_234_567_890_123_456n, deadline }],
  ["swap: usdc -> bonk", { src: { chain: "sol" }, dst: { chain: "sol" }, sellToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", sellAmount: 12_345_678n, buyToken: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", minReceive: 98_765_432_101n, deadline }],
  ["swap: eth(robinhood) -> sol", { src: { chain: "evm", net: 46630 }, dst: { chain: "sol" }, sellToken: "0x0000000000000000000000000000000000000000", sellAmount: 5_000_000_000_000_000n, buyToken: "11111111111111111111111111111111", minReceive: 1_000_000n, deadline }],
];
const swapBad: [string, SwapIntent][] = [
  ["swap: unknown token", { ...swaps[0][1], buyToken: "0x1234567890123456789012345678901234567890" }],
  ["swap: same token", { ...swaps[1][1], buyToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }],
  ["swap: expired", { ...swaps[0][1], deadline: Math.floor(now / 1000) - 1 }],
  ["swap: too far out", { ...swaps[0][1], deadline: Math.floor(now / 1000) + 4000 }],
  ["swap: zero amount", { ...swaps[0][1], sellAmount: 0n }],
  ["swap: unknown network", { ...swaps[0][1], dst: { chain: "evm", net: 1 } }],
];
for (const [label, s] of swapBad) phoneSign(label, { chain: "swap", swap: s });
for (const [label, s] of swaps) {
  const id = phoneSign(label, { chain: "swap", swap: s });
  await gb("PENDING");
  await gb("SIGN", 1);
  await phoneResult(id);
  await gb("TXSTATUS");
  status(id, "CONFIRMED", { hash: "x" }); // a demo swap can't be relabelled
  await gb("TXSTATUS");
}

// a request the owner doesn't see: power is pulled, then LOCK drops one
const lostId = phoneSign("evm: lost on lock", { chain: "evm", tx: sepolia({ nonce: 30 }) });
await gb("LOCK");
await phoneResult(lostId);
await gb("PING");
await gb("ACCOUNT", 0);
await gb("PENDING");
await gb("UNLOCK", 0, [9, 9, 9, 9]);
await gb("UNLOCK", 0, [4, 7, 1, 9]);
await gb("ACCOUNT", 0); // balances were forgotten on lock
// pairing window expiry and lapse
await gb("PHONE", 2);
advance(61_000);
await phonePairAsync("Late");
await gb("PHONE", 2);
await phonePairAsync("iPhone");
await gb("PHONE", 3); // owner closes the window: the waiting pairing goes
await gb("PAIR", 0);
await gb("PHONE", 2);
await phonePairAsync("iPhone");
advance(60_001);
await gb("PAIR", 0);
// forget the phone from the Game Boy, then wipe
const fId = phoneSign("evm: then forgotten", { chain: "evm", tx: sepolia({ nonce: 40 }) });
await gb("PHONE", 1);
await phoneResult(fId);
await gb("PHONE", 0);
await gb("WIPE");
await gb("PING");
save("session-create", "create a wallet, pair a phone, sign on Solana, four EVM networks and three swaps, refusals, lock, pairing window, wipe");

// =============================== session 2: restore, words, wrong PINs ===============================
begin("session-restore");
const words = "abandon ability able about above absent absorb abstract absurd abuse access accident".split(" ");
await gb("WORDS", 0, "ab");
await gb("WORDS", 0, "abs");
await gb("WORDS", 0, "able");
await gb("WORDS", 0, "zoo");
await gb("WORDS", 0, "ZO");
await gb("WORDS", 0, "qq");
await gb("WORDS", 0, "");
const idx = (w: string) => wordlist.indexOf(w);
const enc = (list: string[]) => list.flatMap((w) => [idx(w) >> 8, idx(w) & 0xff]);
await gb("RESTORE", 0, enc(words)); // bad checksum
await gb("RESTORE", 0, enc(words).slice(0, 22)); // short
await gb("RESTORE", 0, [0x0f, 0xff, ...enc(words).slice(2)]); // index out of range
const good = "legal winner thank year wave sausage worth useful legal winner thank yellow".split(" ");
await gb("RESTORE", 0, enc(good));
await gb("ACCOUNT", 0); // restored but no PIN yet: not unlocked
await gb("SET_PIN", 0, [0, 0, 0, 0]);
await gb("ACCOUNT", 0);
await gb("ACCOUNT", 1);
await gb("QR", 0);
await gb("QR", 1);
await gb("RESTORE", 0, enc(good)); // stored: refused
await gb("LOCK");
for (let i = 0; i < 4; i++) await gb("UNLOCK", 0, [1, 1, 1, i]);
await gb("UNLOCK", 0, [0, 0, 0, 0]); // right PIN resets the counter
await gb("LOCK");
for (let i = 0; i < 5; i++) await gb("UNLOCK", 0, [9, 9, 9, i]); // the fifth wipes
await gb("PING");
await gb("UNLOCK", 0, [0, 0, 0, 0]); // no wallet
await gb("WIPE"); // locked: refused
save("session-restore", "word suggestions, restore with good and bad checksums, wrong PINs down to the wipe");

// =============================== session 3: power cycles ===============================
begin("session-power");
await gb("RESTORE", 0, enc(good));
await gb("SET_PIN", 0, [5, 5, 5, 5]);
await gb("PHONE", 2);
await phonePairAsync("Galaxy");
await gb("PAIR", 1, chip.pairingCode ?? "");
const pId = phoneSign("sol: then power is pulled", { chain: "sol", tx: solTransfer(walletFromMnemonic(good.join(" ")).sol.publicKey, 42) });
await gb("PENDING");
phone("reset", () => {
  chip.reset();
  mem.fill(0);
  seq = 0;
});
await phoneResult(pId);
await gb("PING");
await gb("PENDING");
await gb("UNLOCK", 0, [5, 5, 5, 5]);
await gb("PHONE", 0); // the pairing survived the power cycle
await gb("ACCOUNT", 0);
phone("unpair", () => chip.unpair());
await gb("PHONE", 0);
await gb("ACCOUNT", 1);
save("session-power", "power cycle drops a waiting request and RAM state; pairing persists; unpair from the phone");

console.log(`vectors written to ${outDir}`);
