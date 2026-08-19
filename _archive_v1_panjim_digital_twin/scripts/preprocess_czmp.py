"""
One-time offline preprocessing of the CZMP reference raster for browser display.

Why this exists: the browser stack has no GDAL/rasterio. panjim_dem.tif (595x466,
float32, single band) is small enough for geotiff.js to parse live in the browser
at runtime -- so it is NOT touched here, it's read directly from data/panjim_dem.tif
at app load time. panjim_czmp.tif is a 38MB, 5734x4491 RGB LZW-compressed scan; it is
ONLY ever used as a visual reference overlay (never a calculation input), so it is
downsampled here to a PNG the browser can decode natively, plus a small JSON sidecar
giving its WGS84 bounding box (computed by reprojecting the UTM corner coordinates
with pyproj -- the authoritative EPSG:32643 definition, cross-checked against the
proj4js definition used at runtime in js/geo.js).

This script is NOT part of the running app and does not touch registry.db.
Re-run only if data/panjim_czmp.tif changes.
"""
import json
from pathlib import Path

from PIL import Image
import PIL.TiffTags as TiffTags
from pyproj import Transformer

Image.MAX_IMAGE_PIXELS = None

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC = REPO_ROOT / "data" / "panjim_czmp.tif"
OUT_PNG = Path(__file__).resolve().parents[1] / "data" / "czmp.png"
OUT_JSON = Path(__file__).resolve().parents[1] / "data" / "czmp_bounds.json"

MAX_DIM = 2400  # longer-side cap so the PNG stays a reasonable download size

def main():
    im = Image.open(SRC)
    tags = im.tag_v2

    px_scale = tags[33550]  # ModelPixelScaleTag (x, y, z)
    tiepoint = tags[33922]  # ModelTiepointTag (i,j,k, X,Y,Z)
    ps_x, ps_y = px_scale[0], px_scale[1]
    origin_x, origin_y = tiepoint[3], tiepoint[4]

    width, height = im.size
    min_x = origin_x
    max_x = origin_x + width * ps_x
    max_y = origin_y
    min_y = origin_y - height * ps_y

    transformer = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True)
    corners_utm = [
        (min_x, max_y),  # NW
        (max_x, max_y),  # NE
        (max_x, min_y),  # SE
        (min_x, min_y),  # SW
    ]
    corners_wgs84 = [transformer.transform(x, y) for x, y in corners_utm]
    lons = [c[0] for c in corners_wgs84]
    lats = [c[1] for c in corners_wgs84]

    bounds = {
        "west": min(lons),
        "east": max(lons),
        "south": min(lats),
        "north": max(lats),
        "note": (
            "Axis-aligned WGS84 bounding box derived from the source raster's "
            "EPSG:32643 corner coordinates reprojected with pyproj. The source "
            "raster is a north-up rectangle in UTM 43N; reprojecting an ~16km x "
            "14km rectangle to WGS84 introduces sub-pixel meridian-convergence "
            "distortion, acceptable for a reference/visual overlay only -- this "
            "image is never used as a calculation input."
        ),
        "source_crs": "EPSG:32643",
        "corners_utm": {"NW": corners_utm[0], "NE": corners_utm[1], "SE": corners_utm[2], "SW": corners_utm[3]},
    }

    scale = min(1.0, MAX_DIM / max(width, height))
    if scale < 1.0:
        new_size = (round(width * scale), round(height * scale))
        im = im.resize(new_size, Image.LANCZOS)

    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT_PNG, "PNG", optimize=True)
    OUT_JSON.write_text(json.dumps(bounds, indent=2))

    print(f"Wrote {OUT_PNG} ({im.size[0]}x{im.size[1]}, {OUT_PNG.stat().st_size/1024:.0f} KB)")
    print(f"Wrote {OUT_JSON}")
    print(json.dumps(bounds, indent=2))


if __name__ == "__main__":
    main()
