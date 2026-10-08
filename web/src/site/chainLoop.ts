/**
 * A tiny pretend Game Boy game for the About page: a little round character hops along a
 * blockchain (floating blocks joined by chain links), grabs a coin on every block, and at the end
 * puts its key in a safe. Original pixel art in the site's four soft LCD tones, 160x144. Not
 * playable, just a loop.
 */
import { SOFT_LCD } from "../emu/palette";

const W = 160;
const H = 144;
const FPS = 12;
const BLOCKS = 6;
const GAP = 52; // world px between block centres
const FIRST = 40;
const TOPS = [104, 92, 100, 86, 96, 88, 98]; // block top y; the last entry is the safe's pedestal
const HOP = 9; // frames per hop
const START = 10; // frames standing before the first hop
const END = START + BLOCKS * HOP; // landed on the safe's pedestal
const LOOP = END + 46;

type Sprite = string[];

// '.' transparent, 0..3 shade (0 = paper, 3 = ink)
const HERO: Sprite = [
  "...3333...",
  "..322223..",
  ".32222223.",
  ".32032023.",
  ".32032023.",
  ".32222223.",
  ".32211223.",
  "..322223..",
  "...3333...",
  "..33..33..",
];

const HERO_JUMP: Sprite = [
  "...3333...",
  "..322223..",
  ".32222223.",
  ".32032023.",
  ".32032023.",
  ".32222223.",
  ".32233223.",
  "..322223..",
  ".33333333.",
  "..........",
];

const KEY: Sprite = ["333..", "3.3333", "333.3."];

const SAFE: Sprite = [
  "33333333333333",
  "32222222222223",
  "32111111111123",
  "32111333311123",
  "32113111131123",
  "32113131131123",
  "32113111131123",
  "32111333311123",
  "32111111111123",
  "32222222222223",
  "33333333333333",
  ".33........33.",
];

const HEART: Sprite = [".33.33.", "3333333", "3333333", ".33333.", "..333..", "...3..."];
const SPARK: Sprite = [".2.", "222", ".2."];

// coin turning: wide, narrow, edge, narrow
const COIN: Sprite[] = [
  ["..3333..", ".322223.", "32211223", "32211223", "32211223", "32211223", ".322223.", "..3333.."],
  ["..33..", ".3223.", ".3213.", ".3213.", ".3213.", ".3213.", ".3223.", "..33.."],
  ["33", "33", "33", "33", "33", "33", "33", "33"],
];
const COIN_SPIN = [0, 1, 2, 1];

// 3x5 digits for the coin counter
const DIGITS = [
  "3333 33 33 3333",
  " 3  3  3  3  3 ",
  "333  33333  333",
  "333  3333  3333",
  "3 33 3333  3  3",
  "3333  333  3333",
  "3333  3333 3333",
  "333  3  3  3  3",
];

