// Canvas rendering for the Risk view's hazard layers. Deliberately a separate module
// from gridRenderer.js (which renders elevation) rather than a shared/generalized one
// -- gridRenderer.js is already-verified working code from earlier rounds and the
// build instructions say not to touch verified logic without real need. Duplicating
// the small canvas-per-cell pattern here is cheap; risking a regression in the
// elevation layer is not.

import { GEO } from './geo.js';

const PX_PER_CELL = 3;
const UNIFORM_COLOR = [120, 150, 190]; // flat wash for "generalized exposure buffer" hazards
const UNKNOWN_HATCH_BASE = '#8a8a8a';

// Sequential scale, 0 (white/neutral) -> 6 (dark red). Never diverging, never implying
// a "good vs bad" midpoint -- this is a count, not a weighted judgment (constraint #2).
const CUMULATIVE_RAMP = [
  [244, 244, 242], // 0
  [255, 224, 178],
  [255, 183, 128],
  [255, 138, 101],
  [239, 83, 80],
  [198, 40, 40],
  [122, 15, 15], // 6
];

function makeUnknownPattern(ctx) {
  const tile = document.createElement('canvas');
  tile.width = 6;
  tile.height = 6;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = UNKNOWN_HATCH_BASE;
  tctx.fillRect(0, 0, 6, 6);
  tctx.strokeStyle = '#c8c8c8';
  tctx.lineWidth = 1.5;
  tctx.beginPath();
  tctx.moveTo(0, 6);
  tctx.lineTo(6, 0);
  tctx.stroke();
  return ctx.createPattern(tile, 'repeat');
}

function boundsLatLngFor(grid) {
  const { minX, minY, maxX, maxY } = grid.boundsUTM;
  const sw = GEO.utmToLatLng([minX, minY]);
  const ne = GEO.utmToLatLng([maxX, maxY]);
  return [
    [sw.lat, sw.lng],
    [ne.lat, ne.lng],
  ];
}

/** Renders a single boolean/unknown hazard layer: relevant cells get a flat wash,
 * not-relevant cells are transparent, unknown (nodata-blocked) cells get the hatch. */
export function renderHazardLayer(grid, relevanceFn) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.cols * PX_PER_CELL;
  canvas.height = grid.rows * PX_PER_CELL;
  const ctx = canvas.getContext('2d');
  const unknownPattern = makeUnknownPattern(ctx);

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const idx = r * grid.cols + c;
      const cell = grid.cellAt(r, c);
      const result = cell ? relevanceFn(cell, idx) : false;
      const px = c * PX_PER_CELL;
      const py = r * PX_PER_CELL;
      if (result === true) {
        ctx.fillStyle = `rgba(${UNIFORM_COLOR[0]},${UNIFORM_COLOR[1]},${UNIFORM_COLOR[2]},0.55)`;
        ctx.fillRect(px, py, PX_PER_CELL, PX_PER_CELL);
      } else if (result === null) {
        ctx.fillStyle = unknownPattern;
        ctx.fillRect(px, py, PX_PER_CELL, PX_PER_CELL);
      }
      // false: leave transparent
    }
  }

  return { dataUrl: canvas.toDataURL('image/png'), boundsLatLng: boundsLatLngFor(grid) };
}

/** Renders the cumulative count layer (0-6), sequential ramp, unknown cells hatched. */
export function renderCumulativeLayer(grid, cumulativeResults) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.cols * PX_PER_CELL;
  canvas.height = grid.rows * PX_PER_CELL;
  const ctx = canvas.getContext('2d');
  const unknownPattern = makeUnknownPattern(ctx);

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const idx = r * grid.cols + c;
      const cell = grid.cellAt(r, c);
      const px = c * PX_PER_CELL;
      const py = r * PX_PER_CELL;
      if (!cell || cell.nodata) {
        ctx.fillStyle = unknownPattern;
        ctx.fillRect(px, py, PX_PER_CELL, PX_PER_CELL);
        continue;
      }
      const result = cumulativeResults[idx];
      const [cr, cg, cb] = CUMULATIVE_RAMP[Math.min(result.count, 6)];
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.75)`;
      ctx.fillRect(px, py, PX_PER_CELL, PX_PER_CELL);
    }
  }

  return { dataUrl: canvas.toDataURL('image/png'), boundsLatLng: boundsLatLngFor(grid) };
}

export function cumulativeLegend() {
  return CUMULATIVE_RAMP;
}
