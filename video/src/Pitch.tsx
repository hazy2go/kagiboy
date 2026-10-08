import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile } from "remotion";
import { useEffect, useState } from "react";
import vo from "./vo.json";
import { Captions } from "./ui";
import { Next, Proof, Who } from "./scenes";
import { Apart, Drawer, Feel, Finale, Memory, Present, Reveal } from "./scenes2";

export const FPS = 30;
const LEAD = 0.5; // seconds of picture before each voice line
const TAIL = 1.4; // and after
const END = 5;
const SCENES = [Memory, Present, Drawer, Reveal, Feel, Proof, Apart, Who, Next];
// a shot needs a minimum length to play out, however short its line (seconds)
const MIN: Record<string, number> = { s3: 6.5 };

/** Scene lengths follow the voiceover (src/vo.json, re-measured when the real recording lands). */
export const timeline = () => {
  let at = 0;
  const parts = vo.map((v, i) => {
    const dur = Math.round(Math.max(LEAD + v.seconds + TAIL, MIN[v.id] ?? 0) * FPS);
    const p = { ...v, Scene: SCENES[i], from: at, dur };
    at += dur;
    return p;
  });
  return { parts, end: { from: at, dur: END * FPS }, total: at + END * FPS };
};

function useFonts() {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const faces = [
      new FontFace("Funnel Display", `url(${staticFile("fonts/FunnelDisplay-latin.woff2")})`, { weight: "400 800" }),
      new FontFace("Funnel Sans", `url(${staticFile("fonts/FunnelSans-latin.woff2")})`, { weight: "300 800" }),
      new FontFace("Pixel Operator", `url(${staticFile("fonts/PixelOperator8.ttf")})`),
    ];
    Promise.all(faces.map((f) => f.load().then((ff) => document.fonts.add(ff)))).then(() => continueRender(handle));
  }, [handle]);
}

export function Pitch() {
  useFonts();
  const { parts, end, total } = timeline();
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      {parts.map(({ id, Scene, from, dur, seconds, text }) => (
        <Sequence key={id} from={from} durationInFrames={dur} name={id}>
          <Scene dur={dur} />
          <Sequence from={Math.round(LEAD * FPS)}>
            <Audio src={staticFile(`vo/${id}.wav`)} />
          </Sequence>
          <Captions text={text} from={Math.round(LEAD * FPS)} seconds={seconds} />
        </Sequence>
      ))}
      {/* "Sweet September" (Mixkit, free license): in under the memories, low under the voice, up on the end card */}
      <Sequence from={45} name="music">
        <Audio
          src={staticFile("music-bed.mp3")}
          volume={(fr) => {
            const at = fr + 45;
            const fadeIn = interpolate(at, [45, 135], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const lift = interpolate(at, [end.from, end.from + 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const fadeOut = interpolate(at, [total - 45, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (0.13 + 0.17 * lift) * fadeIn * fadeOut;
          }}
        />
      </Sequence>
      <Sequence from={end.from} durationInFrames={end.dur} name="end">
        <Finale />
      </Sequence>
    </AbsoluteFill>
  );
}
