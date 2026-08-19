// Local-features map layer (METRIC #2). One marker per local_features row that has
// coordinates, styled distinctly by feature_type. Clicking a marker (or a no-location
// list entry) hands feature_id to the caller's onFeatureClick -- this module never
// queries governance/livelihood/cultural/participatory data itself, that's
// featureDetail.js's job, queried live only when a feature is actually opened.
//
// Not every local_features row has latitude/longitude (e.g. "Chorao Island khazans
// (general)" is an aggregate placeholder with no surveyed point location -- see
// data/registry.db). Inventing a centroid or a plausible-looking point for it would be
// exactly the kind of fabricated-looking entry this build must not produce, so features
// without coordinates are never placed on the map; they're listed separately (still
// clickable, still opening the same detail panel) so METRIC #2's detail-panel guarantees
// apply uniformly regardless of whether a feature happens to have a mapped point.

const FEATURE_TYPE_COLORS = {
  protected_habitat: '#2e7d32',
  khazan_parcel: '#8d6e63',
};
const FALLBACK_PALETTE = ['#5c6bc0', '#ab47bc', '#26a69a', '#ef6c00'];

export function featureTypeColor(featureType) {
  if (FEATURE_TYPE_COLORS[featureType]) return FEATURE_TYPE_COLORS[featureType];
  // Deterministic fallback so a feature_type the app hasn't special-cased yet still
  // gets a stable, distinct color instead of falling back to a single flat gray for
  // everything unrecognized.
  let hash = 0;
  for (let i = 0; i < featureType.length; i++) hash = (hash * 31 + featureType.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

export function setupLocalFeaturesLayer(map, features, onFeatureClick) {
  const layer = new L.LayerGroup();
  const withCoords = features.filter((f) => f.latitude != null && f.longitude != null);
  const withoutCoords = features.filter((f) => f.latitude == null || f.longitude == null);

  withCoords.forEach((feature) => {
    const marker = L.circleMarker([feature.latitude, feature.longitude], {
      radius: 8,
      color: '#ffffff',
      weight: 2,
      fillColor: featureTypeColor(feature.feature_type),
      fillOpacity: 0.9,
    });
    marker.bindTooltip(feature.name, { direction: 'top', offset: [0, -6] });
    marker.on('click', () => onFeatureClick(feature.feature_id));
    marker.addTo(layer);
  });

  return { layer, withCoords, withoutCoords };
}

export function renderNoLocationList(container, features, onFeatureClick) {
  container.innerHTML = '';
  if (features.length === 0) return;

  const heading = document.createElement('div');
  heading.className = 'no-location-heading';
  heading.textContent = 'No mapped coordinates yet:';
  container.appendChild(heading);

  features.forEach((feature) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'no-location-item';
    item.style.borderLeftColor = featureTypeColor(feature.feature_type);
    item.textContent = feature.name;
    item.addEventListener('click', () => onFeatureClick(feature.feature_id));
    container.appendChild(item);
  });
}

export function renderFeatureLegend(container, features) {
  const types = [...new Set(features.map((f) => f.feature_type))];
  container.innerHTML = types
    .map(
      (t) => `
      <div class="feature-legend-row">
        <span class="feature-legend-swatch" style="background:${featureTypeColor(t)}"></span>
        <span>${t.replace(/_/g, ' ')}</span>
      </div>`
    )
    .join('');
}
