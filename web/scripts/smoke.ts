// Runs the real ROM against the chip headlessly and saves a PNG of each screen.
// usage: pnpm smoke [out-dir]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import bs58 from "bs58";
import { ed25519 } from "@noble/curves/ed25519.js";
import { Keypair, PublicKey, SystemInstruction, SystemProgram, Transaction } from "@solana/web3.js";
import { keccak256, parseEther, parseTransaction, recoverTransactionAddress } from "viem";
import { GameBoy, HEIGHT, WIDTH, type Key } from "../src/emu/gameboy";
import { CartChip, type Persisted, type SignResult } from "../src/chip/chip";
import { walletFromMnemonic } from "../src/chip/keys";

const out = process.argv[2] ?? "smoke-out";

// any failed check makes the run exit non-zero
let failed = false;
const log = console.log;
console.log = (...args: unknown[]) => {
  if (/WRONG|NOT REFUSED|MISMATCH|FAILED|LEAKED|STILL THERE|: false|: null/.test(args.map(String).join(" "))) failed = true;
  log(...args);
};
// a crash is a failure too, not a silent early exit
process.on("uncaughtException", (e) => {
  failed = true;
  log("CRASHED:", e);
  process.exit(1);
});
process.on("unhandledRejection", (e) => {
  failed = true;
  log("CRASHED:", e);
  process.exit(1);
});
process.on("exit", () => {
  if (failed) {
    log("\nSMOKE: FAILED");
    process.exitCode = 1;
  } else log("\nSMOKE: all checks passed");
});
mkdirSync(out, { recursive: true });
const rom = readFileSync(new URL("../public/wallet.gb", import.meta.url));

let saved: Persisted | null = null;
const chip = new CartChip({
  load: () => saved,
  save: (p) => (saved = structuredClone(p)),
  clear: () => (saved = null),
});
let gb = new GameBoy(rom);

const tick = () => new Promise((r) => setImmediate(r));
async function frames(n: number, each?: () => void) {
  for (let i = 0; i < n; i++) {
    each?.();
    gb.frame();
    chip.tick(gb);
    await tick();
  }
}
// screens fade out and in (~12 frames), so give every press time to land
async function press(key: Key, hold = 3, settle = 3) {
  gb.setKey(key, true);
  await frames(hold);
  gb.setKey(key, false);
  await frames(settle);
}
const step = (key: Key) => press(key, 3, 24);
let shot = 0;
function snap(name: string) {
  const scale = 2;
  const px = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  gb.draw(px);
  const png = new PNG({ width: WIDTH * scale, height: HEIGHT * scale });
  for (let y = 0; y < HEIGHT * scale; y++)
    for (let x = 0; x < WIDTH * scale; x++) {
      const s = (Math.floor(y / scale) * WIDTH + Math.floor(x / scale)) * 4;
      const d = (y * WIDTH * scale + x) * 4;
      png.data[d] = px[s];
      png.data[d + 1] = px[s + 1];
      png.data[d + 2] = px[s + 2];
      png.data[d + 3] = 255;
    }
  const file = `${out}/${String(++shot).padStart(2, "0")}-${name}.png`;
  writeFileSync(file, PNG.sync.write(png));
  console.log("saved", file);
}

const keys: Key[] = ["A", "B", "UP", "DOWN", "LEFT", "RIGHT", "SELECT"];

await frames(120);
snap("boot");
await step("START");
await frames(10);
snap("start-menu");
await step("A"); // CREATE NEW WALLET (restore is tested at the end)
await frames(10);
snap("mash-start");
// mash until the ROM sends its final (empty) ENTROPY call
const mashDone = () => chip.log.some((e) => e.dir === "gb>chip" && e.cmd === "ENTROPY" && e.hex === "02 00");
for (let i = 0; !mashDone() && i < 200; i++) await press(keys[Math.floor(Math.random() * keys.length)], 2 + (i % 3));
await frames(5);
snap("mash-done");
await frames(70);
await frames(240, () => {
  chip.accel = { x: Math.floor(Math.random() * 120 - 60), y: Math.floor(Math.random() * 120 - 60) };
});
snap("shake-done");
chip.accel = { x: 0, y: 0 };
await frames(90);
snap("words");
await step("A");
await frames(10);
await press("UP");
await press("RIGHT");
await press("UP");
await press("UP");
snap("set-pin"); // PIN 1200
await step("A");
await frames(20);
snap("confirm-pin");
await press("UP");
await press("RIGHT");
await press("UP");
await press("UP");
await step("A");
await frames(20);

