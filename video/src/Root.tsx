import { Composition } from "remotion";
import { FPS, Pitch, timeline } from "./Pitch";
import { AbsoluteFill } from "remotion";
import { Console } from "./Three";
import { Glow } from "./ui";

function Test3D() {
  return (
    <AbsoluteFill>
      <Glow />
      <Console screens={["09-home"]} shot={{ p: (t) => Math.min(1, t / 10), screen: () => "09-home" }} />
    </AbsoluteFill>
  );
}

export function Root() {
  return (
    <>
      <Composition id="Pitch" component={Pitch} durationInFrames={timeline().total} fps={FPS} width={1920} height={1080} />
      <Composition id="Test3D" component={Test3D} durationInFrames={300} fps={FPS} width={1920} height={1080} />
    </>
  );
}
