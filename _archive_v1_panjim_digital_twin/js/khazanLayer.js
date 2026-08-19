// Khazan vector layer (METRIC C1/C2): 222 AI-extracted polygons from
// data/khazan_land_extracted_wgs84.geojson. Toggleable, default OFF, styled distinctly
// from both the CZMP raster (an image, not vector) and user-drawn zones (zones.js's
// ZONE_COLORS palette) -- amber dashed outline, no solid fill, so it never reads as
// either "the official map" or "something you drew."
//
// There is no README_khazan_extraction.md file in this project (checked -- it does not
// exist on disk). What DOES exist, and is used here instead, is that every one of the
// 222 features carries identical extraction_method/source/confidence properties baked
// into the GeoJSON itself (verified: only one distinct value per property across all
// 222 features). That's the actual disclosure content; this module reads it live from
// whichever feature was clicked rather than hardcoding a copy of it, so it stays
// correct if the source file is ever regenerated with different wording.

const KHAZAN_COLOR = '#b8860b';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

export async function loadKhazanLayer() {
  const resp = await fetch('data/khazan_land_extracted_wgs84.geojson');
  if (!resp.ok) throw new Error(`Failed to fetch khazan_land_extracted_wgs84.geojson: ${resp.status}`);
  const geojson = await resp.json();

  const layer = L.geoJSON(geojson, {
    style: {
      color: KHAZAN_COLOR,
      weight: 1.5,
      dashArray: '3 3',
      fill: true,
      fillColor: KHAZAN_COLOR,
      fillOpacity: 0.08,
    },
    onEachFeature: (feature, featureLayer) => {
      const p = feature.properties || {};
      const areaHa = p.area_m2 != null ? (p.area_m2 / 10000).toFixed(2) : 'unknown';
      const popup = document.createElement('div');
      popup.className = 'khazan-popup';
      popup.innerHTML = `
        <div class="khazan-popup-title">Extracted khazan polygon</div>
        <div class="khazan-popup-area">~${escapeHtml(areaHa)} ha</div>
        <div class="khazan-popup-disclosure">
          <strong>Not survey data.</strong> ${escapeHtml(p.extraction_method || 'Extraction method not recorded.')}
        </div>
        <div class="khazan-popup-meta">Source: ${escapeHtml(p.source || 'not recorded')}</div>
        <div class="khazan-popup-meta">Confidence: ${escapeHtml(p.confidence || 'not recorded')}</div>
      `;
      featureLayer.bindPopup(popup);
    },
  });

  return { layer, featureCount: geojson.features.length, geojson };
}

export function toggleKhazanLayer(map, layer, visible) {
  if (visible) {
    layer.addTo(map);
  } else {
    map.removeLayer(layer);
  }
}
