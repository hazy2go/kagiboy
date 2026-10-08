"""hazytune.mid → src/music_data.h: four Game Boy voices, one byte stream each. Demo ROM only.

    python3 assets/gen_music.py path/to/hazytune.mid [preview.wav]     (needs `pip install mido`)

Arrangement (the Game Boy has four voices):
  pulse 1  the "Synth" and "Intro" stab chords, played as a fast arpeggio (one chord note per frame)
  pulse 2  "Synth 2", the high stabs, also arpeggiated
  wave     "Bass", the lower note of each octave pair
  noise    "DrumGroove": kick, side stick, woodblock, hi-hat, ride (one hit at a time, by priority)

Stream format, per voice, timed in frames (59.73 Hz):
  tonal: [gap][len][n1][n2][n3]   gap = frames since the previous event's start (1..255),
                                  len = frames the note sounds, n = MIDI note (0 = none);
                                  an event with n1 = 0 only advances time
  noise: [gap][hit]               hit = drum index (0 = none)
  a gap of 0 ends the stream: the song loops
The optional WAV is a rough preview of these streams (square, triangle-ish and noise voices).
"""
import math
import struct
import sys
import wave

import mido

FPS = 4194304 / 70224  # one Game Boy frame
SRC = sys.argv[1]
OUT = __file__.replace("assets/gen_music.py", "src/music_data.h")
PREVIEW = sys.argv[2] if len(sys.argv) > 2 else None

mid = mido.MidiFile(SRC)
tpb = mid.ticks_per_beat

# tempo map from every track (type 1 files keep it in track 0)
tempos = sorted((sum(m.time for m in t[: i + 1]), m.tempo) for t in mid.tracks for i, m in enumerate(t) if m.type == "set_tempo")
if not tempos or tempos[0][0] != 0:
    tempos.insert(0, (0, 500000))


def seconds(tick):
    s, last_t, last_tempo = 0.0, 0, tempos[0][1]
    for t, tempo in tempos[1:]:
        if t >= tick:
            break
        s += (t - last_t) * last_tempo / tpb / 1e6
        last_t, last_tempo = t, tempo
    return s + (tick - last_t) * last_tempo / tpb / 1e6


def notes(name):
    """(start frame, end frame, midi note) for one track"""
    out = []
    for t in mid.tracks:
        if t.name != name:
            continue
        now, on = 0, {}
        for m in t:
            now += m.time
            if m.type == "note_on" and m.velocity > 0:
                on.setdefault(m.note, []).append(now)
            elif m.type in ("note_off", "note_on") and on.get(m.note):
                s = on[m.note].pop(0)
                out.append((round(seconds(s) * FPS), round(seconds(now) * FPS), m.note))
    return sorted(out)


def chords(ns, keep=3, lowest=False):
    """group notes starting on the same frame into one event; later events cut earlier ones short"""
    by = {}
    for s, e, n in ns:
        by.setdefault(s, []).append((e, n))
    ev = []
    for s in sorted(by):
        ps = sorted({n for _, n in by[s]})
        ps = ps[:1] if lowest else ps[-keep:][::-1]  # top notes first: the melody leads the arpeggio
        ev.append([s, max(3, max(e for e, _ in by[s]) - s), ps])
    for a, b in zip(ev, ev[1:]):
        a[1] = max(1, min(a[1], b[0] - a[0]))
    return ev


def encode_tonal(ev):
    out, last = [], 0
    for s, ln, ps in ev:
        gap = s - last
        while gap > 255:  # a long rest: time-only events
            out += [255, 0, 0, 0, 0]
            gap -= 255
        if gap == 0 and out:  # two starts in one frame can't happen after grouping
            gap = 1
        ps = (ps + [0, 0, 0])[:3]
        out += [max(1, gap), min(255, ln)] + ps
        last = s
    return out


# General MIDI drums → our noise hits, in priority order when two land on one frame
DRUMS = {36: 1, 35: 1, 37: 2, 38: 2, 40: 2, 77: 3, 76: 3, 42: 4, 44: 4, 46: 4, 51: 5, 59: 5, 53: 5}
PRIO = [1, 2, 3, 4, 5]


def encode_drums(ns):
    by = {}
    for s, _, n in ns:
        if n in DRUMS:
            by.setdefault(s, set()).add(DRUMS[n])
    out, last = [], 0
    for s in sorted(by):
        hit = next(h for h in PRIO if h in by[s])
        gap = s - last
        while gap > 255:
            out += [255, 0]
            gap -= 255
        out += [max(1, gap), hit]
        last = s
    return out


