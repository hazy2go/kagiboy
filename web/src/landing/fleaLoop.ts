/**
 * "How it started", as a Game Boy would show it: a kid walks past flea-market stalls, spots a
 * Game Boy on a table, holds it up, and the music starts. Original pixel art in the site's four
 * soft LCD tones, drawn at the real 160x144 resolution. Not a game, just a loop.
 */
import { SOFT_LCD } from "../emu/palette";

const W = 160;
const H = 144;
const GROUND = 112;
const FPS = 12;
const KID_X = 40;
/** world x of the stall with the Game Boy; the walk ends in front of it */
const GB_STALL = 330;
const STALL_GAP = 66;

type Sprite = string[];

// '.' transparent, 0..3 shade (0 = paper, 3 = ink)
const KID_WALK: Sprite[] = [
  [
    "...3333...",
    "..333333..",
    ".33333333.",
    "..300303..",
    "..300003..",
    "...3003...",
    "...2222...",
    "..222222..",
    ".22222222.",
    ".3.2222.3.",
    "...2222...",
    "...1111...",
    "...1..1...",
    "..3....3..",
    "..3....3..",
    ".33....33.",
  ],
  [
    "...3333...",
    "..333333..",
    ".33333333.",
    "..300303..",
    "..300003..",
    "...3003...",
    "...2222...",
    "..222222..",
    "..222222..",
    "..32222.3.",
    "...2222...",
    "...1111...",
    "...1..1...",
    "...3..3...",
    "...3..3...",
    "..33..33..",
  ],
];

const KID_HOLD: Sprite = [
  ".3......3.",
  ".3.3333.3.",
  ".33333333.",
  ".33333333.",
  "..300303..",
  "..300003..",
  "...3003...",
  "...2222...",
  "..222222..",
  "..222222..",
  "...2222...",
  "...1111...",
  "...1..1...",
  "...3..3...",
  "...3..3...",
  "..33..33..",
];

const MINI_GB: Sprite = [
  "3333333",
  "3111113",
  "3133313",
  "3133313",
  "3111113",
  "3313113",
  "3111313",
  "3333333",
];

const NOTE: Sprite = ["..33", "..3.", "..3.", "333.", "333."];
const BANG: Sprite = ["33", "33", "33", "..", "33"];
const SPARK: Sprite = [".2.", "222", ".2."];

/** what's for sale on each stall, by index; the Game Boy stall is drawn separately */
const WARES: Sprite[][] = [
  [
    ["3333", "3113", "3113", "3333"],
    [".33.", "3223", "3223", "3223", ".33."],
  ],
  [
    ["333333", "322223", "333333"],
    ["33", "33", "33", "33"],
  ],
  [
    [".222.", "21112", "21112", ".222."],
    ["3333", "3..3", "3333"],
  ],
];

export class FleaLoop {
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

  /** A single still: holding the Game Boy up, notes in the air (reduced motion, first paint). */
  still() {
    this.frame = 128;
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

  // ---------- drawing ----------

  private render() {
    const f = this.frame;
    // walk, stop, spot it, hold it up, music, fade out and round again
    const walkEnd = 70;
    const cam = Math.min(f, walkEnd) * ((GB_STALL - KID_X - 8) / walkEnd);
    this.px.fill(0);

    this.clouds(f);
    this.bunting(cam);
    this.ground(cam);
    for (let i = 0; i * STALL_GAP < GB_STALL + 200; i++) {
      const wx = 20 + i * STALL_GAP;
      if (Math.abs(wx - GB_STALL) < STALL_GAP / 2) continue;
      this.stall(Math.round(wx - cam), i);
    }
    const gbStallX = Math.round(GB_STALL - cam);
    this.stall(gbStallX, -1);

    const held = f >= 92;
    if (!held) this.sprite(MINI_GB, gbStallX + 18, GROUND - 32, 2);

    const kidY = GROUND - 32;
    if (f < walkEnd) this.sprite(KID_WALK[(f >> 1) & 1], KID_X, kidY, 2);
    else if (!held) this.sprite(KID_WALK[1], KID_X, kidY, 2);
    else {
      this.sprite(KID_HOLD, KID_X, kidY, 2);
      this.sprite(MINI_GB, KID_X + 3, kidY - 17, 2);
    }

    // it's the one: a "!" pops up, then the music starts
    if (f >= 74 && f < 92 && (f >> 1) % 2 === 0) this.sprite(BANG, KID_X + 8, kidY - 14, 2);
    if (held) {
      for (let n = 0; n < 4; n++) {
        const t = f - 96 - n * 7;
        if (t < 0 || t > 40) continue;
        const nx = KID_X + 6 + Math.round(Math.sin((t + n * 5) / 4) * 6) + (n % 2 ? 18 : -10);
        this.sprite(NOTE, nx, kidY - 24 - t, 2);
      }
      if ((f >> 2) % 2 === 0) {
        this.sprite(SPARK, KID_X - 10, kidY - 20, 2);
        this.sprite(SPARK, KID_X + 24, kidY - 10, 2);
      }
    }

    // fade the scene out at the end of the loop and in at the start, like a cartridge boot
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

  private set(x: number, y: number, v: number) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    this.px[y * W + x] = v;
  }

  private rect(x: number, y: number, w: number, h: number, v: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, v);
  }