await frames(60);
snap("pair-wait");
await frames(40);
snap("pair-wait-waves");
// the recovery words don't stay readable on the cartridge bus once the PIN is set
const mailboxText = Array.from({ length: 172 }, (_, i) => String.fromCharCode(gb.read(0xd800 + 0x44 + i) || 32)).join("");
const firstWord = saved?.mnemonic.split(" ")[0] ?? "?";
console.log("recovery words gone from the mailbox:", saved && !mailboxText.includes(` ${firstWord} `) && !mailboxText.startsWith(firstWord) ? "OK" : "LEAKED");
// pairing: an unpaired phone can't ask for signatures or put balances on screen
let unpairedBlocked = false;
try {
  chip.requestSignature({ chain: "evm", tx: { chainId: 11155111, to: "0x000000000000000000000000000000000000dEaD", value: 1n, nonce: 0, gas: 21000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, type: "eip1559" } });
} catch {
  unpairedBlocked = true;
}
chip.setBalance("sol", 1n);
console.log("unpaired phone blocked:", unpairedBlocked && chip.accountReply("sol").includes("--") ? "OK" : "WRONG");
// turned away first, then accepted; the code on the Game Boy is the one the phone shows
let pairing = chip.requestPairing();
await frames(40);
snap("pair-request");
const shownCode = chip.log.filter((e) => e.cmd === "PAIR" && e.dir === "chip>gb").at(-1)?.hex ?? "";
const codeHex = Array.from(chip.pairingCode!, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
console.log("Game Boy shows the phone's code:", shownCode.includes(codeHex) ? "OK" : "WRONG");
await step("B");
console.log("B turns the phone away:", (await pairing) === false && !chip.paired ? "OK" : "WRONG");
await frames(100);
pairing = chip.requestPairing();
await frames(40);
// a second phone can't swap its code in while the owner is reading the first one's
let takeover = "";
await chip.requestPairing("ATTACKER").catch((e) => (takeover = (e as Error).message));
console.log("second pairing refused while one waits:", takeover.includes("already asking") ? "OK" : "WRONG", takeover);
await step("A");
console.log("A pairs the phone:", (await pairing) === true && chip.paired ? "OK" : "WRONG");
await frames(100);
snap("paired");

chip.setBalance("sol", 2_480_000_000n);
chip.setBalance("evm", parseEther("0.42"));
await frames(130);
snap("home");
console.log("addresses", chip.addresses);

// receive: QR codes must decode back to the chip's addresses
function scanScreen() {
  const px = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  gb.draw(px);
  // phone cameras see a scaled-up screen, so upscale before decoding
  const k = 4;
  const big = new Uint8ClampedArray(WIDTH * k * HEIGHT * k * 4);
  for (let y = 0; y < HEIGHT * k; y++)
    for (let x = 0; x < WIDTH * k; x++) {
      const s = (Math.floor(y / k) * WIDTH + Math.floor(x / k)) * 4;
      big.set(px.subarray(s, s + 4), (y * WIDTH * k + x) * 4);
    }
  return jsQR(big, WIDTH * k, HEIGHT * k)?.data ?? null;
}
await step("A");
await frames(20);
snap("receive-sol-qr");
const solScan = scanScreen();
await step("RIGHT");
await frames(20);
snap("receive-eth-qr");
const evmScan = scanScreen();
await step("SELECT");
await frames(10);
snap("receive-eth-text");
await step("B");
await frames(20);
snap("home-after-receive");
console.log("qr sol:", solScan === chip.addresses!.sol ? "OK" : `MISMATCH ${solScan}`);
console.log("qr evm:", evmScan === chip.addresses!.evm ? "OK" : `MISMATCH ${evmScan}`);

// phone asks for a signature, then (a compromised phone) swaps the transfer after the Game Boy shows it
const from = new PublicKey(chip.addresses!.sol);
// the same recipient and amount the landing page's live attract mode shows, so the printed slip matches its screen
const shownTo = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const attacker = Keypair.generate().publicKey;
const tx = new Transaction({ feePayer: from, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(
  SystemProgram.transfer({ fromPubkey: from, toPubkey: shownTo, lamports: 250_000_000 }),
);
const solReq = chip.requestSignature({ chain: "sol", tx });
let result: SignResult | null = null;
solReq.result.then((r) => (result = r));
await frames(30);
snap("sign-request");
tx.instructions = [SystemProgram.transfer({ fromPubkey: from, toPubkey: attacker, lamports: 5_000_000_000 })];
gb.setKey("A", true);
await frames(70);
gb.setKey("A", false);
await frames(20);
const solRes = result as SignResult | null;
if (solRes?.approved && solRes.chain === "sol") {
  const ix = SystemInstruction.decodeTransfer(solRes.signed.instructions[0]);
  console.log(
    "sol signed what was shown:",
    solRes.signed.verifySignatures() && ix.toPubkey.equals(shownTo) && Number(ix.lamports) === 250_000_000 ? "OK" : "WRONG",
  );
} else console.log("sol approve FAILED:", solRes);
// free text from the phone must never reach the screen
chip.setTxStatus(solReq.id, "ALL GOOD, SEND AGAIN TO 0xBAD" as never, { hash: "DOUBLESENDNOWPLEASE" });
chip.setTxStatus(solReq.id, "CONFIRMED", { hash: "DOUBLESENDNOWPLEASE" });
chip.setTxStatus(solReq.id, "FAILED", { reason: "SEND MORE" as never });
const solSig = solRes?.approved && solRes.chain === "sol" ? bs58.encode(solRes.signed.signature!) : "";
chip.setTxStatus(solReq.id, "CONFIRMED", { hash: solSig });
await frames(40);
snap("tx-confirmed");
// once it's on chain, the phone can't relabel it as failed (that invites sending twice)
chip.setTxStatus(solReq.id, "FAILED", { reason: "NO_FUNDS" });
await frames(40);
const statusReply = chip.log.filter((e) => e.cmd === "TXSTATUS" && e.dir === "chip>gb").at(-1)?.hex ?? "";
console.log("phone text on screen:", statusReply.includes("41 4c 4c") /* "ALL" */ ? "LEAKED" : "blocked");
console.log("confirmed send can't be relabelled failed:", statusReply.includes("43 4f 4e 46") /* "CONF" */ && !statusReply.includes("46 41 49 4c") /* "FAIL" */ ? "OK" : "WRONG");
await step("A");

// requests the chip must refuse outright
const sepoliaTx = { chainId: 11155111, to: "0x000000000000000000000000000000000000dEaD", value: parseEther("0.01"), nonce: 0, gas: 21000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, type: "eip1559" } as const;
const refused = (label: string, req: Parameters<typeof chip.requestSignature>[0]) => {
  try {
    chip.requestSignature(req);
    console.log(`refuse ${label}: NOT REFUSED`);
  } catch (e) {
    console.log(`refuse ${label}: OK (${(e as Error).message})`);
  }
};
refused("mainnet chainId", { chain: "evm", tx: { ...sepoliaTx, chainId: 1 } });
refused("huge gas", { chain: "evm", tx: { ...sepoliaTx, gas: 1_000_000n } });
refused("huge fee", { chain: "evm", tx: { ...sepoliaTx, maxFeePerGas: 10n ** 15n } });
refused("amount too long to show", { chain: "evm", tx: { ...sepoliaTx, value: 2n ** 256n - 1n } });
refused("calldata", { chain: "evm", tx: { ...sepoliaTx, data: "0xa9059cbb" } });
refused(
  "foreign fee payer",
  { chain: "sol", tx: new Transaction({ feePayer: attacker, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(SystemProgram.transfer({ fromPubkey: from, toPubkey: attacker, lamports: 1 })) },
);

// ETH request, rejected with B
const ethReq = chip.requestSignature({ chain: "evm", tx: { ...sepoliaTx } });
let ethResult: SignResult | null = null;
ethReq.result.then((r) => (ethResult = r));
await frames(60);
snap("eth-request");
await step("B");
await frames(10);
console.log("eth rejected:", ethResult && !(ethResult as SignResult).approved);
await frames(100); // "REJECTED" screen, then home

// ETH approved: the async signing path; the signature must recover to our address
const ethTx = { ...sepoliaTx };
const ethReq2 = chip.requestSignature({ chain: "evm", tx: ethTx });
let ethSigned: SignResult | null = null;
ethReq2.result.then((r) => (ethSigned = r));
ethTx.value = parseEther("9"); // later edits to the phone's object must not matter
await frames(30);
gb.setKey("A", true);
await frames(70);
gb.setKey("A", false);
await frames(20);
const signedEth = ethSigned as SignResult | null;
if (signedEth?.approved && signedEth.chain === "evm") {
  const signer = await recoverTransactionAddress({ serializedTransaction: signedEth.signed as never });
  const parsed = parseTransaction(signedEth.signed);
  console.log("eth signer matches:", signer === chip.addresses!.evm, "value as shown:", parsed.value === parseEther("0.01"));
} else console.log("eth approve FAILED:", signedEth);
chip.setTxStatus(ethReq.id, "CONFIRMED", { hash: "0x" + "cd".repeat(32) }); // stale id: must be ignored
// a well-formed hash that isn't the signed tx's must not reach the screen
chip.setTxStatus(ethReq2.id, "CONFIRMED", { hash: "0x" + "ab".repeat(32) });
await frames(20);
const forged = chip.log.filter((e) => e.cmd === "TXSTATUS" && e.dir === "chip>gb").at(-1)?.hex ?? "";
console.log("forged hash on screen:", /30 78 61 62 61 62/.test(forged) /* "0xabab" */ ? "LEAKED" : "blocked");
const ethHash = signedEth?.approved && signedEth.chain === "evm" ? keccak256(signedEth.signed) : "";
chip.setTxStatus(ethReq2.id, "CONFIRMED", { hash: ethHash });
await frames(40);
snap("eth-confirmed");
const realStatus = chip.log.filter((e) => e.cmd === "TXSTATUS" && e.dir === "chip>gb").at(-1)?.hex ?? "";
console.log("real hash on screen:", realStatus.includes("43 4f 4e 46") /* "CONF" */ ? "OK" : "WRONG");
await step("A");
await frames(20);

// other EVM networks: same key, the network and its coin are named on the Game Boy
refused("rollup gas above the cap", { chain: "evm", tx: { ...sepoliaTx, chainId: 421614, gas: 900_000n } });
chip.setEvmNetwork(998);
chip.setBalance("evm", 3_000_000_000_000_000_000n);
await frames(140); // the home screen refreshes every 2 s
snap("home-hyperevm");
const acct = chip.accountReply("evm");
console.log("home names HyperEVM:", acct.includes("\0HyperEVM\0") && acct.includes("3.0000 HYPE") ? "OK" : "WRONG");
const hypeReq = chip.requestSignature({ chain: "evm", tx: { ...sepoliaTx, chainId: 998, nonce: 7 } });
hypeReq.result.then(() => {});
await frames(40);
snap("hyperevm-request");
const shown = chip.pendingShown;
console.log("approve screen says HYPEREVM:", shown?.network === "HYPEREVM" && shown.amount === "0.01 HYPE" && shown.fee.endsWith(" HYPE") ? "OK" : "WRONG", shown?.fee);
await step("B");
await frames(30);
// Arbitrum-style gas (L1 cost billed as gas) is accepted, then dropped
try {
  const arb = chip.requestSignature({ chain: "evm", tx: { ...sepoliaTx, chainId: 421614, gas: 250_000n, nonce: 8 } });
  arb.result.then(() => {});
  console.log("arbitrum gas accepted: OK");
  await frames(40);
  await step("B");
  await frames(30);
} catch (e) {
  console.log("arbitrum gas accepted: WRONG", (e as Error).message);
}
chip.setEvmNetwork(11155111);

// a SODAX swap: shown in full on the Game Boy, signed over exactly that, never broadcast by the demo
for (let i = 0; i < 5 && chip.hasPending; i++) {
  await step("B");
  await frames(30);
}
await frames(60);
const swap = {
  src: { chain: "sol" as const },
  dst: { chain: "evm" as const, net: 84532 },
  sellToken: "11111111111111111111111111111111",
  sellAmount: 1_000_000_000n,
  buyToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  minReceive: 114_693_184n,
  deadline: Math.floor(Date.now() / 1000) + 300,
};
refused("swap with an unknown network", { chain: "swap", swap: { ...swap, dst: { chain: "evm", net: 1 } } });
refused("swap of a token the cartridge doesn't know", { chain: "swap", swap: { ...swap, buyToken: "0x0000000000000000000000000000000000000bad" } });
refused("swap with a fractional deadline", { chain: "swap", swap: { ...swap, deadline: swap.deadline + 0.5 } });
refused("expired swap quote", { chain: "swap", swap: { ...swap, deadline: 1 } });
const swapReq = chip.requestSignature({ chain: "swap", swap });
let swapRes: SignResult | null = null;
swapReq.result.then((r) => (swapRes = r));
await frames(30);
snap("swap-request");
const swapShown = chip.pendingShown;
console.log(
  "swap shown on the Game Boy:",
  swapShown?.network === "SWAP SOLANA" && swapShown.amount === "1 SOL" && swapShown.to.includes("114.693184 USDC") && swapShown.to.includes("ON BASE") ? "OK" : "WRONG",
  swapShown,
);
gb.setKey("A", true);
await frames(70);
gb.setKey("A", false);
await frames(40);
snap("swap-signed");
const sr = swapRes as SignResult | null;
const swapKey = walletFromMnemonic(saved!.mnemonic).sol.publicKey.toBytes();
console.log(
  "swap signed by the Solana key:",
  sr?.approved && sr.chain === "swap" && ed25519.verify(bs58.decode(sr.signature), Buffer.from(sr.digest, "hex"), swapKey) ? "OK" : "WRONG",
);
const swapStatus = chip.log.filter((e) => e.cmd === "TXSTATUS" && e.dir === "chip>gb").at(-1)?.hex ?? "";
console.log("Game Boy told it's a demo:", swapStatus.includes("44 45 4d 4f") /* "DEMO" */ ? "OK" : "WRONG");
await step("A");
await frames(30);

// the Game Boy picks the EVM network itself: RIGHT steps forward, LEFT back, and the phone is told
let followed = 0;
chip.onNetwork = (id) => (followed = id);
for (let i = 0; i < 5 && chip.hasPending; i++) {
  await step("B");
  await frames(30);
}
await frames(90);
snap("home-before-switch");
await step("RIGHT");
await frames(10);
snap("home-gb-picks-base");
console.log("RIGHT switches to Base:", followed === 84532 && chip.accountReply("evm").includes("\0Base\0") ? "OK" : "WRONG", followed);
await step("LEFT");
await step("LEFT");
await frames(10);
snap("home-gb-picks-robinhood");
console.log("LEFT wraps to Robinhood:", followed === 46630 ? "OK" : "WRONG", followed);
await step("RIGHT");
await frames(10);
console.log("back on Ethereum:", followed === 11155111 ? "OK" : "WRONG", followed);
chip.onNetwork = null;

// the Phone screen: who is paired, and forgetting it from the Game Boy
let second = "";
await chip.requestPairing("STRANGER").catch((e) => (second = (e as Error).message));
console.log("second phone refused while the window is closed:", second.includes("Pair new phone") ? "OK" : "WRONG", second);
await step("SELECT"); // menu
await step("DOWN"); // Phone
await step("A");
await frames(20);
snap("phone-screen");
const info = chip.log.filter((e) => e.cmd === "PHONE" && e.dir === "chip>gb").at(-1)?.hex ?? "";
console.log("Phone screen names the paired phone:", info.length > 10 ? "OK" : "WRONG");
await step("SELECT"); // forget?
await frames(10);
snap("phone-forget");
// a request arrives from the phone while the owner is about to forget it
const late = chip.requestSignature({ chain: "evm", tx: { ...sepoliaTx, nonce: 31 } });
let lateRes: SignResult | null = null;
late.result.then((r) => (lateRes = r));
await step("A");
await frames(120);
console.log("forgotten from the Game Boy:", !chip.paired ? "OK" : "WRONG");
await frames(10);
console.log("its waiting request was dropped:", !chip.hasPending && (lateRes as SignResult | null)?.approved === false ? "OK" : "WRONG", lateRes);
snap("phone-none");
await step("B"); // back to the menu
await step("B"); // home: asks to pair again
await frames(30);
const again = chip.requestPairing("IPHONE");
await frames(40);
await step("A");
console.log("a phone pairs again after forgetting:", (await again) && chip.paired && chip.phone?.name === "IPHONE" ? "OK" : "WRONG");
await frames(100);
chip.setBalance("sol", 2_480_000_000n);
chip.setBalance("evm", parseEther("0.42"));

// power cycle: keys survive, RAM does not
gb = new GameBoy(rom);
chip.reset();
await frames(120);
await step("START");
await frames(10);
await step("A"); // wrong PIN 0000
await frames(10);
snap("wrong-pin");
await step("A");
await press("UP");
await press("RIGHT");
await press("UP");
await press("UP");
await step("A"); // 1200
await frames(140);
snap("unlocked-home");
console.log("state after power cycle:", chip.state);

// power off while a request waits on the Game Boy: the phone must hear "rejected"
let cut: SignResult | null = null;
const cutTx = new Transaction({ feePayer: from, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(
  SystemProgram.transfer({ fromPubkey: from, toPubkey: Keypair.generate().publicKey, lamports: 1 }),
);
chip.requestSignature({ chain: "sol", tx: cutTx }).result.then((r) => (cut = r));
await frames(30);
gb = new GameBoy(rom);
chip.reset();
await tick();
console.log("power cut resolves as rejected:", cut !== null && !(cut as SignResult).approved);

// five wrong PINs wipe the cartridge
await frames(120);
await step("START");
await frames(10);
for (let i = 0; i < 5; i++) {
  await step("A"); // 0000 is wrong
  await frames(10);
  if (i < 4) await step("A"); // "A: TRY AGAIN"
}
await frames(10);
snap("wiped");
console.log("state after 5 wrong PINs:", chip.state, "storage:", saved === null ? "erased" : "STILL THERE");

// restore a known phrase from the start menu, letter by letter, like a person would
const PHRASE = "legal winner thank year wave sausage worth useful legal winner thank yellow"; // BIP-39 test vector
await step("A"); // leave the WIPED screen
await frames(10);
await press("DOWN");
await step("A"); // RESTORE 12 WORDS
await frames(10);
snap("restore-warning"); // TEST WORDS ONLY
await step("B"); // back to the start menu
await frames(10);
await press("DOWN");
await step("A"); // RESTORE 12 WORDS again
await frames(10);
await step("A"); // OK through the warning
await frames(10);
for (const word of PHRASE.split(" ")) {
  for (const ch of word.slice(0, 4)) {
    const steps = ch.charCodeAt(0) - 97;
    const key: Key = steps <= 13 ? "UP" : "DOWN";
    for (let i = 0; i < (steps <= 13 ? steps : 26 - steps); i++) await press(key, 2);
    await press("RIGHT", 2);
  }
  if (word === "legal") snap("restore-word"); // first time only matters
  await press("A", 2);
}
await frames(90);
snap("restore-pin");
await step("A"); // PIN 0000
await frames(20);
await step("A"); // and once more to confirm it
await frames(20);
const expected = walletFromMnemonic(PHRASE);
console.log(
  "restore:",
  chip.state,
  chip.addresses?.sol === expected.sol.publicKey.toBase58() && chip.addresses?.evm === expected.evm.address ? "addresses match" : "MISMATCH",
);

console.log("PIN on bus monitor:", chip.log.some((e) => e.cmd === "UNLOCK" && e.hex.includes("00 00 00 00")) ? "LEAKED" : "hidden");
