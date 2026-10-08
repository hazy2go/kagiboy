import { Composition } from "remotion";
import { FPS, Pitch, timeline } from "./Pitch";

export function Root() {
  return <Composition id="Pitch" component={Pitch} durationInFrames={timeline().total} fps={FPS} width={1920} height={1080} />;
}
