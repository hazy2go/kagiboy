"""Post-process raw Cycles renders (system python3, Pillow + numpy).

  post.py raw.png out.png                -> composite over the warm-white pastel backdrop
  post.py raw.png out.png --transparent  -> keep alpha (UI compositing)
  post.py raw.png out.png --check ref    -> side-by-side + overlay vs. the reference drawing
"""
import sys
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def backdrop(w, h):
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    xx /= w
    yy /= h
    img = np.ones((h, w, 3)) * hexc("#FBFAF8")
    asp = w / h

    def blob(cx, cy, r, col, a):
        d2 = ((xx - cx) * asp) ** 2 + (yy - cy) ** 2
        m = np.exp(-d2 / (r * r))[..., None] * a
        return m, hexc(col)

    for (cx, cy, r, col, a) in ((0.08, 0.10, 0.55, "#CFE2FF", 0.55),
                                (0.95, 0.95, 0.60, "#FFDCE8", 0.55),
                                (0.70, 0.12, 0.40, "#E6E0FF", 0.40),
                                (0.15, 0.95, 0.35, "#E6E0FF", 0.25)):
        m, c = blob(cx, cy, r, col, a)
        img = img * (1 - m) + c * m
    img += (np.random.default_rng(1).random(img.shape) - 0.5) * 1.5
    return img


def composite(raw, out):
    im = np.asarray(Image.open(raw).convert("RGBA")).astype(float)
    rgb, a = im[..., :3], im[..., 3:4] / 255.0
    bg = backdrop(im.shape[1], im.shape[0])
    o = bg * (1 - a) + rgb * a
    Image.fromarray(np.clip(o + 0.5, 0, 255).astype(np.uint8), "RGB").save(out, optimize=True)


def check(raw, out, ref):
    S = 5.92
    r = Image.open(raw).convert("RGBA")
    W, H = r.size
    d = Image.open(ref).convert("RGB")
    # make the drawing isotropic at 5.92 px/mm (it is 5.889 horizontally, 5.932 vertically)
    sx, sy = S / (530 / 90.0), S / (878 / 148.0)
    d2 = d.resize((round(d.width * sx), round(d.height * sy)), Image.LANCZOS)
    # keep the origin (178, 88) fixed
    ox, oy = 178 * sx - 178, 88 * sy - 88
    canvas = Image.new("RGB", (W, H), (255, 255, 255))
    canvas.paste(d2, (-round(ox), -round(oy)))
    da = np.asarray(canvas).astype(float)
    cyan = (da[..., 2] > 150) & (da[..., 0] < 140)
    # crop region of the front view
    x0, x1, y0, y1 = 150, 740, 0, 1000
    white = Image.new("RGB", (W, H), (255, 255, 255))
    white.paste(r, (0, 0), r)
    ren = np.asarray(white).astype(float)
    ov = ren * 0.85 + 255 * 0.15
    ov[cyan] = [0, 170, 220]
    ov = ov.astype(np.uint8)
    panels = [canvas.crop((x0, y0, x1, y1)), white.crop((x0, y0, x1, y1)), Image.fromarray(ov).crop((x0, y0, x1, y1))]
    pw, ph = x1 - x0, y1 - y0
    outim = Image.new("RGB", (pw * 3 + 40, ph + 50), (255, 255, 255))
    dr = ImageDraw.Draw(outim)
    for i, (p, t) in enumerate(zip(panels, ["reference drawing (gb-dims.png)", "3D model, ortho @ 5.92 px/mm", "overlay"])):
        outim.paste(p, (i * (pw + 20), 50))
        dr.text((i * (pw + 20) + 10, 15), t, fill=(40, 40, 40))
    outim.save(out)


if __name__ == "__main__":
    raw, out = sys.argv[1], sys.argv[2]
    if "--transparent" in sys.argv:
        Image.open(raw).convert("RGBA").save(out, optimize=True)
    elif "--check" in sys.argv:
        ref = sys.argv[sys.argv.index("--check") + 1]
        check(raw, os.path.join(os.path.dirname(out), "check-front.png"), ref)
    else:
        composite(raw, out)
    print("post ->", out)
