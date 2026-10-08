"""Cuts frames every 0.25 s from a Playwright video (webm) into JPEGs for a contact sheet.

Playwright's bundled ffmpeg has no fps filter and no raw muxer, but it can write
PNGs through the image2 muxer at an output rate of 4 a second (-r 4).
Usage: python3 tools/videoFrames.py <video> <start-seconds> <duration> <out-dir>"""
import glob
import os
import subprocess
import sys
from PIL import Image

video, start, duration, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
subprocess.run(["/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux", "-loglevel", "error", "-ss", start, "-t", duration, "-i", video,
                "-r", "4", "-f", "image2", "-c:v", "png", os.path.join(out, "v%03d.png")], check=True)
frames = sorted(glob.glob(os.path.join(out, "v*.png")))
for i, png in enumerate(frames):
    Image.open(png).convert("RGB").save(os.path.join(out, f"f{i:03d}-t{i * 0.25:.2f}.jpg"), quality=72)
    os.remove(png)
print(len(frames), "frames")
