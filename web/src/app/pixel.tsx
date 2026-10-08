/**
 * The app's Game Boy touches: hand-drawn 12x12 pixel icons (crisp at any size) and a short
 * square-wave blip for taps, like the console's own menu sound.
 */

const ICONS = {
  send: [
    ".....##.....",
    "....####....",
    "...######...",
    "..##.##.##..",
    ".....##.....",
    ".....##.....",
    ".....##.....",
    ".....##.....",
    "............",
    "..########..",
    "..########..",
    "............",
  ],
  receive: [
    ".....##.....",
    ".....##.....",
    ".....##.....",
    ".....##.....",
    "..##.##.##..",
    "...######...",
    "....####....",
    ".....##.....",
    "............",
    "..##....##..",
    "..########..",
    "............",
  ],
  swap: [
    "...#........",
    "..##........",
    ".##########.",
    "..##........",
    "...#........",
    "............",
    "............",
    "........#...",
    "........##..",
    ".##########.",
    "........##..",
    "........#...",
  ],
  wallet: [
    "............",
    ".########...",
    ".#......##..",
    ".##########.",
    ".#........#.",
    ".#........#.",
    ".#.....####.",
    ".#.....#.##.",
    ".#.....####.",
    ".#........#.",
    ".##########.",
    "............",
  ],
  activity: [
    ".##########.",
    ".#........#.",
    ".#.######.#.",
    ".#........#.",
    ".#.####...#.",
    ".#........#.",
    ".#.######.#.",
    ".#........#.",
    ".#.###....#.",
    ".#........#.",
    ".#.#.#.#.##.",
    "..#.#.#.#...",
  ],
  cartridge: [
    ".######.....",
    ".#....##....",
    ".#.....##...",
    ".#.######.#.",
    ".#.#....#.#.",
    ".#.#....#.#.",
    ".#.#....#.#.",
    ".#.######.#.",
    ".#........#.",
    ".#.#.#.#..#.",
    ".##########.",
    "............",
  ],
  copy: [
    "............",
    "...#######..",
    "...#.....#..",
    ".#######.#..",
    ".#.....#.#..",
    ".#.....#.#..",
    ".#.....#.#..",
    ".#.....###..",
    ".#.....#....",
    ".#######....",
    "............",
    "............",
  ],
  key: [
    "............",
    "...######...",
    "..#......#..",
    "..#.####.#..",
    "..#......#..",
    "...######...",
    ".....##.....",
    ".....##.....",
    ".....####...",
    ".....##.....",
    ".....###....",
    "............",
  ],
} as const;

export type PixelName = keyof typeof ICONS;

export function PixelIcon({ name, size = 22, className }: { name: PixelName; size?: number; className?: string }) {
  const rows = ICONS[name];
  return (
    <svg className={`px-icon ${className ?? ""}`} width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill="currentColor" /> : null)),
      )}
    </svg>
  );
}

let ctx: AudioContext | null = null;

/** A soft two-step square blip (the Game Boy's menu tick). Silent when the user muted the console. */
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
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.1);
  } catch {
    /* no audio: fine */
  }
  navigator.vibrate?.(8);
}
