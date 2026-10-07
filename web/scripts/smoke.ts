// Runs the real ROM against the chip headlessly and saves a PNG of each screen.
// usage: pnpm smoke [out-dir]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { parseEther, recoverTransactionAddress } from "viem";
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
chip.setBalance("sol", "2.0000 SOL");
chip.setBalance("evm", "0.0500 ETH");
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

// phone asks for a signature
const from = new PublicKey(chip.addresses!.sol);
const tx = new Transaction({ feePayer: from, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(
  SystemProgram.transfer({ fromPubkey: from, toPubkey: Keypair.generate().publicKey, lamports: 250_000_000 }),
);
let result: SignResult | null = null;
chip.requestSignature({ chain: "sol", tx }).then((r) => (result = r));
await frames(30);
snap("sign-request");
gb.setKey("A", true);
await frames(70);
gb.setKey("A", false);
await frames(20);
console.log("sol approved:", result && (result as SignResult).approved, "verified:", tx.verifySignatures());
chip.setTxStatus("CONFIRMED", "5Yh3kQx9dLwPmn2R8sTuVc4aBjE7fGhK1MnoPqRsTuVwXyZ");
await frames(40);
snap("tx-confirmed");
await press("A");

// ETH request, rejected with B
let ethResult: SignResult | null = null;
chip
  .requestSignature({
    chain: "evm",
    tx: { chainId: 11155111, to: "0x000000000000000000000000000000000000dEaD", value: parseEther("0.01"), nonce: 0, gas: 21000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, type: "eip1559" },
  })
  .then((r) => (ethResult = r));
await frames(60);
snap("eth-request");
await press("B");
await frames(10);
console.log("eth rejected:", ethResult && !(ethResult as SignResult).approved);
await frames(100); // "REJECTED" screen, then home

// ETH approved: the async signing path; the signature must recover to our address
let ethSigned: SignResult | null = null;
chip
  .requestSignature({
    chain: "evm",
    tx: { chainId: 11155111, to: "0x000000000000000000000000000000000000dEaD", value: parseEther("0.01"), nonce: 0, gas: 21000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, type: "eip1559" },
  })
  .then((r) => (ethSigned = r));
await frames(30);
gb.setKey("A", true);
await frames(70);
gb.setKey("A", false);
await frames(20);
const signedEth = ethSigned as SignResult | null;
if (signedEth?.approved && signedEth.chain === "evm") {
  const signer = await recoverTransactionAddress({ serializedTransaction: signedEth.signed as never });
  console.log("eth signer matches:", signer === chip.addresses!.evm);
} else console.log("eth approve FAILED:", signedEth);
chip.setTxStatus("CONFIRMED", "0x" + "ab".repeat(32));
await frames(40);
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
chip.requestSignature({ chain: "sol", tx: cutTx }).then((r) => (cut = r));
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
