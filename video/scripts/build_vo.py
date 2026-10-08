"""Turn the finished voice takes (rec/sN.wav) into the video's voice files and word-timed subtitles.

For each section: transcribe with word timings (whisper), trim the silence before the first word
(and, for s9, the spoken "kagiboy. Press start." at the end), write public/vo/sN.wav, and lay the
script's sentences from src/vo.json onto the recording by word position.
Run: python3 scripts/build_vo.py [s1 s2 ...]   (no arguments: every section)
"""
import json, re, subprocess, sys, os

os.chdir(os.path.join(os.path.dirname(__file__), ".."))
v = json.load(open("src/vo.json"))
only = set(sys.argv[1:])
for o in v:
    k = o["id"]
    if only and k not in only:
        continue
    subprocess.run(["whisper", f"rec/{k}.wav", "--model", "small.en", "--language", "en", "--word_timestamps", "True",
                    "--output_format", "json", "--output_dir", "rec/wt", "--fp16", "False"], check=True, capture_output=True)
    d = json.load(open(f"rec/wt/{k}.json"))
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
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"rec/{k}.wav", "-af", af, "-ar", "48000", f"public/vo/{k}.wav"], check=True)
    o["seconds"] = round(float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"public/vo/{k}.wav"])), 2)
    sents = [x.strip() for x in re.findall(r"[^.!?:]+[.!?:]?", o["text"]) if x.strip()]
    counts = [len(x.split()) for x in sents]
    total, n, acc, cues = sum(counts), len(W), 0, []
    for sx, c in zip(sents, counts):
        i = min(n - 1, round(acc / total * n))
        cues.append({"t": round(max(0, W[i]["start"] - trim - 0.05), 2), "text": sx})
        acc += c
    o["cues"], o["end"] = cues, round(W[-1]["end"] - trim, 2)
    print(k, o["seconds"], [c["t"] for c in cues])
json.dump(v, open("src/vo.json", "w"), indent=1)
