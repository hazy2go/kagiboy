// Thin wrapper over the GameBoy-Online core that ships inside `serverboy`.
// We drive the core directly: serverboy's own wrapper uses Node's `process`.
// @ts-expect-error untyped CommonJS
import GameBoyCore from "serverboy/src/gameboy_core/gameboy.js";
// @ts-expect-error untyped CommonJS
import settings from "serverboy/src/gameboy_core/settings.js";
import type { Bus } from "../chip/protocol";
import { DMG } from "./palette";

settings[0] = false; // no audio backend
settings[1] = false; // skip the boot ROM
settings[6] = 1000 / 59.7275; // run exactly one LCD frame per frame() call (default is 8 ms)

export const KEY = { RIGHT: 0, LEFT: 1, UP: 2, DOWN: 3, A: 4, B: 5, SELECT: 6, START: 7 } as const;
export type Key = keyof typeof KEY;

export const WIDTH = 160;
export const HEIGHT = 144;

// the palettes live in their own small module, so pages that only draw pixel art don't load the emulator
export { DMG, SOFT_LCD } from "./palette";

interface Core {
  memory: Uint8Array;
  canvasBuffer: { data: Uint8ClampedArray };
  frameDone: boolean;
  stopEmulator: number;
  iterations: number;
  openMBC: () => number[];
  graphicsBlit: () => void;
  start(): void;
  run(): void;
  JoyPadEvent(key: number, down: boolean): void;
  memoryHighWriter: WriteFn[];
  memoryWriter: WriteFn[];
}

type WriteFn = (core: Core, address: number, data: number) => void;

export class GameBoy implements Bus {
  private core: Core;

  constructor(rom: Uint8Array) {
    this.core = new GameBoyCore(Array.from(rom)) as Core;
    this.core.openMBC = () => [];
    this.core.graphicsBlit = () => {}; // we read canvasBuffer directly
    this.core.start();
    this.core.stopEmulator &= 1;
    this.core.iterations = 0;
    this.tapSquare1();
  }

  /** Called with a frequency in Hz whenever the ROM triggers square channel 1. */
  onBeep: ((hz: number) => void) | null = null;

  // The core's own audio is off, so watch channel 1's frequency and trigger registers instead.
  private tapSquare1() {
    let lo = 0;
    const wrap = (index: number, high: number, after: (data: number) => void) => {
      const original = this.core.memoryHighWriter[index];
      const wrapped: WriteFn = (core, address, data) => {
        original(core, address, data);
        after(data);
      };
      this.core.memoryHighWriter[index] = wrapped;
      this.core.memoryWriter[high] = wrapped;
    };
    wrap(0x13, 0xff13, (data) => (lo = data));
    wrap(0x14, 0xff14, (data) => {
      if (!(data & 0x80)) return; // not a trigger
      const x = ((data & 7) << 8) | lo;
      this.onBeep?.(131072 / (2048 - x));
    });
  }

  frame() {
    this.core.frameDone = false;
    while (!this.core.frameDone) this.core.run();
  }

  setKey(key: Key, down: boolean) {
    this.core.JoyPadEvent(KEY[key], down);
  }

  read(addr: number) {
    return this.core.memory[addr];
  }

  write(addr: number, value: number) {
    this.core.memory[addr] = value;
  }

  /** RGBA pixels, recoloured to a 4-tone palette (DMG greens by default). */
  draw(into: Uint8ClampedArray, palette: number[][] = DMG) {
    const src = this.core.canvasBuffer.data;
    for (let i = 0; i < src.length; i += 4) {
      const lum = src[i] * 0.3 + src[i + 1] * 0.59 + src[i + 2] * 0.11;
      const c = palette[lum > 200 ? 0 : lum > 130 ? 1 : lum > 60 ? 2 : 3];
      into[i] = c[0];
      into[i + 1] = c[1];
      into[i + 2] = c[2];
      into[i + 3] = 255;
    }
  }
}
