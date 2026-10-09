// Runs the real-cartridge ROM (rom/build/wallet-hw.gb, mailbox at 0xA000) through a whole user
// session against the firmware model: set up a wallet, pair a phone, receive, sign on Solana and
// Ethereum, a swap, lock, a wrong PIN, unlock. Every cartridge-bus cycle goes to the sinks.

import { readFileSync } from "node:fs";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { parseEther } from "viem";
import { CartChip, type Persisted } from "../../web/src/chip/chip";
import type { Key } from "../../web/src/emu/gameboy";
import { Firmware, type Clock, type Corner } from "./firmware";
import { TracedGameBoy, type CycleSink, type Kind } from "./tracer";

export const FRAME_T = 70224; // T-cycles per LCD frame

/** Marks what the user is doing, so the power model can tell the radio and SE050 states apart. */
export interface Phase {
  name: string;
  t0: number;
  t1: number;
  radio: "off" | "advertising" | "connected";
}

export interface SessionResult {
  fw: Firmware;
  gb: TracedGameBoy;
  phases: Phase[];
  frames: number;
  signed: { sol: boolean; evm: boolean; swap: boolean };
  unlocked: boolean;
}

export async function runSession(opts: { clock: Clock; corner: Corner; sinks: CycleSink[]; onFrame?: (i: number, gb: TracedGameBoy) => void }): Promise<SessionResult> {
  const rom = readFileSync(new URL("../../rom/build/wallet-hw.gb", import.meta.url));
  let saved: Persisted | null = null;
  const chip = new CartChip({ load: () => saved, save: (p) => (saved = structuredClone(p)), clear: () => (saved = null) });
  const fw = new Firmware(chip, opts.clock, opts.corner);
  let gb = new TracedGameBoy(rom, fw);
  gb.sinks.push(...opts.sinks);

  const phases: Phase[] = [];
  let phase: Phase = { name: "boot", t0: 0, t1: 0, radio: "off" };
  const enter = (name: string, radio: Phase["radio"]) => {
    phase.t1 = gb.t;
    phases.push(phase);
    phase = { name, t0: gb.t, t1: 0, radio };
  };

  let frameNo = 0;
  const tick = () => new Promise((r) => setImmediate(r));
  async function frames(n: number, each?: () => void) {
    for (let i = 0; i < n; i++) {
      each?.();
      opts.onFrame?.(frameNo, gb);
      gb.frame();
      frameNo++;
      fw.frame(gb.t);
      await tick();
    }
  }
  async function press(key: Key, hold = 3, settle = 3) {
    gb.setKey(key, true);
    await frames(hold);
    gb.setKey(key, false);
    await frames(settle);
  }
  const step = (key: Key) => press(key, 3, 24);
  const keys: Key[] = ["A", "B", "UP", "DOWN", "LEFT", "RIGHT", "SELECT"];
  /** wait (up to a limit) until the Game Boy has seen the reply to its last call */
  async function settle(limit = 700) {
    for (let i = 0; i < limit; i++) {
      const c = fw.calls.at(-1);
      if (!c || c.tSeen !== undefined) return;
      await frames(1);
    }
  }

  await frames(120);
  enter("setup", "off");
  await step("START");
  await frames(10);
  await step("A"); // create a new wallet
  const mashDone = () => chip.log.some((e) => e.dir === "gb>chip" && e.cmd === "ENTROPY" && e.hex === "02 00");
  for (let i = 0; !mashDone() && i < 200; i++) await press(keys[i % keys.length], 2 + (i % 3));
  await frames(75);
  await frames(240, () => (chip.accel = { x: (frameNo * 37) % 120 - 60, y: (frameNo * 53) % 120 - 60 }));
  chip.accel = { x: 0, y: 0 };
  await settle();
  await frames(90);
  await step("A"); // words written down
  await frames(10);
  for (const k of ["UP", "RIGHT", "UP", "UP"] as Key[]) await press(k);
  await step("A");
  await frames(20);
  for (const k of ["UP", "RIGHT", "UP", "UP"] as Key[]) await press(k);
  await step("A"); // PIN 1200 confirmed: keys go into the SE050
  await settle();
  await frames(100);

  enter("pairing", "advertising");
  const pairing = chip.requestPairing();
  await frames(40);
  await step("A");
  await settle();
  const paired = await pairing;
  await frames(60);

  enter("home", "connected");
  chip.setBalance("sol", 2_480_000_000n);
  chip.setBalance("evm", parseEther("0.42"));
  await frames(130);
  await step("A"); // receive: QR codes
  await frames(30);
  await step("RIGHT");
  await frames(30);
  await step("B");
  await frames(30);

  // Solana send
  enter("sign-sol", "connected");
  const from = new PublicKey(chip.addresses!.sol);
  const tx = new Transaction({ feePayer: from, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"), lamports: 250_000_000 }),
  );
  await frames(2); // BLE: the request arrives within a connection interval or two
  const sol = chip.requestSignature({ chain: "sol", tx });
  let solOk = false;
  sol.result.then((r) => (solOk = r.approved));
  await frames(40);
  gb.setKey("A", true);
  await frames(70);
  gb.setKey("A", false);
  await settle();
  await frames(30);
  chip.setTxStatus(sol.id, "CONFIRMED", { hash: "x".repeat(64) });
  await frames(40);
  await step("A");

  // Ethereum (Sepolia) send
  enter("sign-evm", "connected");
  const evm = chip.requestSignature({
    chain: "evm",
    tx: { chainId: 11155111, to: "0x000000000000000000000000000000000000dEaD", value: parseEther("0.01"), nonce: 0, gas: 21000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n, type: "eip1559" },
  });
  let evmOk = false;
  evm.result.then((r) => (evmOk = r.approved));
  await frames(40);
  gb.setKey("A", true);
  await frames(70);
  gb.setKey("A", false);
  await settle();
  await frames(60);
  await step("A");

  // swap SOL -> ETH on Base, quoted by SODAX
  enter("sign-swap", "connected");
  let swapOk = false;
  try {
    const sw = chip.requestSignature({
      chain: "swap",
      swap: {
        src: { chain: "sol" },
        dst: { chain: "evm", net: 84532 },
        sellToken: "11111111111111111111111111111111",
        sellAmount: 500_000_000n,
        buyToken: "0x0000000000000000000000000000000000000000",
        minReceive: parseEther("0.03"),
        deadline: Math.floor(Date.now() / 1000) + 600,
      },
    });
    sw.result.then((r) => (swapOk = r.approved));
    await frames(40);
    gb.setKey("A", true);
    await frames(70);
    gb.setKey("A", false);
    await settle();
    await frames(60);
    await step("A");
  } catch (e) {
    console.log("swap not requested:", (e as Error).message);
  }

  // power cycle: the keys stay in the SE050, RAM goes. One wrong PIN, then the right one.
  enter("unlock", "off");
  const t = gb.t;
  fw.sram.fill(0);
  chip.reset();
  gb = new TracedGameBoy(rom, fw);
  gb.t = t;
  gb.sinks.push(...opts.sinks);
  await frames(120);
  await step("START");
  await frames(10);
  await step("A"); // wrong PIN 0000
  await settle();
  await frames(10);
  await step("A");
  for (const k of ["UP", "RIGHT", "UP", "UP"] as Key[]) await press(k);
  await step("A"); // 1200
  await settle();
  await frames(140);
  enter("idle", "off");
  await frames(300);
  phase.t1 = gb.t;
  phases.push(phase);
  void paired;
  return { fw, gb, phases, frames: frameNo, signed: { sol: solOk, evm: evmOk, swap: swapOk }, unlocked: chip.state === "unlocked" };
}

/**
 * A sink that keeps every cycle of selected frames, for the cycle-level cartridge simulation:
 * every frame that touched the mailbox (up to `mailboxFrames`), plus every `every`-th frame.
 */
export class WindowRecorder implements CycleSink {
  kinds: Kind[] = [];
  addrs: number[] = [];
  values: number[] = [];
  private fk: Kind[] = [];
  private fa: number[] = [];
  private fv: number[] = [];
  private touched = false;
  private lastAddr = 0;
  kept = { mailbox: 0, sampled: 0 };
  constructor(
    readonly mailboxFrames = 40,
    readonly every = 250,
    readonly limit = 1_500_000,
  ) {}
  cycle(kind: Kind, addr: number, value: number) {
    if (kind !== "none") this.lastAddr = addr;
    if (kind === "cramR" || kind === "cramW") this.touched = true;
    this.fk.push(kind);
    this.fa.push(kind === "none" ? this.lastAddr : addr);
    this.fv.push(value);
  }
  idle(n: number) {
    for (let i = 0; i < n; i++) {
      this.fk.push("none");
      this.fa.push(this.lastAddr);
      this.fv.push(0);
    }
  }
  /** call at every frame boundary */
  frame(i: number) {
    const sample = i > 0 && i % this.every === 0;
    const mail = this.touched && this.kept.mailbox < this.mailboxFrames;
    if ((sample || mail) && this.kinds.length + this.fk.length <= this.limit) {
      for (let k = 0; k < this.fk.length; k++) {
        this.kinds.push(this.fk[k]);
        this.addrs.push(this.fa[k]);
        this.values.push(this.fv[k]);
      }
      if (mail) this.kept.mailbox++;
      else this.kept.sampled++;
    }
    this.fk = [];
    this.fa = [];
    this.fv = [];
    this.touched = false;
  }
}
