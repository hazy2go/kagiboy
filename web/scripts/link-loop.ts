// The phone link end to end in one process: the app's RemoteChip talks to a CartChip behind ChipServer over a fake
// Bluetooth link that loses messages and replies, while a scripted Game Boy approves on the mailbox. Checks that the
// app sees what it would see with the chip in the browser: pairing (accepted, refused, lapsed), signatures that
// verify (Solana, EVM, swap), refusals with the chip's text, the Game Boy switching networks, unpairing.
// usage: pnpm link-loop
import { strict as assert } from "node:assert";
import { ed25519 } from "@noble/curves/ed25519.js";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { recoverTransactionAddress } from "viem";
import { CartChip, type Persisted } from "../src/chip/chip";
import { CMD, MAILBOX, MB } from "../src/chip/protocol";
import { ChipServer, RemoteChip } from "../src/chip/link";

let saved: Persisted | null = null;
const chip = new CartChip({
  load: () => (saved ? structuredClone(saved) : null),
  save: (p) => (saved = structuredClone(p)),
  clear: () => (saved = null),
});
const server = new ChipServer(chip);

// the Bluetooth link: about one message in six is lost on the way in, one reply in six on the way back
let n = 0;
let lostIn = 0;
let lostOut = 0;
const link = {
  async exchange(req: Uint8Array) {
    await new Promise((r) => setTimeout(r, 2));
    if (++n % 6 === 0) {
      lostIn++;
      throw new Error("lost");
    }
    const rep = await server.handle(req);
    if (n % 7 === 0) {
      lostOut++;
      throw new Error("reply lost");
    }
    return rep;
  },
};

