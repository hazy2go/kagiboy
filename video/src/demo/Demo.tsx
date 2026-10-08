import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import vo from "../demo-vo.json";
import { Captions } from "../ui";
import { FPS, useFonts } from "../Pitch";
import { DEMO_SCENES, EndCard } from "./scenes";

// the technical demo: same voice, subtitles and music as the pitch, its own pacing
const LEAD = 0.45;
const TAIL = 0.9;
const END = 3;
// the opening title holds a moment before the voice; the Solana section ends on the explorer
const LEADS: Record<string, number> = { d1: 1.2 };
const EXTRA: Record<string, number> = { d5: 4.5 };

export const demoTimeline = () => {
  let at = 0;
  const parts = vo.map((v, i) => {
    const lead = LEADS[v.id] ?? LEAD;
    const dur = Math.round((lead + v.seconds + TAIL + (EXTRA[v.id] ?? 0)) * FPS);
    const p = { ...v, Scene: DEMO_SCENES[i], from: at, dur, lead };
    at += dur;
    return p;
  });
  return { parts, end: { from: at, dur: END * FPS }, total: at + END * FPS };
};

export function Demo() {
  useFonts();
  const { parts, end, total } = demoTimeline();
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      {parts.map(({ id, Scene, from, dur, cues, end: spoken, lead }) => (
        <Sequence key={id} from={from} durationInFrames={dur} name={id}>
          <Scene dur={dur} marks={cues.map((c) => ({ at: Math.round((lead + c.t) * FPS), text: c.text }))} />
          <Sequence from={Math.round(lead * FPS)}>
            <Audio src={staticFile(`demo-vo/${id}.wav`)} />
          </Sequence>
          <Captions cues={cues} from={Math.round(lead * FPS)} end={spoken} />
        </Sequence>
      ))}
      {/* "alright apothecary" by boipurple (trash kid), royalty free: lower than in the pitch, up on the end card */}
      <Audio
        src={staticFile("music-apothecary.m4a")}
        volume={(fr) => {
          const fadeIn = interpolate(fr, [0, 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const lift = interpolate(fr, [end.from - 20, end.from + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const fadeOut = interpolate(fr, [total - 45, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (0.06 + 0.16 * lift) * fadeIn * fadeOut;
        }}
      />
      <Sequence from={end.from} durationInFrames={end.dur} name="end">
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
}
