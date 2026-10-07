"""Generate the PCB solder-mask / trace texture (pcb.png) for CartPCB.

Run with system python3 (Pillow + numpy). Mapping: u (0..57 mm) -> x, v (0..65 mm) -> y.
Layout must match CHIPS in build.py.
"""
import os
import math
import random
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
PXMM = 18.0
W, H = int(57 * PXMM), int(65 * PXMM)
SS = 2
S = PXMM * SS

MASK = (24, 66, 40)
MASK_LIGHT = (38, 92, 56)       # mask over copper
SILK = (226, 230, 222)
GOLD = (205, 170, 95)

CHIPS = {  # name: (u, v, w, h) centre + size, mm
    "MCU": (19.0, 31.0, 7.0, 7.0),
    "SE": (36.0, 24.0, 4.0, 4.0),
    "BLE": (38.5, 42.5, 5.0, 4.0),
    "ACC": (11.5, 45.0, 2.0, 2.0),
}
FINGERS = [28.5 + (i - 15.5) * 1.5 for i in range(32)]


def P(u, v):
    return (u * S, v * S)


def main():
    random.seed(3)
    im = Image.new("RGB", (W * SS, H * SS), MASK)
    d = ImageDraw.Draw(im)
    tw = int(0.22 * S)

    def trace(pts, w=tw):
        d.line([P(*p) for p in pts], fill=MASK_LIGHT, width=w, joint="curve")
        for p in (pts[0], pts[-1]):
            r = w / 2
            x, y = P(*p)
            d.ellipse([x - r, y - r, x + r, y + r], fill=MASK_LIGHT)

    def via(u, v, r=0.32):
        x, y = P(u, v)
        R = r * S
        d.ellipse([x - R, y - R, x + R, y + R], fill=GOLD)
        R2 = 0.13 * S
        d.ellipse([x - R2, y - R2, x + R2, y + R2], fill=(30, 26, 20))

    # ground pour areas (slightly lighter, hatched by clearance)
    d.rectangle([P(2.5, 3.0), P(54.0, 13.5)], fill=(29, 76, 47))
    d.rectangle([P(2.5, 50.5), P(54.5, 57.0)], fill=(29, 76, 47))

    # fingers -> bus traces fanning up toward the MCU / chips
    mcu_u, mcu_v = CHIPS["MCU"][0], CHIPS["MCU"][1]
    for i, fu in enumerate(FINGERS):
        top = 58.5
        if i < 14:
            tu = mcu_u - 3.2 + (i % 14) * 0.48
            mid = 52.0 - (i % 7) * 0.35
            trace([(fu, 63.0), (fu, top), (fu, mid), (tu, mid - abs(fu - tu) * 0.0 - 4.0), (tu, mcu_v + 3.8)])
        elif i < 24:
            tu = 33.0 + (i - 14) * 0.9
            trace([(fu, 63.0), (fu, 55.0 - (i - 14) * 0.3), (tu, 50.0 - (i - 14) * 0.3), (tu, 46.0)])
            via(tu, 46.0)
        else:
            tu = 47.0 + (i - 24) * 0.8
            trace([(fu, 63.0), (fu, 56.5), (tu, 53.0)])
            via(tu, 53.0)

    # MCU <-> SE, MCU <-> BLE, MCU <-> ACC
    for k in range(4):
        trace([(mcu_u + 3.8, 28.5 + k * 0.6), (30.5, 28.5 + k * 0.6), (33.5, 25.5 + k * 0.4), (34.0, 25.5 + k * 0.4)])
    for k in range(5):
        trace([(mcu_u + 3.8, 32.0 + k * 0.6), (27.0 + k * 0.5, 32.0 + k * 0.6), (27.0 + k * 0.5, 41.5 + k * 0.4), (36.0, 41.5 + k * 0.4)])
    for k in range(3):
        trace([(mcu_u - 3.8, 32.0 + k * 0.6), (14.5 - k * 0.5, 32.0 + k * 0.6), (14.5 - k * 0.5, 44.5), (12.5, 44.5)])
    # power / misc runs
    trace([(4.0, 20.0), (4.0, 48.0), (8.0, 52.0)], int(0.45 * S))
    trace([(52.0, 20.0), (52.0, 34.0)], int(0.45 * S))
    trace([(mcu_u, mcu_v - 3.8), (mcu_u, 18.0), (24.0, 14.5), (40.0, 14.5), (44.0, 18.0), (44.0, 22.0)])
    for k in range(6):
        trace([(mcu_u - 3.8, 28.0 + k * 0.55), (8.5, 28.0 + k * 0.55), (6.0, 25.0 + k * 0.55), (6.0, 18.0 + k * 0.3)])
    for (u, v) in [(8.0, 52.0), (52.0, 20.0), (4.0, 20.0), (44.0, 22.0), (24.0, 18.0), (10.0, 38.0), (30.0, 46.0),
                   (16.0, 20.0), (40.0, 30.0), (46.0, 30.0), (22.0, 50.0), (12.0, 22.0)]:
        via(u, v)
    for _ in range(30):
        via(random.uniform(5, 52), random.uniform(16, 50), 0.22)

    # silkscreen outlines (no text) around parts
    lw = max(2, int(0.12 * S))
    for name, (u, v, w, h) in CHIPS.items():
        m = 0.6
        d.rectangle([P(u - w / 2 - m, v - h / 2 - m), P(u + w / 2 + m, v + h / 2 + m)], outline=SILK, width=lw)
        # pin-1 dot
        x, y = P(u - w / 2 - m - 0.5, v - h / 2 - m - 0.5)
        R = 0.25 * S
        d.ellipse([x - R, y - R, x + R, y + R], fill=SILK)
    # keep-out ring around screw hole
    x, y = P(28.5, 10.0)
    R = 2.6 * S
    d.ellipse([x - R, y - R, x + R, y + R], outline=SILK, width=lw)

    im = im.filter(ImageFilter.GaussianBlur(0.4 * SS))
    im = im.resize((W, H), Image.LANCZOS)
    im.save(os.path.join(HERE, "pcb.png"))
    print("pcb.png", im.size)


if __name__ == "__main__":
    main()