lead = chords(notes("Synth") + notes("Intro"))
high = chords(notes("Synth 2"))
bass = chords(notes("Bass"), lowest=True)
drum_notes = notes("DrumGroove")
streams = {
    "lead": encode_tonal(lead) + [0],
    "high": encode_tonal(high) + [0],
    "bass": encode_tonal(bass) + [0],
    "drums": encode_drums(drum_notes) + [0],
}
song_frames = max(max(e for _, e, _ in notes(n)) for n in ("Synth", "Intro", "Synth 2", "Bass", "DrumGroove"))
def pad(stream, ev_starts, width):
    """every voice loops together: a rest from its last event up to the song's end"""
    end = ev_starts[-1] if ev_starts else 0
    tail = song_frames + 4 - end  # a short breath before the loop
    body = stream[:-1]
    while tail > 255:
        body += [255] + [0] * (width - 1)
        tail -= 255
    return body + [max(1, tail)] + [0] * (width - 1) + [0]


streams["lead"] = pad(streams["lead"], [s for s, _, _ in lead], 5)
streams["high"] = pad(streams["high"], [s for s, _, _ in high], 5)
streams["bass"] = pad(streams["bass"], [s for s, _, _ in bass], 5)
drum_starts = sorted({s for s, _, n in drum_notes if n in DRUMS})
streams["drums"] = pad(streams["drums"], drum_starts, 2)

lo = min(n for ev in (lead, high, bass) for _, _, ps in ev for n in ps)
hi = max(n for ev in (lead, high, bass) for _, _, ps in ev for n in ps)

with open(OUT, "w") as f:
    f.write("/* Generated by assets/gen_music.py from hazytune.mid. Do not edit. Demo ROM only. */\n")
    f.write(f"/* {song_frames} frames, {song_frames / FPS:.1f} s; notes {lo}..{hi} */\n")
    # pulse register value per MIDI note: x = 2048 - 131072 / Hz (the wave voice plays an octave
    # lower for the same value, so the bass looks up note + 12)
    base, top = lo, hi + 12
    tbl = [max(0, round(2048 - 131072 / (440 * 2 ** ((n - 69) / 12)))) for n in range(base, top + 1)]
    f.write(f"#define MUSIC_NOTE_LO {base}\n#define MUSIC_NOTE_HI {top}\n")
    f.write(f"static const uint16_t music_freq[{len(tbl)}] = {{{','.join(map(str, tbl))}}};\n")
    for k, v in streams.items():
        f.write(f"static const uint8_t music_{k}[{len(v)}] = {{\n")
        for i in range(0, len(v), 24):
            f.write(",".join(str(x) for x in v[i : i + 24]) + ",\n")
        f.write("};\n")
total = sum(len(v) for v in streams.values())
print(f"{OUT}: {total} bytes, {song_frames / FPS:.1f} s, notes {lo}..{hi}, events lead {len(lead)} high {len(high)} bass {len(bass)} drums {len(drum_starts)}")

# ---------------------------------------------------------------- preview
if PREVIEW:
    RATE = 32768
    spf = RATE / FPS
    buf = [0.0] * int((song_frames + 60) * spf)
    hz = lambda n: 440 * 2 ** ((n - 69) / 12)

    def voice(ev, shape, vol, decay):
        for s, ln, ps in ev:
            ps = [p for p in ps if p]
            if not ps:
                continue
            for i in range(int(ln * spf)):
                fr = i / spf
                p = ps[int(fr) % len(ps)]  # the arpeggio: one note per frame
                ph = (i / RATE * hz(p)) % 1
                v = (1 if ph < shape else -1) if shape < 1 else (4 * abs(ph - 0.5) - 1)
                j = int(s * spf) + i
                if j < len(buf):
                    buf[j] += v * vol * math.exp(-fr / decay)

    voice(lead, 0.5, 0.16, 10)
    voice(high, 0.25, 0.11, 9)
    voice([(s, ln, ps) for s, ln, ps in bass], 2, 0.3, 40)
    import random

    rnd = random.Random(1)
    for s in drum_starts:
        hits = {DRUMS[n] for st, _, n in drum_notes if st == s and n in DRUMS}
        h = next(x for x in PRIO if x in hits)
        ln, vol, lp = {1: (9, 0.45, 0.08), 2: (6, 0.25, 0.5), 3: (4, 0.2, 0.9), 4: (2, 0.09, 1.0), 5: (8, 0.06, 1.0)}[h]
        y = 0.0
        for i in range(int(ln * spf)):
            y += lp * (rnd.uniform(-1, 1) - y)
            j = int(s * spf) + i
            if j < len(buf):
                buf[j] += y * vol * (1 - i / (ln * spf))
    with wave.open(PREVIEW, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, x)) * 30000)) for x in buf))
    print("preview", PREVIEW)
