"""Generate the Game Boy face prints (face.png): the printing a DMG-01 carries,
with the kagiboy wordmark where the console's logo would be.

Run with system python3 (needs Pillow):  python3 make_face.py
The texture covers the whole 90 x 148 mm front face (drawing coords, y down),
transparent except for the ink. build.py lays it on two decal quads: one on
the body face, one on the raised bezel.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PX = 12  # pixels per mm
W, H = 90 * PX, 148 * PX
FONTS = "/System/Library/Fonts/Supplemental/"
NAVY = (43, 47, 119, 255)      # the DMG's printed blue
MAGENTA = (142, 46, 98, 255)   # the A/B button colour, as on the bezel stripe
BEZEL_INK = (205, 207, 218, 255)

# must match build.py
BEZEL = (6.9, 12.3, 82.6, 70.1)
LCD = (20.1, 19.1, 68.8, 63.0)
LED_C = (12.3, 34.3)
BTN_B, BTN_A, BTN_R = (61.95, 103.35), (76.95, 96.4), 5.45
SEL_C, START_C, PILL_ANG = (31.85, 123.15), (47.2, 123.15), -24.0


def font(name, idx, mm):
    return ImageFont.truetype(FONTS + name, round(mm * PX), index=idx)


def slanted_text(img, xy_mm, text, fnt, fill, slant=0.21, tracking_mm=0.0, anchor="ls"):
    """Draw text sheared like an italic wordmark; xy is the baseline-left point in mm."""
    pad = fnt.size
    w = sum(fnt.getlength(c) for c in text) + tracking_mm * PX * (len(text) - 1) + pad * 2
    layer = Image.new("L", (int(w), fnt.size * 2), 0)
    d = ImageDraw.Draw(layer)
    x = pad
    base = int(fnt.size * 1.4)
    for c in text:
        d.text((x, base), c, font=fnt, fill=255, anchor="ls")
        x += fnt.getlength(c) + tracking_mm * PX
    # shear around the baseline so the baseline stays put
    layer = layer.transform(layer.size, Image.AFFINE, (1, slant, -slant * base, 0, 1, 0), Image.BICUBIC)
    ox = xy_mm[0] * PX - pad
    if anchor == "ms":
        ox -= (x - pad) / 2
    oy = xy_mm[1] * PX - base
    img.paste(Image.new("RGBA", layer.size, fill), (int(ox), int(oy)), layer)


def rotated_text(img, center_mm, text, fnt, fill, angle, tracking_mm=0.0):
    w = sum(fnt.getlength(c) for c in text) + tracking_mm * PX * (len(text) - 1)
    layer = Image.new("L", (int(w) + 20, fnt.size * 2), 0)
    d = ImageDraw.Draw(layer)
    x = 10
    for c in text:
        d.text((x, fnt.size), c, font=fnt, fill=255, anchor="lm")
        x += fnt.getlength(c) + tracking_mm * PX
    layer = layer.rotate(-angle, resample=Image.BICUBIC, expand=True)
    cx, cy = center_mm[0] * PX, center_mm[1] * PX
    img.paste(Image.new("RGBA", layer.size, fill), (int(cx - layer.width / 2), int(cy - layer.height / 2)), layer)


def main():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # ---- bezel: the two stripes broken by the caption, and BATTERY under the LED
    cap = font("Futura.ttc", 2, 1.55)
    caption = "DOT MATRIX WITH SECURE CHIP"
    track = 0.18
    cw = (sum(cap.getlength(c) for c in caption) + track * PX * (len(caption) - 1)) / PX
    cx = (LCD[0] + LCD[2]) / 2 + 3.0
    ty = 16.35  # caption centre line
    x0, x1 = BEZEL[0] + 3.2, BEZEL[2] - 3.2
    gap = 1.6
    for (yc, col) in ((ty - 0.55, MAGENTA), (ty + 0.55, NAVY)):
        for (a, b) in ((x0, cx - cw / 2 - gap), (cx + cw / 2 + gap, x1)):
            d.rectangle([a * PX, (yc - 0.32) * PX, b * PX, (yc + 0.32) * PX], fill=col)
    rotated_text(img, (cx, ty), caption, cap, BEZEL_INK, 0.0, tracking_mm=track)
    bat = font("Futura.ttc", 2, 1.3)
    rotated_text(img, (LED_C[0], LED_C[1] + 3.6), "BATTERY", bat, BEZEL_INK, 0.0, tracking_mm=0.12)

    # ---- body: the wordmark where the console's logo sits
    logo = font("Futura.ttc", 2, 7.4)
    slanted_text(img, (8.2, 79.4), "KAGIBOY", logo, NAVY, slant=0.21, tracking_mm=-0.1)

    # ---- button legends
    ab = font("Futura.ttc", 2, 3.6)
    for c, ch in ((BTN_B, "B"), (BTN_A, "A")):
        slanted_text(img, (c[0] + 1.2, c[1] + BTN_R + 4.4), ch, ab, NAVY, anchor="ms")
    small = font("Futura.ttc", 2, 1.95)
    a = math.radians(PILL_ANG)
    nx, ny = -math.sin(a), math.cos(a)  # perpendicular, pointing down the face
    for c, label in ((SEL_C, "SELECT"), (START_C, "START")):
        rotated_text(img, (c[0] + nx * 4.0, c[1] + ny * 4.0), label, small, NAVY, PILL_ANG, tracking_mm=0.22)

    out = os.path.join(HERE, "face.png")
    img.save(out, optimize=True)
    print("wrote", out, img.size)


if __name__ == "__main__":
    main()
