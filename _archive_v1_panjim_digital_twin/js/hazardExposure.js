// Per-cell hazard exposure for the Risk view (constraint #1/#2). The registry has NO
// per-cell wave/wind/surge/saline-intrusion grid -- so those hazards are NOT rendered
// as an invented intensity heatmap. Instead, each of the 6 hazards gets exactly one of
// two honest treatments, decided by what's actually spatially real:
//
//   - cyclone_wave, cyclone_wind, storm_surge: no spatial data exists at all (this is
//     the registry's own list of hazards with no per-cell grid). Rendered as a flat,
//     uniform "generalized coastal/estuarine exposure buffer" across every cell in the
//     analysis extent -- explicitly labeled as such, never shaded to suggest some
//     areas are more exposed than others, because we have no basis for that.
//   - saline_intrusion: also has no per-cell grid, BUT it is mechanistically restricted
//     to khazan land (it's tidal water entering khazan parcels via bund breach) and we
//     DO have real vector data for where khazan land is (khazan_land_extracted). So
//     unlike the other three, this one is only marked relevant for cells that actually
//     fall inside a khazan polygon -- a real spatial constraint, not an invented one.
//   - flood: the registry names DEM elevation as spatially real for this hazard. There
//     is no registry-sourced elevation threshold that defines "flood-prone," so this
//     module does not synthesize one -- flood is treated the same as the 3 uniform
//     hazards for cumulative-count purposes, and the Risk view's flood mode instead
//     points at the existing elevation grid rendering directly (low elevation reads as
//     more exposed via the already-built ramp), captioned as illustrative context, not
//     a modeled inundation extent.
//   - sea_level_rise: the registry gives a REAL number for this -- the currently
//     selected year's interpolated projection (see timeline.js). A cell is marked
//     relevant if its elevation is at or below that projected value. This is the one
//     hazard where a genuine, non-invented spatial threshold exists.
//
// Cumulative = count of hazards marked relevant for a cell, 0-6, sequential scale.
// Never a weighted composite (constraint #2 explicitly forbids that -- no defensible
// basis for relative hazard weighting exists in the registry).

import { GEO } from './geo.js';

export const UNIFORM_HAZARDS = ['cyclone_wave', 'cyclone_wind', 'storm_surge', 'flood'];

/** Which grid cells (row*cols+col keys) fall inside at least one khazan polygon.
 * Mirrors zones.js's snapToGrid technique: only scan the bounding-box-local cell range
 * per polygon, not the whole grid, so 222 small polygons stay fast against a 277k-cell
 * grid. */
/** Extracts every exterior ring [lng,lat][] from a feature's geometry, handling both
 * Polygon (219 of the 222 khazan features) and MultiPolygon (3 of them) -- a Polygon's
 * coordinates[0] IS a ring, but a MultiPolygon's coordinates[0] is itself an array of
 * rings (one per sub-polygon), so treating both the same way silently fed nested arrays
 * into proj4 as if they were [lng,lat] pairs and crashed. Interior rings (holes) are
 * not used -- khazan polygons in this extraction have none in practice, and a hole
 * would only ever shrink relevance, never fabricate it. */
function exteriorRings(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((poly) => poly[0]);
  return [];
}

export function computeKhazanCellKeys(grid, khazanGeojson) {
  const keys = new Set();
  if (!khazanGeojson) return keys;

  khazanGeojson.features.forEach((feature) => {
    exteriorRings(feature.geometry).forEach((ring) => {
      const ringUTM = GEO.ringToUTM(ring);
      const xs = ringUTM.map((p) => p[0]);
      const ys = ringUTM.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const nw = grid.cellIndexAtUTM(minX, maxY);
      const se = grid.cellIndexAtUTM(maxX, minY);
      const rowStart = Math.max(0, nw ? nw.row : 0);
      const rowEnd = Math.min(grid.rows - 1, se ? se.row : grid.rows - 1);
      const colStart = Math.max(0, nw ? nw.col : 0);
      const colEnd = Math.min(grid.cols - 1, se ? se.col : grid.cols - 1);
      if (rowEnd < rowStart || colEnd < colStart) return;

      const turfPoly = turf.polygon([ringUTM]);
      for (let r = rowStart; r <= rowEnd; r++) {
        for (let c = colStart; c <= colEnd; c++) {
          const key = r * grid.cols + c;
          if (keys.has(key)) continue;
          const [cminX, cminY, cmaxX, cmaxY] = grid.cellBoundsUTM(r, c);
          const cx = (cminX + cmaxX) / 2;
          const cy = (cminY + cmaxY) / 2;
          if (turf.booleanPointInPolygon(turf.point([cx, cy]), turfPoly)) {
            keys.add(key);
          }
        }
      }
    });
  });
  return keys;
}

/**
 * relevance(cell, key) -> true | false | null (null = "unknown", only possible for
 * elevation-dependent hazards on a nodata cell -- never silently treated as false).
 */
export function relevanceFn(hazardName, { khazanCellKeys, slrThresholdM }) {
  if (hazardName === 'saline_intrusion') {
    return (cell, key) => khazanCellKeys.has(key);
  }
  if (UNIFORM_HAZARDS.includes(hazardName)) {
    return () => true;
  }
  if (hazardName === 'sea_level_rise') {
    return (cell) => {
      if (cell.nodata || slrThresholdM == null) return null;
      return cell.elevation <= slrThresholdM;
    };
  }
  return () => null;
}

/** Per-cell cumulative hazard count (0-6) + which hazards contributed, for every
 * non-nodata-independent hazard that can be evaluated. sea_level_rise contributes
 * `null` (excluded from the count, not counted as false) on nodata cells. */
export function computeCumulative(grid, { khazanCellKeys, slrThresholdM }) {
  const hazardNames = ['cyclone_wave', 'cyclone_wind', 'storm_surge', 'flood', 'saline_intrusion', 'sea_level_rise'];
  const fns = hazardNames.map((name) => relevanceFn(name, { khazanCellKeys, slrThresholdM }));

  return grid.cells.map((cell, i) => {
    const key = i;
    let count = 0;
    let unknownCount = 0;
    const contributing = [];
    hazardNames.forEach((name, idx) => {
      const result = fns[idx](cell, key);
      if (result === true) {
        count++;
        contributing.push(name);
      } else if (result === null) {
        unknownCount++;
      }
    });
    return { count, contributing, unknownCount, cell };
  });
}
