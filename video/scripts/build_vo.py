"""Turn the finished voice takes (rec/sN.wav) into the video's voice files and word-timed subtitles.

For each section: transcribe with word timings (whisper), trim the silence before the first word
(and, for s9, the spoken "kagiboy. Press start." at the end), write public/vo/sN.wav, and lay the
script's sentences from src/vo.json onto the recording by word position.
Run: python3 scripts/build_vo.py [s1 s2 ...]   (no arguments: every section)
The demo video: VO=src/demo-vo.json REC=rec/demo/vo OUT=public/demo-vo python3 scripts/build_vo.py
"""
import json, re, subprocess, sys, os

os.chdir(os.path.join(os.path.dirname(__file__), ".."))
VO, REC, OUT = os.environ.get("VO", "src/vo.json"), os.environ.get("REC", "rec"), os.environ.get("OUT", "public/vo")
os.makedirs(OUT, exist_ok=True)
v = json.load(open(VO))
only = set(sys.argv[1:])
for o in v:
    k = o["id"]
    if only and k not in only:
        continue
    subprocess.run(["whisper", f"{REC}/{k}.wav", "--model", "small.en", "--language", "en", "--word_timestamps", "True",
                    "--output_format", "json", "--output_dir", f"{REC}/wt", "--fp16", "False"], check=True, capture_output=True)
    d = json.load(open(f"{REC}/wt/{k}.json"))
    W = [w for s in d["segments"] for w in s.get("words", [])]
    cut = None
    if k == "s9":
        tail = [w for w in W if "kage" in w["word"].lower() and w["start"] > W[-1]["start"] - 4]
        if tail:
            cut = tail[0]["start"] - 0.25
            W = [w for w in W if w["start"] < cut]
    trim = max(0, W[0]["start"] - 0.12)
    af = f"atrim=start={trim:.3f}" + (f":end={cut:.3f}" for _ in [0]).__next__() if cut else f"atrim=start={trim:.3f}"
    af += ",asetpts=PTS-STARTPTS" + (f",afade=t=out:st={cut - trim - 0.25:.3f}:d=0.25" if cut else "")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{REC}/{k}.wav", "-af", af, "-ar", "48000", f"{OUT}/{k}.wav"], check=True)
    o["seconds"] = round(float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{OUT}/{k}.wav"])), 2)
    # a sentence ends at . ! ? or : followed by a space (so "kagiboy.xyz/demo" stays whole)
    sents = [x.strip() for x in re.split(r"(?<=[.!?:])\s+", o["text"]) if x.strip()]
    counts = [len(x.split()) for x in sents]
    total, n, acc, cues = sum(counts), len(W), 0, []
    for sx, c in zip(sents, counts):
        i = min(n - 1, round(acc / total * n))
        cues.append({"t": round(max(0, W[i]["start"] - trim - 0.05), 2), "text": sx})
        acc += c
    o["cues"], o["end"] = cues, round(W[-1]["end"] - trim, 2)
    print(k, o["seconds"], [c["t"] for c in cues])
json.dump(v, open(VO, "w"), indent=1, ensure_ascii=False)
