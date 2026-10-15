import { useSyncExternalStore } from "react";
import { CartChip, type Persisted, type Storage } from "../chip/chip";
import { GameBoy, SOFT_LCD, type Key } from "../emu/gameboy";
import { Phone } from "../phone/phone";
import { connectCartridge, type Cartridge } from "../chip/ble";
import type { PhoneChip } from "../chip/link";

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
  /** the cartridge chip in the browser, behind the emulated Game Boy */
  readonly sim = new CartChip(browserStorage);
  /** what the phone app talks to: `sim`, or a real cartridge over Bluetooth */
  chip: PhoneChip = this.sim;
  phone = new Phone(this.sim);
  /** a real cartridge, while one is connected */
  cartridge: Cartridge | null = null;
  private unsubs: (() => void)[] = [];
  private shownState: PhoneChip["state"] = "none";
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
    this.watch();
  }

  /** Re-render on any change of the chip or phone the app is using; balances follow the lock state. */
  private watch() {
    for (const u of this.unsubs) u();
    const bump = () => {
      const st = this.chip.state;
      // a real cartridge: balances follow its lock state here (the emulator loop does it for the browser chip)
      if (this.chip !== this.sim && st !== this.shownState) {
        if (st === "unlocked") this.phone.refreshBalances();
        else if (this.shownState === "unlocked") this.phone.clearBalances();
        this.shownState = st;
      }
      this.version++;
      for (const fn of this.listeners) fn();
    };
    this.unsubs = [this.chip.subscribe(bump), this.phone.subscribe(bump)];
  }

  /** Switches the app to a real cartridge over Bluetooth (the emulated Game Boy goes off). */
  async connectCartridge() {
    const cart = await connectCartridge();
    if (this.powered) this.powerOff();
    this.cartridge = cart;
    this.chip = cart.chip;
    this.phone = new Phone(cart.chip);
    this.shownState = "none";
    this.watch();
    this.powered = true;
    clearInterval(this.balanceTimer);
    this.balanceTimer = window.setInterval(() => !document.hidden && this.phone.refreshBalances(), 15000);
    cart.onGone = () => this.dropCartridge();
    this.notify();
    this.phone.refreshBalances();
  }

  /** Back to the cartridge in the browser (the link dropped, or the owner disconnected). */
  dropCartridge() {
    if (!this.cartridge) return;
    const cart = this.cartridge;
    this.cartridge = null;
    cart.onGone = null;
    cart.disconnect();
    clearInterval(this.balanceTimer);
    this.chip = this.sim;
    this.phone = new Phone(this.sim);
    this.shownState = this.sim.state;
    this.watch();
    this.powered = false;
    this.notify();
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

  /**
   * Safari only lets audio start inside the tap or key press itself (not after an await), and on iOS
   * web audio follows the silent switch unless the page declares itself as playback, like a media app.
   */
  /** The one audio context for the page (Game Boy beeps and the app's taps), unlocked inside the gesture. */
  sharedAudio(): AudioContext | null {
    this.unlockAudio();
    return this.audio;
  }

  private unlockAudio() {
    if (typeof AudioContext === "undefined") return;
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
    this.audio ??= new AudioContext();
    if (this.audio.state !== "running") this.audio.resume().catch(() => {});
  }

  async powerOn() {
    this.dropCartridge();
    this.unlockAudio(); // before the await below, while we're still inside the click
    this.rom ??= new Uint8Array(await (await fetch("/wallet.gb")).arrayBuffer());
    this.gb = new GameBoy(this.rom);
    this.gb.onBeep = (hz) => this.beep(hz);
    this.pressedAt.clear();
    this.releaseAt.clear();
    this.sim.reset();
    this.phone.clearBalances();
    this.powered = true;
    this.last = performance.now();
    this.debt = 0;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
    clearInterval(this.balanceTimer);
    this.balanceTimer = window.setInterval(() => !document.hidden && this.phone.refreshBalances(), 15000);
    this.notify();
  }

  powerOff() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.balanceTimer);
    this.gb = null;
    this.powered = false;
    this.sim.reset();
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
    this.balanceTimer = window.setInterval(() => !document.hidden && this.phone.refreshBalances(), 15000);
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
    if (!this.muted) this.unlockAudio();
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
      if (this.audio?.state !== "running") this.unlockAudio(); // every press is a gesture Safari accepts
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
    const before = this.sim.state;
    while (this.debt >= FRAME_MS) {
      gb.frame();
      this.sim.tick(gb);
      this.frameCount++;
      for (const [k, at] of this.releaseAt) {
        if (this.frameCount >= at) {
          gb.setKey(k, false);
          this.releaseAt.delete(k);
        }
      }
      this.debt -= FRAME_MS;
    }
    if (before !== "unlocked" && this.sim.state === "unlocked") this.phone.refreshBalances();
    if (before === "unlocked" && this.sim.state !== "unlocked") this.phone.clearBalances();
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
