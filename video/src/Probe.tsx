import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Console } from "./Three";
import { Glow } from "./ui";

// one test pose per frame, for picking camera targets
const POSES = [
  { az: 0, el: 0.0, dist: 0.2, tx: 0.0, ty: -0.035, lift: 0, shift: 0 }, // buttons area
  { az: 0.2, el: -0.05, dist: 0.12, tx: 0.028, ty: -0.03, lift: 0, shift: 0 }, // A/B guess
  { az: -0.2, el: -0.05, dist: 0.12, tx: -0.025, ty: -0.03, lift: 0, shift: 0 }, // dpad guess
  { az: 0, el: 0.0, dist: 0.17, tx: 0.0, ty: 0.025, lift: 0, shift: 0 }, // screen
];
export function Probe() {
  const f = useCurrentFrame();
  const pose = POSES[Math.min(POSES.length - 1, f)];
  return (
    <AbsoluteFill>
      <Glow />
      <Console screens={["09-home"]} shot={{ p: () => 0, plain: true, screen: () => "09-home", pose: () => pose }} />
    </AbsoluteFill>
  );
}
