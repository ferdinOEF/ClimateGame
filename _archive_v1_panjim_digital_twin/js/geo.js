// Coordinate conversion between WGS84 (lat/lng, what Leaflet/the UI speaks) and
// EPSG:32643 / UTM Zone 43N (what every distance, area, and grid-snap calculation
// in this app must be done in -- see METRIC #1: no meter-based math in degrees).
//
// Loaded after the proj4 CDN script (see index.html), before any module that
// needs coordinate conversion (dem.js, zones.js, map.js).

const UTM43N = '+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs';
const WGS84 = 'WGS84';

proj4.defs('EPSG:32643', UTM43N);

export const GEO = {
  /** [lng, lat] -> [x, y] meters in EPSG:32643 */
  toUTM(lngLat) {
    return proj4(WGS84, 'EPSG:32643', lngLat);
  },

  /** [x, y] meters in EPSG:32643 -> [lng, lat] */
  toWGS84(xy) {
    return proj4('EPSG:32643', WGS84, xy);
  },

  /** Leaflet LatLng -> [x, y] meters in EPSG:32643 */
  latLngToUTM(latlng) {
    return this.toUTM([latlng.lng, latlng.lat]);
  },

  /** [x, y] meters in EPSG:32643 -> Leaflet LatLng-shaped {lat, lng} */
  utmToLatLng(xy) {
    const [lng, lat] = this.toWGS84(xy);
    return { lat, lng };
  },

  /** Ring of [lng,lat] pairs (Leaflet/GeoJSON order) -> ring of [x,y] meters in UTM43N */
  ringToUTM(ring) {
    return ring.map((pt) => this.toUTM(pt));
  },

  /** Ring of [x,y] meters in UTM43N -> ring of [lng,lat] pairs */
  ringToWGS84(ring) {
    return ring.map((pt) => this.toWGS84(pt));
  },
};
