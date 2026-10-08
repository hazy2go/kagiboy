/** A soft two-step square blip on taps, a small nod to the Game Boy's menu sound. Silent when muted. */
let ctx: AudioContext | null = null;

export function blip(muted: boolean, hz = 1046) {
  if (muted || typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(hz, t);
    o.frequency.setValueAtTime(hz * 1.5, t + 0.035);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.1);
  } catch {
    /* no audio: fine */
  }
}
