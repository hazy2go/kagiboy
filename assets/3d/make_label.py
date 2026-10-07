"""Generate the kagiboy cartridge label texture (label.png).

Run with system python3 (needs Pillow + numpy):  python3 make_label.py
The label is 44 x 38 mm, rendered at 1024 px wide.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
W = 1024
H = round(W * 38.0 / 44.0)  # 884
SS = 2  # supersample for clean glyph edges

C0 = np.array([0xCF, 0xE2, 0xFF], float)  # baby blue, top-left
C1 = np.array([0xFF, 0xDC, 0xE8], float)  # blush pink, bottom-right


def gradient(w, h):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    # diagonal parameter, top-left -> bottom-right
    t = (xx / w * 0.55 + yy / h * 0.45)
    t = (t - t.min()) / (t.max() - t.min())
    t = t * t * (3 - 2 * t)  # smoothstep for a softer middle
    img = C0[None, None, :] * (1 - t[..., None]) + C1[None, None, :] * t[..., None]
    # a whisper of lavender in the middle so it reads like the hero
    lav = np.array([0xE6, 0xE0, 0xFF], float)
    m = np.exp(-((t - 0.5) ** 2) / 0.05)[..., None] * 0.25
    img = img * (1 - m) + lav * m
    # ordered dither noise to avoid banding
    img += (np.random.default_rng(7).random(img.shape) - 0.5) * 1.2
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


KEY = [  # 9 wide x 15 tall pixel key, '#' = white pixel
    "..#####..",
    ".##...##.",
    "##.....##",
    "#...#...#",
    "#..###..#",
    "#...#...#",
    "##.....##",
    ".##...##.",
    "..##.##..",
    "...###...",
    "...###...",
    "...######",
    "...###...",
    "...######",
    "...####..",
]


def main():
    w, h = W * SS, H * SS
    base = gradient(W, H).resize((w, h), Image.BICUBIC)
    layer = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(layer)

    # pixel-art key, top-left
    px = 13 * SS
    kx, ky = int(0.085 * w), int(0.10 * h)
    for r, row in enumerate(KEY):
        for c, ch in enumerate(row):
            if ch == "#":
                d.rectangle([kx + c * px, ky + r * px, kx + (c + 1) * px - 1, ky + (r + 1) * px - 1], fill=255)

    # wordmark
    font_path = os.path.join(HERE, "fonts", "Nunito-wght.ttf")
    big = ImageFont.truetype(font_path, 200 * SS)
    try:
        big.set_variation_by_name("ExtraBold")
    except Exception:
        pass
    text = "KAGIBOY"
    track = 6 * SS
    # measure with tracking
    widths = [big.getbbox(ch)[2] - big.getbbox(ch)[0] for ch in text]
    adv = [big.getlength(ch) for ch in text]
    total = sum(adv) + track * (len(text) - 1)
    target = 0.80 * w
    scale = target / total
    big = ImageFont.truetype(font_path, int(200 * SS * scale))
    try:
        big.set_variation_by_name("ExtraBold")
    except Exception:
        pass
    track = int(track * scale)
    x = int(0.085 * w)
    asc_top = big.getbbox("K")[1]
    cap_h = big.getbbox("K")[3] - asc_top
    y_cap = int(0.50 * h)
    for ch in text:
        d.text((x, y_cap - asc_top), ch, font=big, fill=255)
        x += big.getlength(ch) + track

    # subline
    small = ImageFont.truetype(font_path, int(cap_h * 0.36))
    try:
        small.set_variation_by_name("Bold")
    except Exception:
        pass
    sub = "SOL · EVM"
    x = int(0.088 * w)
    s_top = small.getbbox("S")[1]
    y_sub = y_cap + cap_h + int(0.07 * h)
    for ch in sub:
        d.text((x, y_sub - s_top), ch, font=small, fill=255)
        x += small.getlength(ch) + int(0.012 * w)

    white = Image.new("RGB", (w, h), (255, 255, 255))
    # very slight soft ink spread so the print doesn't look vector-perfect
    mask = layer.filter(ImageFilter.GaussianBlur(0.6 * SS))
    out = Image.composite(white, base, mask)
    out = out.resize((W, H), Image.LANCZOS)
    out.save(os.path.join(HERE, "label.png"))
    out.save(os.path.join(HERE, "label.jpg"), quality=92, subsampling=0)
    print("label.png", out.size)


if __name__ == "__main__":
    main()
