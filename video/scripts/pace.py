"""Give a one-take voice room to breathe: longer pauses after sentences and between sections.

    python3 scripts/pace.py rec/demo/v2/takeA

Reads the take's align.json and full-master.wav (from voice_take.py) and writes paced.wav plus
paced.json: for every spoken word its start and end in the paced audio, and each section's span.
The speech itself is untouched; only the silences between sentences get longer. eleven_v3 leaves
those gaps clean, so the added silence joins seamlessly.
"""
import json
import re
import subprocess
import sys
import wave

d = sys.argv[1]
SENT, SECTION = 0.32, 0.75  # seconds added after a sentence, and between sections
a = json.load(open(f"{d}/align.json"))
text, al = a["text"], a["alignment"]
ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]

# spoken words (direction tags skipped), with the section each belongs to
words, inside, cur, sec = [], False, None, 0
for j, c in enumerate(ch):
    if text.startswith("\n\n", j):
        sec += 1
    if c == "[":
        inside = True
    if not inside and not c.isspace():
        if cur is None:
            cur = {"s": st[j], "e": en[j], "w": c, "sec": sec}
        else:
            cur["e"], cur["w"] = en[j], cur["w"] + c
    elif cur is not None:
        words.append(cur)
        cur = None
    if c == "]":
        inside = False
if cur:
    words.append(cur)

# where to add silence: in the middle of the gap after a sentence end or a section end
cuts = []
for w, nx in zip(words, words[1:]):
    if nx["sec"] != w["sec"]:
        cuts.append(((w["e"] + nx["s"]) / 2, SECTION))
    elif re.search(r"[.!?]$|\.\.\.$", w["w"]):
        cuts.append(((w["e"] + nx["s"]) / 2, SENT))

src = wave.open(f"{d}/full-master.wav")
rate, width, chans = src.getframerate(), src.getsampwidth(), src.getnchannels()
pcm = src.readframes(src.getnframes())
frame = width * chans
out, last, shift, marks = [], 0, 0.0, []
for t, add in cuts:
    i = int(t * rate) * frame
    out.append(pcm[last:i])
    out.append(b"\0" * int(add * rate) * frame)
    marks.append((t, add))
    last = i
out.append(pcm[last:])
with wave.open(f"{d}/paced.wav", "w") as w:
    w.setnchannels(chans)
    w.setsampwidth(width)
    w.setframerate(rate)
    w.writeframes(b"".join(out))


def moved(t):
    return t + sum(add for at, add in marks if at < t)


for w in words:
    w["s"], w["e"] = round(moved(w["s"]), 3), round(moved(w["e"]), 3)
n_sec = words[-1]["sec"] + 1
sections = []
for k in range(n_sec):
    ws = [w for w in words if w["sec"] == k]
    sections.append({"start": ws[0]["s"], "end": ws[-1]["e"]})
total = len(b"".join(out)) / frame / rate
json.dump({"words": words, "sections": sections, "seconds": round(total, 2)}, open(f"{d}/paced.json", "w"), indent=0)
print(f"{d}: {total:.1f} s paced ({len(cuts)} pauses lengthened)")
