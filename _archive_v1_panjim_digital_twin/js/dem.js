// Client-side DEM loading + grid construction.
//
// panjim_dem.tif (595x466, single-band float32, EPSG:32643, 30m native pixels,
// nodata=-32768, vertical-corrected -- see data/README_data_processing.md) is small
// enough to parse entirely in the browser with geotiff.js; no server-side processing
// or pre-tiling is needed.
//
// The working grid's cell size is configurable (METRIC #1) but is quantized to
// integer multiples of the DEM's native 30m pixel size: that's the finest real data
// available, so a requested cell size smaller than 30m would just be fake upsampled
// precision, and anything else is satisfied by block-aggregating whole native pixels
// (mean of valid pixels; a "majority nodata" cell -- more than half its source pixels
// flagged nodata -- is itself rendered nodata). This is a display/aggregation rule
// about how to summarize already-collected elevation samples, not a risk figure, so
// it is not subject to the "every number must come from registry.db" rule that
// applies to hazard/mitigation parameters.

export const NATIVE_CELL_SIZE_M = 30;
const MAJORITY_NODATA_THRESHOLD = 0.5;

export async function loadDemRaster() {
  const resp = await fetch('data/panjim_dem.tif');
  if (!resp.ok) throw new Error(`Failed to fetch panjim_dem.tif: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const tiff = await GeoTIFF.fromArrayBuffer(buf);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY] in EPSG:32643
  const rasters = await image.readRasters();
  const data = rasters[0]; // Float32Array, row-major, top-left origin

  let nodata = image.getGDALNoData();
  if (nodata === null || nodata === undefined) nodata = -32768; // README-documented fallback

  const pixelSizeX = (bbox[2] - bbox[0]) / width;
  const pixelSizeY = (bbox[3] - bbox[1]) / height;

  return {
    width,
    height,
    originX: bbox[0],
    originY: bbox[3], // top-left Y (north)
    pixelSizeX,
    pixelSizeY,
    nodata,
    data,
    boundsUTM: { minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3] },
    crs: 'EPSG:32643',
  };
}

function isNodataValue(v, nodata) {
  return v === nodata || !Number.isFinite(v);
}

/**
 * Aggregate the native-resolution DEM into a grid of the requested cell size
 * (snapped to the nearest whole multiple of the native 30m pixel). Block
 * aggregation only -- mean of valid source pixels, no interpolation/smoothing
 * across cell boundaries.
 */
export function buildGrid(raster, requestedCellSizeM = NATIVE_CELL_SIZE_M) {
  const native = raster.pixelSizeX;
  const factor = Math.max(1, Math.round(requestedCellSizeM / native));
  const cellSizeM = factor * native;

  const cols = Math.ceil(raster.width / factor);
  const rows = Math.ceil(raster.height / factor);
  const cells = new Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    const rowStart = r * factor;
    const rowEnd = Math.min(rowStart + factor, raster.height);
    for (let c = 0; c < cols; c++) {
      const colStart = c * factor;
      const colEnd = Math.min(colStart + factor, raster.width);

      let sum = 0;
      let validCount = 0;
      let total = 0;
      for (let rr = rowStart; rr < rowEnd; rr++) {
        const rowOffset = rr * raster.width;
        for (let cc = colStart; cc < colEnd; cc++) {
          const v = raster.data[rowOffset + cc];
          total++;
          if (!isNodataValue(v, raster.nodata)) {
            sum += v;
            validCount++;
          }
        }
      }

      const nodataFraction = total === 0 ? 1 : 1 - validCount / total;
      const isNodata = nodataFraction > MAJORITY_NODATA_THRESHOLD || validCount === 0;

      cells[r * cols + c] = {
        row: r,
        col: c,
        elevation: isNodata ? null : sum / validCount,
        nodata: isNodata,
        nodataFraction,
      };
    }
  }

  return {
    cellSizeM,
    requestedCellSizeM,
    aggregationFactor: factor,
    cols,
    rows,
    originX: raster.originX,
    originY: raster.originY,
    boundsUTM: raster.boundsUTM,
    cells,
    cellAt(row, col) {
      if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
      return cells[row * cols + col];
    },
    /** UTM bounds [minX,minY,maxX,maxY] of a single cell */
    cellBoundsUTM(row, col) {
      const minX = raster.originX + col * cellSizeM;
      const maxX = minX + cellSizeM;
      const maxY = raster.originY - row * cellSizeM;
      const minY = maxY - cellSizeM;
      return [minX, minY, maxX, maxY];
    },
    /** row/col of the cell containing a UTM point, or null if outside the grid */
    cellIndexAtUTM(x, y) {
      const col = Math.floor((x - raster.originX) / cellSizeM);
      const row = Math.floor((raster.originY - y) / cellSizeM);
      if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
      return { row, col };
    },
  };
}
