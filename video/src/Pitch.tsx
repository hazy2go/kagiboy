import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile } from "remotion";
import { useEffect, useState } from "react";
import vo from "./vo.json";
import { Captions } from "./ui";
import { End, Flea, How, Idea, Inside, Next, Problem, Proof, Who } from "./scenes";

export const FPS = 30;
const LEAD = 0.5; // seconds of picture before each voice line
const TAIL = 0.9; // and after
const END = 5;
const SCENES = [Flea, Problem, Idea, How, Proof, Inside, Who, Next];

/** Scene lengths follow the voiceover (src/vo.json, re-measured when the real recording lands). */
export const timeline = () => {
  let at = 0;
  const parts = vo.map((v, i) => {
    const dur = Math.round((LEAD + v.seconds + TAIL) * FPS);
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
  const { parts, end } = timeline();
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
      <Sequence from={end.from} durationInFrames={end.dur} name="end">
        <End />
      </Sequence>
    </AbsoluteFill>
  );
}
