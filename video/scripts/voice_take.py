"""One ElevenLabs take of a whole script (cloned voice, eleven_v3), split into sections by character timing.

    ELEVENLABS_API_KEY=... python3 scripts/voice_take.py rec/demo/directed.json rec/demo/vo [stability] [seed]

stability: eleven_v3 takes 0.0 (creative, most expressive), 0.5 (natural, default) or 1.0 (robust).

directed.json maps section ids to text with v3 direction tags. Writes full.mp3, align.json, the loudness-
mastered full-master.wav and one <id>.wav per section into the output folder. The key is read from the
environment only.
"""
import base64, json, os, subprocess, sys, urllib.request

src, out = sys.argv[1], sys.argv[2]
stability = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 4242
os.makedirs(out, exist_ok=True)
vid = json.load(open("rec/ivc/voice.json"))["voice_id"]
D = json.load(open(src))
ids = list(D)
full = "\n\n".join(D[i] for i in ids)
body = json.dumps({"text": full, "model_id": "eleven_v3", "voice_settings": {"stability": stability, "similarity_boost": 0.9}, "seed": seed}).encode()
req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/with-timestamps?output_format=mp3_44100_192",
                             data=body, headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"})
d = json.load(urllib.request.urlopen(req, timeout=600))
open(f"{out}/full.mp3", "wb").write(base64.b64decode(d["audio_base64"]))
json.dump({"text": full, "alignment": d["alignment"]}, open(f"{out}/align.json", "w"))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{out}/full.mp3", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", f"{out}/full-master.wav"], check=True)

al = d["alignment"]
ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
spans, pos = [], 0
for part in full.split("\n\n"):
    spans.append((pos, pos + len(part)))
    pos += len(part) + 2


def spoken(lo, hi):
    """first and last spoken characters, skipping [direction] tags and spaces"""
    inside, keep = False, []
    for j in range(lo, hi):
        if ch[j] == "[":
            inside = True
        if not inside and not ch[j].isspace():
            keep.append(j)
        if ch[j] == "]":
            inside = False
    return st[keep[0]], en[keep[-1]]


times = [spoken(*s) for s in spans]
for i, (s0, e0) in enumerate(times):
    # cut halfway through the pause between sections
    a0 = 0 if i == 0 else (times[i - 1][1] + s0) / 2
    b0 = (e0 + times[i + 1][0]) / 2 if i < len(times) - 1 else e0 + 0.6
    dd = b0 - a0
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{out}/full-master.wav", "-af",
                    f"atrim={a0:.3f}:{b0:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st={max(0, dd - 0.12):.3f}:d=0.12",
                    "-ar", "48000", f"{out}/{ids[i]}.wav"], check=True)
    print(ids[i], round(dd, 2))
print("total", round(en[-1], 1))
