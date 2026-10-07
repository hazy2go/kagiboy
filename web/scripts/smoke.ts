// Runs the real ROM against the chip headlessly and saves a PNG of each screen.
// usage: pnpm smoke [out-dir]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import bs58 from "bs58";
import { Keypair, PublicKey, SystemInstruction, SystemProgram, Transaction } from "@solana/web3.js";
import { parseEther, parseTransaction, recoverTransactionAddress } from "viem";
import { GameBoy, HEIGHT, WIDTH, type Key } from "../src/emu/gameboy";
import { CartChip, type Persisted, type SignResult } from "../src/chip/chip";
import { walletFromMnemonic } from "../src/chip/keys";

const out = process.argv[2] ?? "smoke-out";
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
async function press(key: Key, hold = 3) {
  gb.setKey(key, true);
  await frames(hold);
  gb.setKey(key, false);
  await frames(3);
}
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
await press("START");
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
await press("A");
await frames(10);
await press("UP");
await press("RIGHT");
await press("UP");
await press("UP");
snap("set-pin"); // PIN 1200
await press("A");
await frames(20);
chip.setBalance("sol", 2_000_000_000n);
chip.setBalance("evm", parseEther("0.05"));
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
await press("A");
await frames(20);
snap("receive-sol-qr");
const solScan = scanScreen();
await press("RIGHT");
await frames(20);
snap("receive-eth-qr");
const evmScan = scanScreen();
await press("SELECT");
await frames(10);
snap("receive-eth-text");
await press("B");
await frames(20);
snap("home-after-receive");
console.log("qr sol:", solScan === chip.addresses!.sol ? "OK" : `MISMATCH ${solScan}`);
console.log("qr evm:", evmScan === chip.addresses!.evm ? "OK" : `MISMATCH ${evmScan}`);

// phone asks for a signature, then (a compromised phone) swaps the transfer after the Game Boy shows it
const from = new PublicKey(chip.addresses!.sol);
const shownTo = Keypair.generate().publicKey;
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
const statusReply = chip.log.filter((e) => e.cmd === "TXSTATUS" && e.dir === "chip>gb").at(-1)?.hex ?? "";
console.log("phone text on screen:", statusReply.includes("41 4c 4c") /* "ALL" */ ? "LEAKED" : "blocked");
await press("A");

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
await press("B");
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
chip.setTxStatus(ethReq2.id, "CONFIRMED", { hash: "0x" + "ab".repeat(32) });
await frames(40);
snap("eth-confirmed");
await press("A");
await frames(20);

// power cycle: keys survive, RAM does not
gb = new GameBoy(rom);
chip.reset();
await frames(120);
await press("START");
await frames(10);
await press("A"); // wrong PIN 0000
await frames(10);
snap("wrong-pin");
await press("A");
await press("UP");
await press("RIGHT");
await press("UP");
await press("UP");
await press("A"); // 1200
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
await press("START");
await frames(10);
for (let i = 0; i < 5; i++) {
  await press("A"); // 0000 is wrong
  await frames(10);
  if (i < 4) await press("A"); // "A: TRY AGAIN"
}
await frames(10);
snap("wiped");
console.log("state after 5 wrong PINs:", chip.state, "storage:", saved === null ? "erased" : "STILL THERE");

// restore a known phrase from the start menu, letter by letter, like a person would
const PHRASE = "legal winner thank year wave sausage worth useful legal winner thank yellow"; // BIP-39 test vector
await press("A"); // leave the WIPED screen
await frames(10);
await press("DOWN");
await press("A"); // RESTORE 12 WORDS
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
await frames(20);
snap("restore-pin");
await press("A"); // PIN 0000
await frames(20);
const expected = walletFromMnemonic(PHRASE);
console.log(
  "restore:",
  chip.state,
  chip.addresses?.sol === expected.sol.publicKey.toBase58() && chip.addresses?.evm === expected.evm.address ? "addresses match" : "MISMATCH",
);

console.log("PIN on bus monitor:", chip.log.some((e) => e.cmd === "UNLOCK" && e.hex.includes("00 00 00 00")) ? "LEAKED" : "hidden");
