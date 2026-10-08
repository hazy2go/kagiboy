import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from "remotion";
import vo from "../demo-vo2.json";
import { Captions } from "../ui";
import { FPS, useFonts } from "../Pitch";
import { DEMO_SCENES, EndCard } from "./scenes";

// The voice is ONE continuous take (scripts/build_demo_vo.py): scenes cut in the pauses between its
// sections, and only two silences are added, the explosion before the first word and a beat on the
// explorer after "here it is, live on devnet".
const LEAD = 1.2; // the opener moves before the voice comes in
// moments the picture gets to itself: the exploded view's labels, and the explorer
const HOLDS: Record<string, number> = { d0: 2.2, d5: 4.0 };
const TAIL = 1.0;
const END = 3;

export const demoTimeline = () => {
  const secs = vo.sections as { id: string; start: number; end: number; cut?: number; cues: { t: number; text: string }[] }[];
  // where section i hands over: a point inside a pause verified in the audio (scripts/pace.py)
  const handover = (i: number) => secs[i].cut ?? (secs[i - 1].end + secs[i].start) / 2;
  // each hold sits in the pause after its section
  const holds = secs.flatMap((s, i) => (HOLDS[s.id] && secs[i + 1] ? [{ at: handover(i + 1), len: HOLDS[s.id] }] : []));
  const v = (a: number) => LEAD + a + holds.reduce((sum, h) => sum + (a >= h.at ? h.len : 0), 0); // voice time → video seconds
  const bounds = secs.map((_, i) => (i === 0 ? 0 : v(handover(i))));
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
  return { parts, holds, v, end: { from: endFrom, dur: END * FPS }, total: endFrom + END * FPS };
};

export function Demo() {
  useFonts();
  const { parts, holds, v, end, total } = demoTimeline();
  // the voice in pieces, one per stretch between holds, each starting where the video has got to
  const cuts = [0, ...holds.map((h) => h.at), vo.seconds];
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      {parts.map(({ id, Scene, from, dur, cues, end: spoken }) => (
        <Sequence key={id} from={from} durationInFrames={dur} name={id}>
          <Scene dur={dur} marks={cues.map((c) => ({ at: Math.round(c.t * FPS), text: c.text }))} />
          <Captions cues={cues} from={0} end={spoken} />
        </Sequence>
      ))}
      {/* the voice: one take, parted only at the holds */}
      {cuts.slice(0, -1).map((a, i) => (
        <Sequence key={i} from={Math.round(v(a) * FPS)} durationInFrames={Math.round((cuts[i + 1] - a) * FPS)} name={`voice ${i + 1}`}>
          <Audio src={staticFile("demo-vo/voice.wav")} trimBefore={Math.round(a * FPS)} />
        </Sequence>
      ))}
      {/* "alright apothecary" by boipurple (trash kid), royalty free: low under the voice, up in the beat and on the end card */}
      <Audio
        src={staticFile("music-apothecary.m4a")}
        volume={(fr) => {
          const c = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
          const fadeIn = interpolate(fr, [0, 45], [0, 1], c);
          // up a little in each hold, and on the end card
          const inHold = Math.max(
            0,
            ...holds.map((h) => {
              const b = Math.round((v(h.at) - h.len) * FPS);
              return interpolate(fr, [b, b + 20, b + h.len * FPS - 25, b + h.len * FPS], [0, 0.7, 0.7, 0], c);
            }),
          );
          const lift = Math.max(interpolate(fr, [end.from - 20, end.from + 20], [0, 1], c), inHold);
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
