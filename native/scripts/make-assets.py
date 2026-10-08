"""Render placeholder icon/splash sources for @capacitor/assets.
Soft pastel gradient #cfe2ff -> #ffdce8 with the GB-screen favicon motif and the
kagiboy wordmark in PixelOperator8. Run: python3 scripts/make-assets.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
FONT = ROOT.parent / "web/public/fonts/PixelOperator8.ttf"
TOP, BOT = (0xCF, 0xE2, 0xFF), (0xFF, 0xDC, 0xE8)
DARK, LIGHT = (0x0F, 0x38, 0x0F), (0x9B, 0xBC, 0x0F)


def gradient(w, h):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOT)))
    return img


def motif(img, cx, cy, size, text=True):
    """Dark rounded body with a lit screen, like the site favicon."""
    d = ImageDraw.Draw(img)
    s = size
    d.rounded_rectangle([cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2], radius=s * 0.12, fill=DARK)
    sw, sh = s * 0.72, s * 0.50
    top = cy - s / 2 + s * 0.16
    d.rectangle([cx - sw / 2, top, cx + sw / 2, top + sh], fill=LIGHT)
    if text:
        f = ImageFont.truetype(str(FONT), int(s * 0.105))
        d.text((cx, top + sh / 2), "kagiboy", font=f, fill=DARK, anchor="mm")
    # two little buttons
    r = s * 0.05
    by = top + sh + s * 0.15
    for bx in (cx + s * 0.14, cx + s * 0.27):
        d.ellipse([bx - r, by - r, bx + r, by + r], fill=LIGHT)
    return img


def wordmark(img, cx, cy, px):
    d = ImageDraw.Draw(img)
    d.text((cx, cy), "kagiboy", font=ImageFont.truetype(str(FONT), px), fill=DARK, anchor="mm")


OUT.mkdir(exist_ok=True)
motif(gradient(1024, 1024), 512, 512, 640).save(OUT / "icon-only.png")
gradient(1024, 1024).save(OUT / "icon-background.png")
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
motif(fg, 512, 512, 440).save(OUT / "icon-foreground.png")  # inside adaptive safe zone
for name in ("splash.png", "splash-dark.png"):
    sp = gradient(2732, 2732)
    motif(sp, 1366, 1250, 520)
    wordmark(sp, 1366, 1660, 120)
    sp.save(OUT / name)
print("wrote", sorted(p.name for p in OUT.iterdir()))
