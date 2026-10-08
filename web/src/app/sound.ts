import { session } from "../demo/session";

/**
 * A soft two-step square blip on taps, a small nod to the Game Boy's menu sound. Silent when muted.
 * It plays through the session's own audio context, which is set up as "playback" so iOS doesn't
 * mute it with the silent switch (a second context made here first would leave the page muted).
 */
export function blip(muted: boolean, hz = 1046) {
  if (muted) return;
  const ctx = session.sharedAudio();
  if (!ctx) return;
  try {
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
