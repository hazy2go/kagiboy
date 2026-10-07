import { useSyncExternalStore } from "react";
import { CartChip, type Persisted, type Storage } from "../chip/chip";
import { GameBoy, SOFT_LCD, type Key } from "../emu/gameboy";
import { Phone } from "../phone/phone";

const STORE_KEY = "kagiboy.secure-element";

// Demo only: the "secure element" is localStorage, and it holds testnet keys.
const browserStorage: Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? (JSON.parse(raw) as Persisted) : null;
    } catch {
      return null;
    }
  },
  save(p) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(p));
    } catch {
      /* private mode: the wallet just won't survive a reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
  },
};

const FRAME_MS = 1000 / 59.7275;

function readMuted() {
  try {
    return localStorage.getItem("kagiboy.muted") === "1";
  } catch {
    return false;
  }
}

/** Owns the emulator loop and the three parts: Game Boy, cartridge chip, phone. */
export class Session {
  readonly chip = new CartChip(browserStorage);
  readonly phone = new Phone(this.chip);
  private gb: GameBoy | null = null;
  private rom: Uint8Array | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private image: ImageData | null = null;
  private raf = 0;
  private last = 0;
  private debt = 0;
  private balanceTimer = 0;
  private version = 0;
  private frameCount = 0;
  private pressedAt = new Map<Key, number>();
  private releaseAt = new Map<Key, number>();
  private listeners = new Set<() => void>();
  powered = false;
  /** Called after each drawn frame, e.g. to refresh a 3D screen texture. */
  onFrame: (() => void) | null = null;
  muted = readMuted();
  private audio: AudioContext | null = null;

  constructor() {
    const bump = () => {
      this.version++;
      for (const fn of this.listeners) fn();
    };
    this.chip.subscribe(bump);
    this.phone.subscribe(bump);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getVersion = () => this.version;

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d")!;
    this.image = ctx.createImageData(160, 144);
    if (!this.powered) {
      ctx.fillStyle = "#c3ccb8";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  async powerOn() {
    this.rom ??= new Uint8Array(await (await fetch("/wallet.gb")).arrayBuffer());
    this.gb = new GameBoy(this.rom);
    this.gb.onBeep = (hz) => this.beep(hz);
    // created inside the click that powers on, so browsers allow it to play
    this.audio ??= typeof AudioContext === "undefined" ? null : new AudioContext();
    this.pressedAt.clear();
    this.releaseAt.clear();
    this.chip.reset();
    this.phone.clearBalances();
    this.powered = true;
    this.last = performance.now();
    this.debt = 0;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    clearInterval(this.balanceTimer);
    this.balanceTimer = window.setInterval(() => this.phone.refreshBalances(), 15000);
    this.notify();
  }

  powerOff() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.balanceTimer);
    this.gb = null;
    this.powered = false;
    this.chip.reset();
    this.phone.clearBalances();
    const ctx = this.canvas?.getContext("2d");
    if (ctx && this.canvas) {
      ctx.fillStyle = "#c3ccb8"; // an unlit LCD
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.onFrame?.();
    }
    this.notify();
  }

  /** The demo page left the screen: stop the emulator and the balance polling, keep the state. */
  suspend() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.balanceTimer);
    this.releaseAll();
  }

  resume() {
    if (!this.gb) return;
    this.last = performance.now();
    this.debt = 0;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    clearInterval(this.balanceTimer);
    this.balanceTimer = window.setInterval(() => this.phone.refreshBalances(), 15000);
  }

  /** Window lost focus: let go of everything, so a held A can't finish a sign by itself. */
  releaseAll() {
    if (!this.gb) return;
    for (const k of ["UP", "DOWN", "LEFT", "RIGHT", "A", "B", "SELECT", "START"] as Key[]) this.gb.setKey(k, false);
    this.pressedAt.clear();
    this.releaseAt.clear();
  }

  /** Taps are held for at least 3 frames, or the ROM (which polls once per frame) would miss them. */
  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem("kagiboy.muted", this.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    this.notify();
  }

  private beep(hz: number) {
    const ctx = this.audio;
    if (!ctx || this.muted || !(hz > 20 && hz < 20000)) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  key(key: Key, down: boolean) {
    if (!this.gb) return;
    if (down) {
      this.releaseAt.delete(key);
      if (!this.pressedAt.has(key)) this.pressedAt.set(key, this.frameCount);
      this.gb.setKey(key, true);
      return;
    }
    const since = this.pressedAt.get(key);
    if (since === undefined) return;
    this.pressedAt.delete(key);
    if (this.frameCount - since >= 3) this.gb.setKey(key, false);
    else this.releaseAt.set(key, since + 3);
  }

  private loop = (now: number) => {
    const gb = this.gb;
    if (!gb) return;
    // keep real Game Boy speed on 60, 120 and 144 Hz displays
    this.debt = Math.min(this.debt + (now - this.last), FRAME_MS * 4);
    this.last = now;
    const before = this.chip.state;
    while (this.debt >= FRAME_MS) {
      gb.frame();
      this.chip.tick(gb);
      this.frameCount++;
      for (const [k, at] of this.releaseAt) {
        if (this.frameCount >= at) {
          gb.setKey(k, false);
          this.releaseAt.delete(k);
        }
      }
      this.debt -= FRAME_MS;
    }
    if (before !== "unlocked" && this.chip.state === "unlocked") this.phone.refreshBalances();
    if (before === "unlocked" && this.chip.state !== "unlocked") this.phone.clearBalances();
    if (this.canvas && this.image) {
      gb.draw(this.image.data, SOFT_LCD);
      this.canvas.getContext("2d")!.putImageData(this.image, 0, 0);
      this.onFrame?.();
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private notify() {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}

export const session = new Session();

// lets the headless e2e script drive the phone side
if (import.meta.env.DEV) (window as unknown as { __session: Session }).__session = session;

/** Re-render whenever the chip, phone or power state changes. */
export function useSession() {
  useSyncExternalStore(session.subscribe, session.getVersion);
  return session;
}