export class FleaLoopLike {
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private px = new Uint8Array(W * H);
  private frame = 0;
  private raf = 0;
  private last = 0;
  private debt = 0;
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext("2d")!;
    this.img = this.ctx.createImageData(W, H);
  }

  still() {
    this.frame = END + 20;
    this.render();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.debt = Math.min(this.debt + now - this.last, 250);
      this.last = now;
      let drew = false;
      while (this.debt >= 1000 / FPS) {
        this.debt -= 1000 / FPS;
        this.frame = (this.frame + 1) % LOOP;
        drew = true;
      }
      if (drew) this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  // ---------- the scene ----------

  private hero(f: number): { x: number; y: number; air: boolean } {
    const blockX = (i: number) => FIRST + i * GAP;
    if (f < START) return { x: blockX(0), y: TOPS[0], air: false };
    const k = Math.min(BLOCKS, Math.floor((f - START) / HOP));
    if (k >= BLOCKS) return { x: blockX(BLOCKS), y: TOPS[BLOCKS], air: false };
    const t = ((f - START) % HOP) / HOP;
    const x = blockX(k) + (blockX(k + 1) - blockX(k)) * t;
    const y = TOPS[k] + (TOPS[k + 1] - TOPS[k]) * t - Math.sin(t * Math.PI) * 26;
    return { x, y, air: t > 0.05 && t < 0.95 };
  }

  private render() {
    const f = this.frame;
    this.px.fill(0);
    const h = this.hero(f);
    const cam = Math.max(0, Math.min(h.x - 50, FIRST + BLOCKS * GAP - 104));
    const sx = (wx: number) => Math.round(wx - cam);

    // sky: a few slow clouds and twinkles
    for (const [x0, y, w] of [
      [20, 18, 20],
      [96, 30, 14],
      [150, 12, 24],
    ]) {
      const x = Math.round(x0 - cam * 0.3);
      this.rect(x + 3, y, w - 6, 1, 1);
      this.rect(x, y + 1, w, 3, 1);
    }
    for (const [x, y] of [
      [70, 14],
      [128, 40],
      [36, 46],
    ])
      if ((f + x) % 16 < 10) this.sprite(SPARK, Math.round(x - cam * 0.15), y);

    // chain links between blocks
    for (let i = 0; i < BLOCKS; i++) {
      const ax = FIRST + i * GAP + 9;
      const bx = FIRST + (i + 1) * GAP - 9;
      const ay = TOPS[i] + 6;
      const by = TOPS[i + 1] + 6;
      for (let s = 0; s <= 1; s += 0.16) {
        const x = sx(ax + (bx - ax) * s);
        const y = Math.round(ay + (by - ay) * s);
        this.rect(x, y, 3, 1, 2);
        this.rect(x, y + 2, 3, 1, 2);
        this.set(x - 1, y + 1, 2);
        this.set(x + 3, y + 1, 2);
      }
    }

    // blocks (and the coin waiting above each one not yet reached)
    const reached = f < START ? 0 : Math.floor((f - START) / HOP);
    for (let i = 0; i < BLOCKS; i++) {
      const x = sx(FIRST + i * GAP - 9);
      const y = TOPS[i];
      this.rect(x, y, 18, 14, 3);
      this.rect(x + 1, y + 1, 16, 12, 1);
      this.rect(x + 1, y + 1, 16, 2, 0);
      this.rect(x + 3, y + 6, 12, 1, 2);
      this.rect(x + 3, y + 9, 8, 1, 2);
      // coin above the next blocks; collected when the hero lands there
      if (i > 0 && i > reached) {
        const c = COIN[COIN_SPIN[(f >> 1) % 4]];
        const bob = Math.round(Math.sin((f + i * 3) / 3) * 2);
        this.sprite(c, x + 9 - c[0].length, y - 24 + bob, 2);
      }
      // a quick sparkle where a coin was just taken
      if (i > 0 && i === reached && f - (START + i * HOP) < 5 && f >= START + i * HOP) {
        this.sprite(SPARK, x + 1, y - 20, 2);
        this.sprite(SPARK, x + 12, y - 26, 2);
      }
    }

    // the safe on its pedestal
    const px = sx(FIRST + BLOCKS * GAP - 18);
    const py = TOPS[BLOCKS];
    this.rect(px, py, 36, 6, 3);
    this.rect(px + 1, py + 1, 34, 4, 1);
    this.sprite(SAFE, px + 22, py - 24, 2);
    const done = f >= END;
    if (done) {
      const t = f - END;
      // the key flies in, then the safe glows and a heart floats up
      if (t < 8) this.sprite(KEY, Math.round(h.x - cam - 6 + t * 3), py - 34 + t * 2, 2);
      if (t >= 8) {
        if ((t >> 1) % 2 === 0) {
          this.sprite(SPARK, px + 16, py - 34, 2);
          this.sprite(SPARK, px + 50, py - 30, 2);
        }
        this.sprite(HEART, px + 29, py - 40 - Math.min(18, t - 8), 2);
      }
    }

    // the hero, with its key on top until it hands it over
    const hx = Math.round(h.x - cam) - 10;
    const hy = Math.round(h.y) - 20;
    this.sprite(h.air ? HERO_JUMP : HERO, hx, hy, 2);
    if (!done) this.sprite(KEY, hx + 4, hy - 8, 2);

    // coin counter
    const got = Math.min(BLOCKS - 1, Math.max(0, reached));
    this.sprite(COIN[1], 6, 6);
    this.digit(16, 7, Math.floor(got / 10));
    this.digit(24, 7, got % 10);

    // fade out at the end of the loop and in at the start
    const fade = f < 6 ? 3 - (f >> 1) : f > LOOP - 8 ? Math.min(3, (f - (LOOP - 8)) >> 1) : 0;
    const d = this.img.data;
    for (let i = 0; i < W * H; i++) {
      const c = SOFT_LCD[Math.max(0, this.px[i] - fade)];
      d[i * 4] = c[0];
      d[i * 4 + 1] = c[1];
      d[i * 4 + 2] = c[2];
      d[i * 4 + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  private digit(x: number, y: number, n: number) {
    const g = DIGITS[n] ?? DIGITS[0];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === "3") this.rect(x + c * 2, y + r * 2, 2, 2, 3);
  }

  private set(x: number, y: number, v: number) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    this.px[y * W + x] = v;
  }

  private rect(x: number, y: number, w: number, h: number, v: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, v);
  }

  /** k: pixel size; the characters are drawn doubled so they read at website size */
  private sprite(s: Sprite, x: number, y: number, k = 1) {
    for (let j = 0; j < s.length; j++)
      for (let i = 0; i < s[j].length; i++) {
        const c = s[j][i];
        if (c !== "." && c !== " ") this.rect(x + i * k, y + j * k, k, k, c.charCodeAt(0) - 48);
      }
  }
}

export { FleaLoopLike as ChainLoop };
