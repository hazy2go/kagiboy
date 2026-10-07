"""
Turns real ROM screenshots (web/public/screens/*.png, from `pnpm smoke`) into
thermal-printer prints for the landing page: the 4 Game Boy shades become
ordered dither in soft charcoal ink on a transparent ground, the way a Game Boy
Printer renders them on sticker paper. The paper colour comes from the page.

    python3 web/scripts/make_prints.py
"""

import random
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public"
SRC = ROOT / "screens"
OUT = ROOT / "prints"
OUT.mkdir(exist_ok=True)

INK = (43, 47, 58)  # #2B2F3A
SCALE = 3
# share of ink per shade, lightest to darkest
COVER = [0.0, 0.25, 0.62, 1.0]
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

NAMES = ["boot", "start", "mash", "words", "pin", "home", "qr", "sign", "confirmed"]


# luminance of the 4 DMG greens the emulator draws with (lightest to darkest)
DMG_LUM = [158, 144, 78, 43]


def shades(img: Image.Image) -> list[list[int]]:
    """The smoke screenshots are 2x DMG greens; get back 160x144 shade indices."""
    small = img.convert("RGB").resize((160, 144), Image.NEAREST)
    out = []
    for y in range(144):
        row = []
        for x in range(160):
            r, g, b = small.getpixel((x, y))
            lum = 0.3 * r + 0.59 * g + 0.11 * b
            row.append(min(range(4), key=lambda i: abs(DMG_LUM[i] - lum)))
        out.append(row)
    return out


def render(name: str, fade: bool) -> None:
    src = Image.open(SRC / f"{name}.png")
    grid = shades(src)
    w, h = 160 * SCALE, 144 * SCALE
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = out.load()
    rng = random.Random(name)
    for y in range(h):
        band = 0.97 + 0.03 * ((y // 2) % 3 == 0)  # faint print-head banding
        for x in range(w):
            s = grid[y // SCALE][x // SCALE]
            cover = COVER[s]
            if cover == 0:
                continue
            threshold = (BAYER[y % 4][x % 4] + 0.5) / 16
            if cover < 1 and threshold > cover:
                continue
            alpha = 235 * band
            if fade and rng.random() < 0.035:
                alpha *= 0.35  # a few starved dots, like a real thermal head
            px[x, y] = (*INK, int(alpha))
    out.save(OUT / f"{name}.png", optimize=True)


for n in NAMES:
    if (SRC / f"{n}.png").exists():
        render(n, fade=(n != "qr"))
        print("print", n)
