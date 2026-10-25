"""
Section 33b: the frozen storm frames before and after (tools/frozenFrame.ts: Playwright's fake clock and a seeded
Math.random, so two runs of the same code draw the same frame), compared outside the interface: the 2030 cyclone
held at 7 s (frozen-cyclone) and the 2040 flood at 12 s (frozen-flood). A pixel differs when any channel moves by
more than `TOL`. The interface's boxes (both runs' JSON, 4 px wider) are left out; a box over half the screen is
ignored. Writes docs/qa/section33b/<moment>-diff-<size>.png: the after frame in grey, the interface dimmed, and
every differing pixel outside it in red.

Usage: python3 tools/section33bDiff.py [before=before] [after=after] -- 1366x768 [1920x1080 ...]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / "docs" / "qa" / "section33b"
TOL = 8
PAD = 4

args = sys.argv[1:]
runs = args[: args.index("--")] if "--" in args else []
sizes = args[args.index("--") + 1 :] if "--" in args else args
A, B = (runs + ["before", "after"][len(runs):])[:2]
for size in sizes or ["1366x768", "1920x1080"]:
  for moment in ("frozen-cyclone", "frozen-flood"):
    if not (QA / A / f"{moment}-{size}.png").exists():
        continue
    before = Image.open(QA / A / f"{moment}-{size}.png").convert("RGB")
    after = Image.open(QA / B / f"{moment}-{size}.png").convert("RGB")
    w, h = after.size
    boxes = []
    for run in (A, B):
        boxes += json.loads((QA / run / f"{moment}-{size}.json").read_text())
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    for b in boxes:
        if b["width"] * b["height"] > 0.5 * w * h:
            continue
        draw.rectangle([b["x"] - PAD, b["y"] - PAD, b["x"] + b["width"] + PAD, b["y"] + b["height"] + PAD], fill=255)
    # Maya is interface too, and she moved from the bottom left to the bottom right (Section 33b.4): her figure at
    # either corner (an SVG, so not in the boxes above), with room for her minimise button.
    for x0 in (0, w - 90):
        draw.rectangle([x0, h - 180, x0 + 90, h], fill=255)
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
    picture.save(QA / f"{moment}-diff-{size}{'' if (A, B) == ('before', 'after') else f'-{A}-{B}'}.png")
    print(f"{moment} {size}: {changed} of {total} pixels outside the interface differ by more than {TOL} ({100 * changed / total:.3f}%); where: {outside.getbbox()}")
