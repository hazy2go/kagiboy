"""The demo video's voice as ONE continuous track: section spans and subtitle cues from a paced take.

    python3 scripts/build_demo_vo.py rec/demo/v2/takeA

Reads the take's paced.json (scripts/pace.py) and rec/demo/v2/captions.json (the on-screen wording),
copies paced.wav to public/demo-vo/voice.wav and writes src/demo-vo2.json:
  { seconds, sections: [{ id, start, end, cues: [{ t, text }] }] }   (all times in the voice track)
Each caption sentence starts on its word in the recording (sentences are laid onto the spoken words
by word count, as scripts/build_vo.py does).
"""
import json
import re
import shutil
import sys

d = sys.argv[1]
paced = json.load(open(f"{d}/paced.json"))
caps = json.load(open("rec/demo/v2/captions.json"))
ids = list(caps)
shutil.copy(f"{d}/paced.wav", "public/demo-vo/voice.wav")
out = []
for k, sid in enumerate(ids):
    W = [w for w in paced["words"] if w["sec"] == k]
    sents = [x.strip() for x in re.split(r"(?<=[.!?:])\s+", caps[sid]) if x.strip()]
    counts = [len(x.split()) for x in sents]
    total, n, acc, cues = sum(counts), len(W), 0, []
    for sx, c in zip(sents, counts):
        i = min(n - 1, round(acc / total * n))
        cues.append({"t": round(max(0, W[i]["s"] - 0.05), 3), "text": sx})
        acc += c
    out.append({"id": sid, "start": paced["sections"][k]["start"], "end": paced["sections"][k]["end"], "cues": cues})
# where each section hands over to the next: inside a pause verified in the audio (pace.py)
for k, b in enumerate(paced.get("bounds", [])):
    out[k + 1]["cut"] = b
json.dump({"take": d, "seconds": paced["seconds"], "sections": out}, open("src/demo-vo2.json", "w"), indent=1)
print("sections", [(s["id"], round(s["end"] - s["start"], 1)) for s in out], "voice", paced["seconds"], "s")
