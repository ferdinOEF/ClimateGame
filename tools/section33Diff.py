"""
Section 33: the same moments before and after Harbour Morning (tools/section33Shots.ts), compared outside the
panels: the calm board once the camera has settled (calm-settled), and the cyclone held at 7 s (storm-moment), both
with the shader clock held. A pixel differs when any channel moves by more than
`TOL`. The panels' boxes (both runs' JSON, 4 px wider) are left out; a box over half the screen (a full-screen layer)
is ignored. Writes docs/qa/section33/<moment>-diff-<size>.png: the after shot in grey, the panels dimmed, and every
differing pixel outside them in red.

Usage: python3 tools/section33Diff.py 1366x768 [1920x1080 ...]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / "docs" / "qa" / "section33"
TOL = 8
PAD = 4

for size in sys.argv[1:] or ["1366x768", "1920x1080"]:
  for moment in ("calm-settled", "storm-moment"):
    if not (QA / "before" / f"{moment}-{size}.png").exists():
        continue
    before = Image.open(QA / "before" / f"{moment}-{size}.png").convert("RGB")
    after = Image.open(QA / "after" / f"{moment}-{size}.png").convert("RGB")
    w, h = after.size
    boxes = []
    for run in ("before", "after"):
        boxes += json.loads((QA / run / f"{moment}-{size}.json").read_text())
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    for b in boxes:
        if b["width"] * b["height"] > 0.5 * w * h:
            continue
        draw.rectangle([b["x"] - PAD, b["y"] - PAD, b["x"] + b["width"] + PAD, b["y"] + b["height"] + PAD], fill=255)
    diff = ImageChops.difference(before, after)
    r, g, bl = diff.split()
    biggest = ImageChops.lighter(ImageChops.lighter(r, g), bl)
    differs = biggest.point(lambda v: 255 if v > TOL else 0)
    outside = ImageChops.multiply(differs, ImageChops.invert(mask))
    total = mask.histogram()[0]
    changed = outside.histogram()[255]
    grey = after.convert("L").convert("RGB")
    dim = Image.new("RGB", (w, h), (40, 40, 40))
    picture = Image.composite(dim, grey, mask)
    red = Image.new("RGB", (w, h), (255, 0, 0))
    picture = Image.composite(red, picture, outside)
    picture.save(QA / f"{moment}-diff-{size}.png")
    print(f"{moment} {size}: {changed} of {total} pixels outside the panels differ by more than {TOL} ({100 * changed / total:.3f}%); where: {outside.getbbox()}")
