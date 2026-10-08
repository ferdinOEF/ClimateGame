"""Compares docs/qa/pixeldiff/<name>-before.png and -after.png: share of pixels that differ
(by more than a small threshold, to ignore anti-aliasing noise), the largest difference,
and a diff image (differing pixels in magenta over a faded 'after')."""
import os
from PIL import Image, ImageChops

base = os.path.join("docs", "qa", "pixeldiff")
for name in ("menu", "tutorial"):
    a = Image.open(os.path.join(base, f"{name}-before.png")).convert("RGB")
    b = Image.open(os.path.join(base, f"{name}-after.png")).convert("RGB")
    diff = ImageChops.difference(a, b).convert("L")
    px = list(diff.getdata())
    changed = sum(1 for v in px if v > 24)
    print(f"{name}: {changed / len(px) * 100:.3f}% of pixels differ by more than 24/255; max difference {max(px)}")
    faded = Image.blend(b, Image.new("RGB", b.size, (255, 255, 255)), 0.6)
    mask = diff.point(lambda v: 255 if v > 24 else 0)
    faded.paste(Image.new("RGB", b.size, (255, 0, 255)), mask=mask)
    faded.save(os.path.join(base, f"{name}-diff.png"))