  /** k: pixel size; the kid and what he holds are drawn doubled so they read at website size */
  private sprite(s: Sprite, x: number, y: number, k = 1) {
    for (let j = 0; j < s.length; j++)
      for (let i = 0; i < s[j].length; i++) {
        const c = s[j][i];
        if (c !== ".") this.rect(x + i * k, y + j * k, k, k, c.charCodeAt(0) - 48);
      }
  }

  private clouds(f: number) {
    // slow clouds, independent of the walk
    for (const [x0, y, w] of [
      [10, 14, 22],
      [92, 26, 16],
      [140, 10, 26],
    ]) {
      const x = Math.round(((x0 - f * 0.25) % (W + 40) + W + 40) % (W + 40)) - 30;
      this.rect(x + 3, y, w - 6, 1, 1);
      this.rect(x, y + 1, w, 3, 1);
    }
  }

  private bunting(cam: number) {
    // a string of little flags across the market, sagging between poles
    const off = Math.round(cam * 0.6);
    for (let x = 0; x < W; x++) {
      const wx = x + off;
      const y = 40 + Math.round(4 * Math.sin(((wx % 80) / 80) * Math.PI));
      this.set(x, y, 2);
      if (wx % 10 === 0) {
        const shade = (wx / 10) % 2 ? 1 : 2;
        for (let k = 0; k < 4; k++) this.rect(x + k, y + 1, 1, 4 - k, shade);
      }
    }
  }

  private ground(cam: number) {
    this.rect(0, GROUND, W, 1, 3);
    this.rect(0, GROUND + 1, W, H - GROUND - 1, 1);
    for (let x = 0; x < W; x++) {
      const wx = x + Math.round(cam);
      if (wx % 13 === 0) this.set(x, GROUND + 6, 2);
      if (wx % 17 === 5) this.set(x, GROUND + 14, 2);
      if (wx % 23 === 11) this.set(x, GROUND + 24, 2);
    }
  }

  private stall(x: number, i: number) {
    if (x < -50 || x > W + 10) return;
    const top = GROUND - 48;
    // striped awning with a scalloped edge
    for (let k = 0; k < 44; k++) this.rect(x - 2 + k, top, 1, 8, Math.floor(k / 4) % 2 ? 0 : 2);
    this.rect(x - 2, top - 1, 44, 1, 3);
    for (let k = 0; k < 44; k += 4) this.rect(x - 1 + k, top + 8, 2, 1, Math.floor(k / 4) % 2 ? 0 : 2);
    // posts and table
    this.rect(x, top + 8, 1, GROUND - top - 8, 3);
    this.rect(x + 39, top + 8, 1, GROUND - top - 8, 3);
    this.rect(x, GROUND - 16, 40, 1, 3);
    this.rect(x + 1, GROUND - 15, 38, 6, 2);
    if (i < 0) return;
    const wares = WARES[i % WARES.length];
    this.sprite(wares[0], x + 6, GROUND - 16 - wares[0].length);
    this.sprite(wares[1], x + 24, GROUND - 16 - wares[1].length);
  }
}

const LOOP = 170;
