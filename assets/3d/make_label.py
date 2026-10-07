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


NAVY = (43, 47, 119)
FUT = "/System/Library/Fonts/Supplemental/Futura.ttc"


def tracked(d, xy, text, fnt, fill, track, anchor_right=False):
    """Draw text with letter spacing; xy is the cap-top-left (or top-right) point."""
    adv = [fnt.getlength(c) for c in text]
    total = sum(adv) + track * (len(text) - 1)
    x, y = xy
    if anchor_right:
        x -= total
    top = fnt.getbbox("H")[1]
    for c, a in zip(text, adv):
        d.text((x, y - top), c, font=fnt, fill=fill)
        x += a + track
    return total


def main():
    w, h = W * SS, H * SS
    base = gradient(W, H).resize((w, h), Image.BICUBIC).convert("RGBA")
    m = int(0.075 * w)  # margin

    # ---- artwork: a soft white halo, then the pixel key with a pixel drop shadow
    halo = Image.new("L", (w, h), 0)
    hd = ImageDraw.Draw(halo)
    cx, cy, r = int(0.5 * w), int(0.43 * h), int(0.26 * h)
    hd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=95)
    halo = halo.filter(ImageFilter.GaussianBlur(40 * SS))
    base = Image.composite(Image.new("RGBA", (w, h), (255, 255, 255, 255)), base, halo)

    px = 22 * SS
    kw, kh = len(KEY[0]) * px, len(KEY) * px
    kx, ky = cx - kw // 2, cy - kh // 2
    art = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ad = ImageDraw.Draw(art)
    for (ox, oy, col) in ((px // 2, px // 2, (*NAVY, 120)), (0, 0, (255, 255, 255, 255))):
        for rr, row in enumerate(KEY):
            for c, ch in enumerate(row):
                if ch == "#":
                    x0, y0 = kx + c * px + ox, ky + rr * px + oy
                    ad.rectangle([x0, y0, x0 + px - 1, y0 + px - 1], fill=col)
    base.alpha_composite(art)

    ink = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(ink)

    # ---- top band: what it is, and which chains
    cap = ImageFont.truetype(FUT, int(0.027 * h), index=2)
    band_y = int(0.075 * h)
    tracked(d, (m, band_y), "HARDWARE WALLET", cap, 255, int(0.004 * w))
    tracked(d, (w - m, band_y), "SOLANA \u00b7 ETHEREUM", cap, 255, int(0.006 * w), anchor_right=True)
    rule_y = band_y + int(0.026 * h) + int(0.035 * h)
    d.rectangle([m, rule_y, w - m, rule_y + max(2, int(0.0035 * h))], fill=255)

    # ---- wordmark: the console's slanted KAGIBOY, sized to the label width
    logo_layer = Image.new("L", (w, h), 0)
    ld = ImageDraw.Draw(logo_layer)
    fnt = ImageFont.truetype(FUT, 100, index=2)
    text = "KAGIBOY"
    total = sum(fnt.getlength(c) for c in text)
    size = int(100 * (w - 2 * m) * 0.93 / total)
    fnt = ImageFont.truetype(FUT, size, index=2)
    top = fnt.getbbox("K")[1]
    capb = fnt.getbbox("K")[3]
    base_y = int(0.885 * h)
    x = m
    for c in text:
        ld.text((x, base_y - capb), c, font=fnt, fill=255)
        x += fnt.getlength(c) - size * 0.01
    slant = 0.21
    logo_layer = logo_layer.transform((w, h), Image.AFFINE, (1, slant, -slant * base_y, 0, 1, 0), Image.BICUBIC)
    ink = Image.fromarray(np.maximum(np.array(ink), np.array(logo_layer)))

    # a whisper of ink spread so the print doesn't look vector-perfect
    mask = ink.filter(ImageFilter.GaussianBlur(0.5 * SS))
    out = Image.composite(Image.new("RGBA", (w, h), (*NAVY, 255)), base, mask).convert("RGB")
    out = out.resize((W, H), Image.LANCZOS)
    out.save(os.path.join(HERE, "label.png"))
    out.save(os.path.join(HERE, "label.jpg"), quality=92, subsampling=0)
    print("label.png", out.size)


if __name__ == "__main__":
    main()
