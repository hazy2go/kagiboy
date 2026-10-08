# The videos

Both videos for the Colosseum submission are made here, in
[Remotion](https://www.remotion.dev): the pitch (`Pitch`, under three minutes)
and the technical walkthrough (`Demo`, about two and a half).

```sh
pnpm i
npx remotion studio                     # preview both
npx remotion render Demo out/demo.mp4 --gl=angle
```

The 3D shots use the website's own three.js scene (`../web/src/landing/scene.ts`
and `explode.ts`), so the console in the video is the same model, lit the same
way, as on kagiboy.xyz.

Most of the media isn't in git: the voice takes, the screen recordings, the
licensed music and the footage live in `public/` folders listed in
`.gitignore`. The pipeline that makes them is here, though.

| Script | What it does |
|---|---|
| `scripts/voice_take.py` | One ElevenLabs take of a whole script, split into sections by its character timings |
| `scripts/pace.py` | Lengthens the pauses between sentences, but only where the waveform is actually silent |
| `scripts/build_demo_vo.py` | Turns a paced take into section spans and word-timed subtitles for `Demo` |
| `scripts/build_vo.py` | The same for the pitch, from whisper word timings |
| `scripts/record/` | Drives a real Chrome window through kagiboy.xyz/demo and records it frame-accurately, plus the Game Boy's raw 160×144 LCD for sharp close-ups |

The devnet transactions in the walkthrough were made by that recording rig,
with a test wallet funded from the faucet.