// the Game Boy: a plain mailbox, ticked like frames
const mem = new Uint8Array(256);
const bus = { read: (a: number) => mem[a - MAILBOX], write: (a: number, v: number) => void (mem[a - MAILBOX] = v & 0xff) };
let seq = 0;
setInterval(() => chip.tick(bus), 16);
async function gb(name: keyof typeof CMD, arg = 0, data: number[] | string = []) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : Uint8Array.from(data);
  seq = (seq % 255) + 1;
  mem[MB.CMD] = CMD[name];
  mem[MB.ARG] = arg;
  mem[MB.REQ_LEN] = bytes.length;
  mem.set(bytes, MB.REQ);
  mem[MB.REQ_SEQ] = seq;
  for (let i = 0; i < 100 && mem[MB.RESP_SEQ] !== seq; i++) await sleep(16);
  assert.equal(mem[MB.RESP_SEQ], seq, `${name} answered`);
  return { status: mem[MB.STATUS], resp: mem.slice(MB.RESP, MB.RESP + mem[MB.RESP_LEN]) };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(what: string, f: () => boolean, ms = 3000) {
  for (let t = 0; t < ms; t += 20) {
    if (f()) return;
    await sleep(20);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const phone = new RemoteChip(link);
await phone.start();
assert.equal(phone.state, "none");

await gb("CREATE");
await gb("SET_PIN", 0, [4, 7, 1, 9]);
await until("unlocked", () => phone.state === "unlocked");
assert.deepEqual(phone.addresses, chip.addresses, "addresses over the link");
console.log("addresses:", phone.addresses?.sol, phone.addresses?.evm);

// pairing: refused up front, refused on the Game Boy, lapsed, accepted
await assert.rejects(phone.requestPairing("Pixel"), /Pair your phone/);
await gb("PHONE", 2);
await until("window open", () => phone.pairWindowOpen);
let p = phone.requestPairing("Pixel 9");
await until("code", () => phone.pairingCode !== null);
assert.equal(phone.pairingCode, chip.pairingCode);
await gb("PAIR", 2);
assert.equal(await p, false);
assert.equal(phone.lastPairingEnd, "refused");
await gb("PHONE", 2);
p = phone.requestPairing("Pixel 9");
await until("code", () => phone.pairingCode !== null);
await gb("PAIR", 1, phone.pairingCode!);
assert.equal(await p, true);
await until("paired", () => phone.paired);
assert.equal(phone.phone?.name, "PIXEL 9");
console.log("paired as", phone.phone);

// Solana: the request goes up in chunks, the signed transaction comes back in chunks and verifies
const me = new PublicKey(phone.addresses!.sol);
const tx = new Transaction({ feePayer: me, recentBlockhash: "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi" }).add(
  SystemProgram.transfer({ fromPubkey: me, toPubkey: new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"), lamports: 1_234_500_000 }),
);
let req = await phone.requestSignature({ chain: "sol", tx });
await until("pending", () => phone.hasPending);
await assert.rejects(phone.requestSignature({ chain: "sol", tx }), /already waiting/);
assert.equal((await gb("PENDING")).status, 0);
await gb("SIGN", 1);
const sol = await req.result;
assert.ok(sol.approved && sol.chain === "sol");
if (sol.approved && sol.chain === "sol") {
  assert.ok(ed25519.verify(sol.signed.signature!, sol.signed.serializeMessage(), me.toBytes()), "Solana signature verifies");
  phone.setTxStatus(req.id, "BROADCAST", { hash: "nope" });
}

// EVM: what comes back recovers to the cartridge's address
req = await phone.requestSignature({
  chain: "evm",
  tx: { type: "eip1559", chainId: 11155111, to: "0x000000000000000000000000000000000000dEaD", value: 10n ** 15n, nonce: 1, gas: 21000n, maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: 1_500_000_000n },
});
await gb("SIGN", 1);
const evm = await req.result;
assert.ok(evm.approved && evm.chain === "evm");
if (evm.approved && evm.chain === "evm") assert.equal(await recoverTransactionAddress({ serializedTransaction: evm.signed as `0x${string}` }), phone.addresses!.evm);

// refused on the Game Boy, and refused by the chip with its own words
req = await phone.requestSignature({ chain: "sol", tx });
await gb("SIGN", 0);
assert.deepEqual(await req.result, { approved: false, reason: "rejected" });
await assert.rejects(phone.requestSignature({ chain: "sol", tx: new Transaction({ feePayer: me, recentBlockhash: tx.recentBlockhash }) }), /plain SOL transfers/);

// a swap: fields only, signature and digest back
req = await phone.requestSignature({
  chain: "swap",
  swap: { src: { chain: "sol" }, dst: { chain: "evm", net: 46630 }, sellToken: "11111111111111111111111111111111", sellAmount: 250_000_000n, buyToken: "0x0000000000000000000000000000000000000000", minReceive: 31_234_567_890_123_456n, deadline: Math.floor(Date.now() / 1000) + 300 },
});
await gb("SIGN", 1);
const swap = await req.result;
assert.ok(swap.approved && swap.chain === "swap" && swap.signature.length > 40 && swap.digest.length === 64);

// the Game Boy switches the EVM network: the app hears about it
let heard = 0;
phone.onNetwork = (id) => (heard = id);
await gb("NETWORK", 1);
await until("network followed", () => heard !== 0);
assert.equal(heard, chip.evmNetworkId);

// balances and unpairing reach the chip
phone.setBalance("sol", 2_480_000_000n);
await until("balance on the Game Boy", () => chip.accountReply("sol").includes("2.48"));
phone.unpair();
await until("unpaired", () => !phone.paired);
assert.equal(chip.paired, false);

// a lapsed pairing
await gb("PHONE", 2);
await until("window open", () => phone.pairWindowOpen);
const realNow = Date.now;
p = phone.requestPairing("Late");
await until("code", () => phone.pairingCode !== null);
// the chip's 60 s lapse, without waiting a minute: its timer fires on the next tick of a faster clock
Date.now = () => realNow() + 61_000;
(chip as unknown as { pairing: { resolve: (b: boolean) => void } | null }).pairing && (chip as unknown as { dropPairing(w: string): void }).dropPairing("lapsed");
Date.now = realNow;
assert.equal(await p, false);
assert.equal(phone.lastPairingEnd, "lapsed");

phone.stop();
console.log(`link loop: all checks passed (${n} exchanges, ${lostIn} requests and ${lostOut} replies lost and recovered)`);
process.exit(0);
