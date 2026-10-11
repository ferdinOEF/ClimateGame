"""Crops the Copernicus DEM GLO-30 tile around Panaji to the board, for the map generator.

Usage:  python3 -I tools/mapgen/dem/cropCopernicusDem.py <Copernicus_DSM_COG_10_N15_00_E073_00_DEM.tif>

The tile is downloaded by hand from the public AWS bucket:
  https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N15_00_E073_00_DEM/Copernicus_DSM_COG_10_N15_00_E073_00_DEM.tif
It is 3600 x 3600 float32 metres, 1 arc-second pixels, top-left corner at
73.0 E, 16.0 N (pixel-is-area). The crop is written as little-endian int16
decimetres (panaji-cop30.bin) with its georeference in panaji-cop30.json, so the
generator needs no TIFF reader and the repository holds about 150 KB, not 12 MB.

Needs: pip install tifffile imagecodecs numpy
"""
import json
import os
import sys

import numpy as np
import tifffile

# The board (tools/mapgen/buildPanajiMap.ts BOARD) plus a margin of 0.01 degrees.
NORTH, SOUTH, WEST, EAST = 15.523, 15.436, 73.785, 73.880
TILE_NORTH, TILE_WEST, PIXEL_DEG = 16.0, 73.0, 1.0 / 3600

src = sys.argv[1]
image = tifffile.imread(src).astype(np.float32)
row0 = int(np.floor((TILE_NORTH - NORTH) / PIXEL_DEG))
row1 = int(np.ceil((TILE_NORTH - SOUTH) / PIXEL_DEG))
col0 = int(np.floor((WEST - TILE_WEST) / PIXEL_DEG))
col1 = int(np.ceil((EAST - TILE_WEST) / PIXEL_DEG))
crop = image[row0:row1, col0:col1]
decimetres = np.clip(np.round(crop * 10), -32768, 32767).astype("<i2")
here = os.path.dirname(os.path.abspath(__file__))
decimetres.tofile(os.path.join(here, "panaji-cop30.bin"))
meta = {
    "source": "Copernicus DEM GLO-30 (tile Copernicus_DSM_COG_10_N15_00_E073_00_DEM)",
    "href": "https://registry.opendata.aws/copernicus-dem/",
    "licence": "Copernicus DEM licence: free use with attribution. © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA; all rights reserved.",
    "accessed": "2026-10-10",
    "kind": "Digital surface model: heights include buildings and trees.",
    "units": "int16 decimetres above the EGM2008 geoid, little-endian, row-major from the north-west corner",
    "north": TILE_NORTH - row0 * PIXEL_DEG,
    "west": TILE_WEST + col0 * PIXEL_DEG,
    "pixelDeg": PIXEL_DEG,
    "width": int(crop.shape[1]),
    "height": int(crop.shape[0]),
}
with open(os.path.join(here, "panaji-cop30.json"), "w") as f:
    json.dump(meta, f, indent=2)
    f.write("\n")
print(meta["width"], meta["height"], float(crop.min()), float(crop.max()))
