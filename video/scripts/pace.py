"""Give a one-take voice room to breathe: longer pauses after sentences and between sections.

    python3 scripts/pace.py rec/demo/v2/takeA

Reads the take's align.json and full-master.wav (from voice_take.py) and writes paced.wav plus
paced.json: for every spoken word its start and end in the paced audio, and each section's span.
The speech itself is untouched; only the silences between sentences get longer. eleven_v3 leaves
those gaps clean, so the added silence joins seamlessly.
"""
import array
import json
import math
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

src = wave.open(f"{d}/full-master.wav")
rate, width, chans = src.getframerate(), src.getsampwidth(), src.getnchannels()
pcm = src.readframes(src.getnframes())
frame = width * chans
samples = array.array("h", pcm)
WIN = int(rate * 0.01)  # 10 ms


def quiet_center(a, b):
    """The middle of the longest silent stretch between a and b (seconds), from the audio itself.
    The take's word timings drift by a fraction of a second, so a cut placed by them alone can land
    inside a word (the "E… verything" bug); None when there's no real pause there."""
    i0, i1 = max(0, int(a * rate)), min(len(samples) // chans, int(b * rate))
    best, run_start, best_len = None, None, 0
    for i in range(i0, i1, WIN):
        chunk = samples[i * chans : (i + WIN) * chans]
        rms = math.sqrt(sum(x * x for x in chunk) / max(1, len(chunk)))
        quiet = rms < 32768 * 10 ** (-48 / 20)
        if quiet and run_start is None:
            run_start = i
        if (not quiet or i + WIN >= i1) and run_start is not None:
            length = i - run_start
            if length > best_len:
                best_len, best = length, (run_start + i) / 2 / rate
            run_start = None
    return best if best_len >= int(rate * 0.06) else None


# where to add silence: the real pause after a sentence end or a section end
cuts = []
for w, nx in zip(words, words[1:]):
    end_of_section = nx["sec"] != w["sec"]
    if end_of_section or re.search(r"[.!?]$|\.\.\.$", w["w"]):
        at = quiet_center(w["e"] - 0.2, nx["s"] + 0.35)
        if at is None:
            print(f"  no clean pause after {w['w']!r} at {w['e']:.2f}s, left as is")
            continue
        cuts.append((at, SECTION if end_of_section else SENT, end_of_section))
out, last, shift, marks = [], 0, 0.0, []
for t, add, _ in cuts:
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


# the section boundaries as cut in the paced audio: the middle of the silence added there
bounds = [round(moved(t) + add / 2, 3) for t, add, sec_end in cuts if sec_end]


for w in words:
    w["s"], w["e"] = round(moved(w["s"]), 3), round(moved(w["e"]), 3)
n_sec = words[-1]["sec"] + 1
sections = []
for k in range(n_sec):
    ws = [w for w in words if w["sec"] == k]
    sections.append({"start": ws[0]["s"], "end": ws[-1]["e"]})
total = len(b"".join(out)) / frame / rate
json.dump({"words": words, "sections": sections, "bounds": bounds, "seconds": round(total, 2)}, open(f"{d}/paced.json", "w"), indent=0)
print(f"{d}: {total:.1f} s paced ({len(cuts)} pauses lengthened)")
