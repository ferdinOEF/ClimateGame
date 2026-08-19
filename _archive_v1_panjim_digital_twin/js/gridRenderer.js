// Renders a DEM grid (from dem.js buildGrid) to a canvas image suitable for a Leaflet
// ImageOverlay: one flat-shaded block per grid cell (nearest-neighbor, no smoothing),
// elevation mapped through a terrain color ramp, nodata cells filled with a distinct
// hatch pattern -- never interpolated, never silently blended with neighbors (METRIC #4).
//
// The color ramp and hatch pattern are cartographic presentation choices, not risk
// figures, so (unlike hazard/mitigation numbers) they are not required to originate
// from registry.db.

import { GEO } from './geo.js';

const PX_PER_CELL = 3;

// Elevation color ramp, post vertical-correction meters. Stops are deliberately
// concentrated between -5m and 20m: 61.6% of all valid cells in this extent fall in
// that range (Panjim + the khazan floodplain -- the terrain this tool most needs to
// render legibly), vs. an earlier version that spent most of its stops on the 20-200m
// range where only ~38% of cells actually sit. See dem_ramp review, Aug 2026: the
// old ramp rendered the flood-relevant majority of the map as a muddy, hard-to-read
// blend while giving interior hill terrain (lower relevance to flood risk) the most
// visually distinct colors -- backwards for this tool's purpose.
const RAMP = [
  { at: -5, color: [37, 85, 135] },   // tidal flats / lowest observed land
  { at: -2, color: [58, 130, 145] },
  { at: 2, color: [94, 158, 110] },   // most of Panjim + khazan floodplain sits here
  { at: 8, color: [140, 178, 95] },
  { at: 20, color: [186, 168, 100] }, // transition to upland
  { at: 45, color: [175, 128, 78] },
  { at: 80, color: [205, 178, 150] },
  { at: 140, color: [235, 230, 222] }, // highest terrain in this extent
];

function rampColor(elevation) {
  if (elevation <= RAMP[0].at) return RAMP[0].color;
  for (let i = 1; i < RAMP.length; i++) {
    if (elevation <= RAMP[i].at) {
      const a = RAMP[i - 1];
      const b = RAMP[i];
      const t = (elevation - a.at) / (b.at - a.at);
      return [
        Math.round(a.color[0] + (b.color[0] - a.color[0]) * t),
        Math.round(a.color[1] + (b.color[1] - a.color[1]) * t),
        Math.round(a.color[2] + (b.color[2] - a.color[2]) * t),
      ];
    }
  }
  return RAMP[RAMP.length - 1].color;
}

function makeHatchPattern(ctx) {
  const tile = document.createElement('canvas');
  tile.width = 6;
  tile.height = 6;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = '#8a8a8a';
  tctx.fillRect(0, 0, 6, 6);
  tctx.strokeStyle = '#c8c8c8';
  tctx.lineWidth = 1.5;
  tctx.beginPath();
  tctx.moveTo(0, 6);
  tctx.lineTo(6, 0);
  tctx.moveTo(-2, 2);
  tctx.lineTo(2, -2);
  tctx.moveTo(4, 8);
  tctx.lineTo(8, 4);
  tctx.stroke();
  return ctx.createPattern(tile, 'repeat');
}

/**
 * Render `grid` to a canvas and return { dataUrl, boundsLatLng } ready for
 * L.imageOverlay(dataUrl, boundsLatLng). boundsLatLng is the grid's UTM extent
 * reprojected to WGS84 (axis-aligned approximation, same caveat as the CZMP overlay:
 * fine for display, never used for calculation).
 */
export function renderGridToImage(grid) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.cols * PX_PER_CELL;
  canvas.height = grid.rows * PX_PER_CELL;
  const ctx = canvas.getContext('2d');
  const hatch = makeHatchPattern(ctx);

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cellAt(r, c);
      const px = c * PX_PER_CELL;
      const py = r * PX_PER_CELL;
      if (!cell || cell.nodata) {
        ctx.fillStyle = hatch;
      } else {
        const [cr, cg, cb] = rampColor(cell.elevation);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      }
      ctx.fillRect(px, py, PX_PER_CELL, PX_PER_CELL);
    }
  }

  const { minX, minY, maxX, maxY } = grid.boundsUTM;
  const sw = GEO.utmToLatLng([minX, minY]);
  const ne = GEO.utmToLatLng([maxX, maxY]);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    boundsLatLng: [
      [sw.lat, sw.lng],
      [ne.lat, ne.lng],
    ],
  };
}

export function legendRamp() {
  return RAMP;
}
