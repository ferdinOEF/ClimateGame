// Leaflet base map: boundary outline, DEM grid overlay, CZMP reference overlay.
// Pure map/layer plumbing -- no risk numbers computed or displayed here.

import { GEO } from './geo.js';
import { renderGridToImage, legendRamp } from './gridRenderer.js';

/**
 * @param demBoundsUTM {minX,minY,maxX,maxY} in EPSG:32643 -- the DEM raster's own
 *   extent (data/panjim_dem.tif), which the CZMP overlay was clipped to match. This
 *   is the actual "what data do we have" extent, and it's what the map's pannable/
 *   zoomable world is clipped to -- distinct from panjim_boundary.geojson, which is
 *   a smaller working analysis polygon drawn as reference context inside it (the
 *   DEM/CZMP extent was originally clipped as that boundary + a 300m buffer, so the
 *   DEM extent is always a strict superset of the boundary polygon).
 */
export async function initMap(demBoundsUTM) {
  const map = L.map('map', { zoomControl: false });
  L.control.zoom({ position: 'topright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  const boundaryResp = await fetch('data/panjim_boundary.geojson');
  const boundaryGeoJSON = await boundaryResp.json();
  const boundaryLayer = L.geoJSON(boundaryGeoJSON, {
    style: {
      color: '#ff8a00',
      weight: 2,
      dashArray: '6 4',
      fill: false,
    },
  }).addTo(map);

  // Clip the explorable map to the actual DEM/CZMP data extent -- this pilot only
  // covers the Mandovi estuary reach we have real data for, so panning or zooming
  // out to open ocean / blank tiles beyond it isn't useful and implies false coverage.
  // Force Leaflet to re-read the container's actual rendered pixel size before
  // computing any bounds-fit zoom. L.map() caches container size once, at
  // construction time -- if the flex layout (header + sidebar + #map at
  // calc(100vh - 58px)) hasn't fully settled at that exact instant, every zoom
  // calculation after this point (getBoundsZoom, fitBounds, setMinZoom) silently
  // computes against a stale/wrong size, with no error thrown. Symptom: the map
  // renders zoomed much further out than the data extent warrants. This is a
  // well-documented Leaflet gotcha in dynamic/flex layouts.
  map.invalidateSize();

  const sw = GEO.utmToLatLng([demBoundsUTM.minX, demBoundsUTM.minY]);
  const ne = GEO.utmToLatLng([demBoundsUTM.maxX, demBoundsUTM.maxY]);
  const dataBounds = L.latLngBounds([sw.lat, sw.lng], [ne.lat, ne.lng]);

  const fitZoom = map.getBoundsZoom(dataBounds);
  map.setMinZoom(fitZoom);
  map.setMaxZoom(fitZoom + 8);
  map.options.maxBoundsViscosity = 1.0;
  map.setMaxBounds(dataBounds);
  map.fitBounds(dataBounds, { padding: [12, 12] });

  // Belt-and-braces: re-assert on the next animation frame. Some browsers finish
  // settling flex-child layout a frame after synchronous script execution,
  // especially with content the sidebar still has to render (the legend, drawn in
  // later in main.js) -- which can invalidate the size Leaflet just cached above.
  requestAnimationFrame(() => {
    map.invalidateSize();
    map.setMaxBounds(dataBounds);
    map.fitBounds(dataBounds, { padding: [12, 12] });
  });

  const state = {
    map,
    boundaryLayer,
    dataBounds,
    gridOverlay: null,
    czmpOverlay: null,
  };

  return state;
}

export function setGridLayer(state, grid) {
  if (state.gridOverlay) {
    state.map.removeLayer(state.gridOverlay);
    state.gridOverlay = null;
  }
  const { dataUrl, boundsLatLng } = renderGridToImage(grid);
  state.gridOverlay = L.imageOverlay(dataUrl, boundsLatLng, {
    opacity: 0.75,
    className: 'dem-grid-overlay',
  }).addTo(state.map);
  return state.gridOverlay;
}

export async function addCzmpLayer(state) {
  const bounds = await fetch('data/czmp_bounds.json').then((r) => r.json());
  state.czmpBoundsMeta = bounds;
  state.czmpOverlay = L.imageOverlay(
    'data/czmp.png',
    [
      [bounds.south, bounds.west],
      [bounds.north, bounds.east],
    ],
    { opacity: 0.85 }
  );
  // Not added to map by default -- reference layer is opt-in (see METRIC #5: it's a
  // scanned map, not authoritative vector data, so it should never look "on by default"
  // like ground truth).
  return state.czmpOverlay;
}

export function toggleCzmpLayer(state, visible) {
  if (!state.czmpOverlay) return;
  if (visible) {
    state.czmpOverlay.addTo(state.map);
  } else {
    state.map.removeLayer(state.czmpOverlay);
  }
}

export function toggleGridLayer(state, visible) {
  if (!state.gridOverlay) return;
  if (visible) {
    state.gridOverlay.addTo(state.map);
  } else {
    state.map.removeLayer(state.gridOverlay);
  }
}

export { legendRamp };