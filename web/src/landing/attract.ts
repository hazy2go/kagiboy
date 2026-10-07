import "../polyfill"; // must run before @solana/web3.js loads
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { CartChip, demoPersisted, type Persisted } from "../chip/chip";
import { GameBoy, HEIGHT, WIDTH, type Key } from "../emu/gameboy";

/**
 * Attract mode for the landing page: the real ROM and the real chip, driven by
 * a script. It unlocks a throwaway devnet wallet, then sits on the home screen
 * until the page asks for the sign request.
 */

// BIP-39 test vector; never funded, testnet only.
const DEMO_WORDS = "legal winner thank year wave sausage worth useful legal winner thank yellow";

// soft LCD tones so the screen sits in a pastel page (lightest to darkest)
const LCD = [
  [232, 238, 222],
  [181, 196, 170],
  [104, 122, 110],
  [42, 52, 50],
];

export type AttractScene = "home" | "sign";

export class Attract {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private gb: GameBoy;
  private chip: CartChip;
  private raw = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  private queue: { key: Key; down: boolean; at: number }[] = [];
  private frame = 0;
  private ready = false;
  private want: AttractScene = "home";
  private signing = false;
  private rejectAt = -1;
  private onFrame: (() => void) | null = null;

  constructor(rom: Uint8Array) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.ctx = this.canvas.getContext("2d")!;
    this.image = this.ctx.createImageData(WIDTH, HEIGHT);
    let stored: Persisted | null = demoPersisted(DEMO_WORDS, [0, 0, 0, 0]);
    this.chip = new CartChip({ load: () => stored, save: (p) => (stored = p), clear: () => (stored = null) });
    this.gb = new GameBoy(rom);
    // boot -> START -> PIN 0000 -> A
    this.tap("START", 150);
    this.tap("A", 230);
  }

  /** Called with every new screen frame (to refresh a texture). */
  set frameListener(fn: (() => void) | null) {
    this.onFrame = fn;
  }

  scene(s: AttractScene) {
    this.want = s;
  }

  private tap(key: Key, at: number) {
    this.queue.push({ key, down: true, at }, { key, down: false, at: at + 4 });
  }

  /** Advance one Game Boy frame. */
  step() {
    const f = this.frame++;
    for (const e of this.queue.filter((q) => q.at === f)) this.gb.setKey(e.key, e.down);
    this.queue = this.queue.filter((q) => q.at > f);
    this.gb.frame();
    this.chip.tick(this.gb);

    if (!this.ready && this.chip.state === "unlocked") {
      this.ready = true;
      this.chip.setBalance("sol", 2_480_000_000n);
      this.chip.setBalance("evm", 420_000_000_000_000_000n);
    }
    if (this.ready) this.direct();

    this.gb.draw(this.raw);
    const d = this.image.data;
    for (let i = 0; i < d.length; i += 4) {
      // gb.draw recolours to DMG greens; map those 4 shades onto the soft palette
      const g = this.raw[i + 1];
      const c = LCD[g > 180 ? 0 : g > 160 ? 1 : g > 80 ? 2 : 3];
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
    this.onFrame?.();
  }

  /** Raise a sign request when the page wants one; reject it with B when it moves on. */
  private direct() {
    if (this.want === "sign" && !this.signing && !this.chip.hasPending) {
      this.signing = true;
      const from = new PublicKey(this.chip.addresses!.sol);
      const tx = new Transaction({ feePayer: from, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(
        SystemProgram.transfer({
          fromPubkey: from,
          toPubkey: new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
          lamports: 250_000_000,
        }),
      );
      try {
        this.chip.requestSignature({ chain: "sol", tx }).result.then(() => {
          this.signing = false;
        });
      } catch {
        this.signing = false;
      }
    }
    if (this.want === "home" && this.chip.hasPending && this.frame > this.rejectAt + 30) {
      this.rejectAt = this.frame;
      this.tap("B", this.frame + 1);
    }
  }
}

export async function startAttract(): Promise<Attract> {
  const rom = new Uint8Array(await (await fetch("/wallet.gb")).arrayBuffer());
  return new Attract(rom);
}
