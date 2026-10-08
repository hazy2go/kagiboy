import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import vo from "../demo-vo2.json";
import { Captions } from "../ui";
import { FPS, useFonts } from "../Pitch";
import { DEMO_SCENES, EndCard } from "./scenes";

// The voice is ONE continuous take (scripts/build_demo_vo.py): scenes cut in the pauses between its
// sections, and only two silences are added, the explosion before the first word and a beat on the
// explorer after "here it is, live on devnet".
const LEAD = 1.2; // the opener moves before the voice comes in
const HOLD_AFTER = "d5"; // the explorer gets the screen to itself for a moment
const HOLD = 4.0;
const TAIL = 1.0;
const END = 3;

export const demoTimeline = () => {
  const secs = vo.sections;
  const k = secs.findIndex((s) => s.id === HOLD_AFTER);
  // the hold sits in the pause after that section
  const cut = (secs[k].end + secs[k + 1].start) / 2;
  const v = (a: number) => LEAD + a + (a >= cut ? HOLD : 0); // voice time → video seconds
  const bounds = secs.map((s, i) => (i === 0 ? 0 : v((secs[i - 1].end + s.start) / 2)));
  const last = v(secs[secs.length - 1].end) + TAIL;
  const parts = secs.map((s, i) => {
    const from = Math.round(bounds[i] * FPS);
    const to = Math.round((i + 1 < secs.length ? bounds[i + 1] : last) * FPS);
    const start = from / FPS;
    return {
      id: s.id,
      Scene: DEMO_SCENES[i],
      from,
      dur: to - from,
      cues: s.cues.map((c) => ({ t: v(c.t) - start, text: c.text })),
      end: v(s.end) - start,
    };
  });
  const endFrom = Math.round(last * FPS);
  return { parts, cut, end: { from: endFrom, dur: END * FPS }, total: endFrom + END * FPS };
};

export function Demo() {
  useFonts();
  const { parts, cut, end, total } = demoTimeline();
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      {parts.map(({ id, Scene, from, dur, cues, end: spoken }) => (
        <Sequence key={id} from={from} durationInFrames={dur} name={id}>
          <Scene dur={dur} marks={cues.map((c) => ({ at: Math.round(c.t * FPS), text: c.text }))} />
          <Captions cues={cues} from={0} end={spoken} />
        </Sequence>
      ))}
      {/* the voice, in one piece, parted once for the explorer's beat */}
      <Sequence from={Math.round(LEAD * FPS)} durationInFrames={Math.round(cut * FPS)} name="voice">
        <Audio src={staticFile("demo-vo/voice.wav")} />
      </Sequence>
      <Sequence from={Math.round((LEAD + cut + HOLD) * FPS)} name="voice, after the beat">
        <Audio src={staticFile("demo-vo/voice.wav")} trimBefore={Math.round(cut * FPS)} />
      </Sequence>
      {/* "alright apothecary" by boipurple (trash kid), royalty free: low under the voice, up in the beat and on the end card */}
      <Audio
        src={staticFile("music-apothecary.m4a")}
        volume={(fr) => {
          const c = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
          const beat = Math.round((LEAD + cut) * FPS);
          const fadeIn = interpolate(fr, [0, 45], [0, 1], c);
          const lift = Math.max(interpolate(fr, [end.from - 20, end.from + 20], [0, 1], c), interpolate(fr, [beat, beat + 20, beat + HOLD * FPS - 25, beat + HOLD * FPS], [0, 0.7, 0.7, 0], c));
          const fadeOut = interpolate(fr, [total - 45, total], [1, 0], c);
          return (0.06 + 0.16 * lift) * fadeIn * fadeOut;
        }}
      />
      <Sequence from={end.from} durationInFrames={end.dur} name="end">
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
}
