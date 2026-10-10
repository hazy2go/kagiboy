"""Top-deck printing for the kagiboy printer (printer_face.png), drawn like the Game Boy's face prints.

Run with system python3 (needs Pillow):  python3 make_printer_face.py
Covers the printer's front deck, x 0..W mm, y 0..DECK mm from the front edge (y down = toward the back).
Must match the dimensions in printer.py.
"""
import os
from PIL import Image, ImageDraw
from make_face import PX, NAVY, MAGENTA, font, slanted_text, rotated_text

HERE = os.path.dirname(os.path.abspath(__file__))
W, DECK = 96.0, 44.0
LED = (14.0, 24.0)
FEED = (78.0, 24.0)


def main():
    img = Image.new("RGBA", (int(W * PX), int(DECK * PX)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # wordmark across the middle, with the console's two stripes leading into it
    logo = font("Futura.ttc", 2, 6.2)
    slanted_text(img, (W / 2, 28.0), "KAGIBOY", logo, NAVY, slant=0.21, tracking_mm=-0.1, anchor="ms")
    sub = font("Futura.ttc", 2, 1.9)
    rotated_text(img, (W / 2, 32.6), "THERMAL PRINTER", sub, NAVY, 0.0, tracking_mm=0.32)
    for yc, col in ((15.0, MAGENTA), (16.3, NAVY)):
        d.rectangle([30 * PX, (yc - 0.32) * PX, 66 * PX, (yc + 0.32) * PX], fill=col)
    small = font("Futura.ttc", 2, 1.7)
    rotated_text(img, (LED[0], LED[1] + 4.6), "POWER", small, NAVY, 0.0, tracking_mm=0.2)
    rotated_text(img, (FEED[0], FEED[1] + 6.2), "FEED", small, NAVY, 0.0, tracking_mm=0.2)
    out = os.path.join(HERE, "printer_face.png")
    img.save(out, optimize=True)
    print("wrote", out, img.size)


if __name__ == "__main__":
    main()
