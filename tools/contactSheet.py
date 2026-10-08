"""Lays a frame sequence (docs/qa/contact/<dir>/*.jpg) out as one contact sheet with time labels.

Usage: python3 tools/contactSheet.py <dir> [columns]
Writes docs/qa/contact/<dir>.jpg.
"""
import os
import sys
from PIL import Image, ImageDraw

name = sys.argv[1]
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 6
src = os.path.join("docs", "qa", "contact", name)
frames = sorted(f for f in os.listdir(src) if f.endswith(".jpg"))
if not frames:
    sys.exit("no frames")
tw, th = 384, 216
rows = (len(frames) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * (th + 18)), (24, 28, 26))
draw = ImageDraw.Draw(sheet)
for i, f in enumerate(frames):
    im = Image.open(os.path.join(src, f)).convert("RGB").resize((tw, th))
    x, y = (i % cols) * tw, (i // cols) * (th + 18)
    sheet.paste(im, (x, y + 18))
    draw.text((x + 4, y + 3), f.split("-", 1)[1].rsplit(".", 1)[0], fill=(240, 230, 210))
out = os.path.join("docs", "qa", "contact", name + ".jpg")
sheet.save(out, quality=78)
print(out, len(frames), "frames")
