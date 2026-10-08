"""Cut whole sentences out of the pitch's finished voice files without re-recording.

    python3 scripts/cut_vo.py            (the cuts are listed in CUTS below)

For each sentence to drop, the cut starts and ends at the quietest moment of the pauses around it
(found in the waveform, not from word timings), so no word is clipped. The subtitles after a cut
move up by what was removed. Edits public/vo/sN.wav and src/vo.json in place; the originals of this
pass are kept in rec/vo-before-cut/.
"""
import array
import json
import math
import re
import wave

# section id -> indexes of the subtitle sentences to drop
CUTS = {
    "s2": [1],  # the phone that buzzes all day
    "s4": [2, 3],  # it doesn't go online / it doesn't run apps
    "s5": [2, 3],  # write down the words, pin, pair / from then on, hold A
    "s6": [2],  # the same software runs in your browser
    "s8": [1],  # this isn't something you hide in a drawer
    "s9": [1, 3],  # expand the brand / security is key for us
}

vo = json.load(open("src/vo.json"))


def quietest(samples, rate, a, b, win=0.08):
    """centre of the quietest `win`-long stretch between a and b (seconds)"""
    step = int(rate * 0.01)
    w = int(rate * win)
    best, best_e = a, float("inf")
    for i in range(max(0, int(a * rate)), max(0, int(b * rate) - w), step):
        seg = samples[i : i + w]
        e = sum(x * x for x in seg) / max(1, len(seg))
        if e < best_e:
            best_e, best = e, (i + w / 2) / rate
    return best, 10 * math.log10(best_e / 32768**2 + 1e-12)


for o in vo:
    drop = CUTS.get(o["id"])
    if not drop:
        continue
    path = f"public/vo/{o['id']}.wav"
    w = wave.open(path)
    rate, nch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
    samples = array.array("h", w.readframes(w.getnframes()))
    w.close()
    cues = o["cues"]
    # contiguous runs of dropped sentences become one cut
    runs, run = [], []
    for k in sorted(drop):
        if run and k != run[-1] + 1:
            runs.append(run)
            run = []
        run.append(k)
    runs.append(run)
    removed = []  # (start, end) in seconds, original timeline
    for r in runs:
        first, last = r[0], r[-1]
        s0, db0 = quietest(samples, rate, cues[first]["t"] - 0.7, cues[first]["t"] + 0.12)
        if last + 1 < len(cues):
            s1, db1 = quietest(samples, rate, cues[last + 1]["t"] - 0.7, cues[last + 1]["t"] + 0.12)
        else:
            s1, db1 = o["seconds"], -99
        removed.append((s0, s1))
        print(f"{o['id']}: cut {s0:.2f}-{s1:.2f}s ({s1 - s0:.2f}s) at {db0:.0f}/{db1:.0f} dB: {' / '.join(cues[k]['text'][:40] for k in r)}")
    out = array.array("h")
    pos = 0
    for s0, s1 in removed:
        i0, i1 = int(s0 * rate) * nch, int(s1 * rate) * nch
        out.extend(samples[pos:i0])
        # a 10 ms crossfade over the join, so the seam has no click
        fade = int(rate * 0.01)
        tail, head = samples[i0 - fade : i0], samples[i1 : i1 + fade]
        if len(out) >= fade and len(head) == fade:
            for j in range(fade):
                g = j / fade
                out[len(out) - fade + j] = int(tail[j] * (1 - g) + head[j] * g)
            pos = i1 + fade
        else:
            pos = i1
    out.extend(samples[pos:])
    with wave.open(path, "w") as f:
        f.setnchannels(nch)
        f.setsampwidth(sw)
        f.setframerate(rate)
        f.writeframes(out.tobytes())

    def moved(t):
        return t - sum(min(s1, max(t, s0)) - s0 for s0, s1 in removed if t > s0)

    keep = [c for k, c in enumerate(cues) if k not in drop]
    for c in keep:
        c["t"] = round(moved(c["t"]), 2)
    o["cues"] = keep
    o["seconds"] = round(len(out) / nch / rate, 2)
    o["end"] = round(moved(o["end"]), 2)
    o["text"] = " ".join(c["text"] for c in keep)

vo = [o for o in vo if o["id"] != "s7"]  # the Inside section goes entirely
json.dump(vo, open("src/vo.json", "w"), indent=1, ensure_ascii=False)
print("sections", [(o["id"], o["seconds"]) for o in vo])
