// Zone drawing + tagging (METRIC #2, D3). A user draws a polygon, tags it with a
// mitigation type, and the zone is snapped to the active grid: every grid cell whose
// CENTER falls inside the drawn polygon (tested in EPSG:32643 meters, not lat/lng)
// becomes a member of the zone. All member cells later receive the identical
// registry-sourced value -- there is no per-cell decay or distance weighting here or
// anywhere downstream in simulate.js.
//
// Tagging UI lives in the Mitigation/Adaptation view's sidebar panel (see
// mitigationView.js), not a Leaflet popup -- there's more room there for the
// NbS/engineered grouping and per-hazard confidence-tier coverage preview the pilot
// spec requires at placement time. This module only does geometry/state: draw
// lifecycle, UTM snapping, and exposing finalizeZone() for mitigationView.js to call
// once the user has actually picked a type and confirmed.

import { GEO } from './geo.js';

let zoneCounter = 0;

/** Planar polygon area (shoelace formula) for a ring of [x,y] UTM meter points. Not
 * turf.area(), which assumes WGS84 degree input and computes a geodesic area -- feeding
 * it meter values would silently produce a nonsense number. */
function planarAreaM2(ringUTM) {
  let sum = 0;
  for (let i = 0; i < ringUTM.length - 1; i++) {
    const [x1, y1] = ringUTM[i];
    const [x2, y2] = ringUTM[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

function snapToGrid(grid, ringUTM) {
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

  const turfPoly = turf.polygon([ringUTM]);
  const snapped = [];

  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colStart; c <= colEnd; c++) {
      const cell = grid.cellAt(r, c);
      if (!cell) continue;
      const [cminX, cminY, cmaxX, cmaxY] = grid.cellBoundsUTM(r, c);
      const centerX = (cminX + cmaxX) / 2;
      const centerY = (cminY + cmaxY) / 2;
      const inside = turf.booleanPointInPolygon(turf.point([centerX, centerY]), turfPoly);
      if (inside) {
        snapped.push({ ...cell, boundsUTM: [cminX, cminY, cmaxX, cmaxY] });
      }
    }
  }
  return snapped;
}

const ZONE_COLORS = {
  mangrove_belt_100m: '#2e7d32',
  khazan_bund: '#6d4c41',
  mangrove_embankment: '#00695c',
  mangrove_fronted_khazan: '#1565c0',
  levee_embankment: '#3d5a80',
  seawall: '#293241',
};

export function zoneColor(mitigationName) {
  return ZONE_COLORS[mitigationName] || '#888888';
}

const PENDING_COLOR = '#ff8a00';

/**
 * onPendingZone(layer): called right after a polygon is drawn, before it's tagged --
 * the caller (main.js/mitigationView.js) is responsible for showing the tag panel and
 * eventually calling either finalizeZone(layer, mitigationName) or cancelPendingZone(layer).
 * onZoneFinalized(zone, 'create'|'select'), onZoneRemoved(zone): unchanged from before.
 */
export function setupDrawing(map, getGrid, onPendingZone, onZoneFinalized, onZoneRemoved) {
  const drawnItems = new L.FeatureGroup().addTo(map);
  const snapLayer = new L.FeatureGroup().addTo(map);
  const zones = new Map();

  const drawControl = new L.Control.Draw({
    position: 'topright',
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: false,
        shapeOptions: { color: PENDING_COLOR, weight: 2 },
      },
      polyline: false,
      rectangle: false,
      circle: false,
      circlemarker: false,
      marker: false,
    },
    edit: {
      featureGroup: drawnItems,
      remove: true,
    },
  });

  function finalizeZone(layer, mitigationName) {
    const grid = getGrid();
    const latlngs = layer.getLatLngs()[0];
    const ringLngLat = latlngs.map((ll) => [ll.lng, ll.lat]);
    // close ring if needed
    if (
      ringLngLat[0][0] !== ringLngLat[ringLngLat.length - 1][0] ||
      ringLngLat[0][1] !== ringLngLat[ringLngLat.length - 1][1]
    ) {
      ringLngLat.push(ringLngLat[0]);
    }
    const ringUTM = GEO.ringToUTM(ringLngLat);
    const areaM2 = planarAreaM2(ringUTM);
    const snappedCells = snapToGrid(grid, ringUTM);

    layer.setStyle({ color: zoneColor(mitigationName), weight: 2, fillOpacity: 0.15 });

    const zoneId = `zone-${++zoneCounter}`;
    const cellLayers = snappedCells.map((cell) => {
      const [minX, minY, maxX, maxY] = cell.boundsUTM;
      const ring = [
        [minX, maxY],
        [maxX, maxY],
        [maxX, minY],
        [minX, minY],
        [minX, maxY],
      ];
      const latlngRing = GEO.ringToWGS84(ring).map(([lng, lat]) => [lat, lng]);
      return L.polygon(latlngRing, {
        color: zoneColor(mitigationName),
        weight: 1,
        fillOpacity: 0.35,
        interactive: false,
      }).addTo(snapLayer);
    });

    const zone = {
      id: zoneId,
      mitigationName,
      layer,
      cellLayers,
      areaM2,
      cellSizeM: grid.cellSizeM,
      snappedCells,
      ringUTM,
    };
    zones.set(zoneId, zone);

    layer.on('click', () => onZoneFinalized(zone, 'select'));
    onZoneFinalized(zone, 'create');
    return zone;
  }

  function cancelPendingZone(layer) {
    drawnItems.removeLayer(layer);
  }

  function removeZone(zoneId) {
    const zone = zones.get(zoneId);
    if (!zone) return;
    drawnItems.removeLayer(zone.layer);
    zone.cellLayers.forEach((cl) => snapLayer.removeLayer(cl));
    zones.delete(zoneId);
    onZoneRemoved(zone);
  }

  map.on(L.Draw.Event.CREATED, (e) => {
    const layer = e.layer;
    drawnItems.addLayer(layer);
    onPendingZone(layer);
  });

  map.on(L.Draw.Event.DELETED, (e) => {
    e.layers.eachLayer((layer) => {
      for (const [id, zone] of zones) {
        if (zone.layer === layer) {
          zone.cellLayers.forEach((cl) => snapLayer.removeLayer(cl));
          zones.delete(id);
          onZoneRemoved(zone);
        }
      }
    });
  });

  return { zones, drawnItems, snapLayer, drawControl, finalizeZone, cancelPendingZone, removeZone };
}
