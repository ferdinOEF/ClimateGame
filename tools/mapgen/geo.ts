/**
 * Geographic primitives for the city-map rasteriser.
 *
 * Everything here is plain geometry over a local tangent-plane projection.
 * It is deliberately small and dependency-free: the city definitions in
 * `cities.ts` are the interesting, checkable part, and this file only has
 * to turn lat/lon into metres and answer "how far is this point from that
 * line" without surprises.
 *
 * WHY A LOCAL PROJECTION AND NOT A REAL ONE
 *
 * Goa spans about 0.9 degrees of latitude. Over a single city map (8 km
 * across at most) an equirectangular projection about the map's own centre
 * is accurate to well under one metre, which is three orders of magnitude
 * finer than a 450 m hex. Pulling in proj4 to do better would change
 * nothing any player could see.
 *
 * The one thing that DOES matter is the cos(lat) term on longitude. Drop it
 * and every map comes out stretched east-west by about 3.5% at Goa's
 * latitude — small, but it is exactly the kind of error that makes a
 * traced coastline stop matching the real one.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/** A point on the local tangent plane: metres east, metres north of the map origin. */
export interface Metres {
  x: number;
  y: number;
}

/** Metres per degree of latitude. WGS84 meridional arc at 15 degrees N. */
const M_PER_DEG_LAT = 110_570;
/** Metres per degree of longitude at the equator; scaled by cos(lat) below. */
const M_PER_DEG_LON_EQUATOR = 111_320;

export function project(point: LatLon, origin: LatLon): Metres {
  const latScale = Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lon - origin.lon) * M_PER_DEG_LON_EQUATOR * latScale,
    y: (point.lat - origin.lat) * M_PER_DEG_LAT
  };
}

export function unproject(point: Metres, origin: LatLon): LatLon {
  const latScale = Math.cos((origin.lat * Math.PI) / 180);
  return {
    lat: origin.lat + point.y / M_PER_DEG_LAT,
    lon: origin.lon + point.x / (M_PER_DEG_LON_EQUATOR * latScale)
  };
}

/**
 * Shortest distance from `p` to the polyline `line`, in the same units as
 * the inputs. Returns Infinity for a line with fewer than two points
 * rather than throwing — a one-point "river" is a data error worth
 * surviving, and the caller's own validation reports it properly.
 */
export function distanceToPolyline(p: Metres, line: readonly Metres[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return Math.hypot(p.x - line[0].x, p.y - line[0].y);

  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    best = Math.min(best, distanceToSegment(p, line[i], line[i + 1]));
  }
  return best;
}

export function distanceToSegment(p: Metres, a: Metres, b: Metres): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  // Parameter of the closest point on the infinite line, clamped to the
  // segment so the result is a distance to the segment, not to its
  // extension.
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Where along a polyline the closest point to `p` sits, as a fraction of
 * total length in [0, 1].
 *
 * This is what lets a river taper: the channel is wide at the mouth and
 * narrow upstream, so the rasteriser needs to know not just HOW FAR a hex
 * is from the centreline but HOW FAR ALONG it the nearest point is.
 */
export function positionAlongPolyline(p: Metres, line: readonly Metres[]): number {
  if (line.length < 2) return 0;

  const lengths: number[] = [0];
  for (let i = 0; i < line.length - 1; i++) {
    lengths.push(lengths[i] + Math.hypot(line[i + 1].x - line[i].x, line[i + 1].y - line[i].y));
  }
  const total = lengths[lengths.length - 1];
  if (total === 0) return 0;

  let best = Infinity;
  let bestDistanceAlong = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    const distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (distance < best) {
      best = distance;
      bestDistanceAlong = lengths[i] + t * Math.sqrt(lengthSquared);
    }
  }
  return bestDistanceAlong / total;
}

/**
 * Even-odd point-in-polygon. The polygon is treated as closed — the caller
 * does not repeat the first vertex at the end.
 *
 * A point exactly on an edge may land either way. That is acceptable here:
 * hex centres falling precisely on a traced coastline vertex to within
 * floating-point equality does not happen in practice, and if it did, the
 * tile either side of the line is equally defensible.
 */
export function pointInPolygon(p: Metres, polygon: readonly Metres[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.y > p.y !== b.y > p.y;
    if (!straddles) continue;
    const xAtP = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
    if (p.x < xAtP) inside = !inside;
  }
  return inside;
}

/** Shortest distance from `p` to a polygon's boundary, ignoring whether `p` is inside or outside. */
export function distanceToPolygonEdge(p: Metres, polygon: readonly Metres[]): number {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    best = Math.min(best, distanceToSegment(p, polygon[i], polygon[j]));
  }
  return best;
}

/**
 * True when `p` lies beyond one of the polyline's two ends — behind the
 * plane through the first vertex, or past the plane through the last.
 *
 * This is what stops a river bleeding into open sea. `distanceToPolyline`
 * measures to the nearest point including the endpoints, so a channel
 * 1.2 km wide paints a 600 m half-disc of water beyond its mouth vertex —
 * on screen, a finger of river reaching out into the Arabian Sea. Clipping
 * at both ends turns the mouth into a clean cut across the headlands, and
 * stops the upstream end from blobbing past its last waypoint too.
 */
export function beyondPolylineEnds(p: Metres, line: readonly Metres[]): boolean {
  if (line.length < 2) return false;

  const startParameter = segmentParameter(p, line[0], line[1]);
  if (startParameter < 0) return true;

  const endParameter = segmentParameter(p, line[line.length - 2], line[line.length - 1]);
  return endParameter > 1;
}

/** Where `p` projects onto the infinite line through `a`-`b`, as a multiple of that segment's length. Not clamped — the sign is the useful part. */
function segmentParameter(p: Metres, a: Metres, b: Metres): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return 0;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
}

/**
 * Linear interpolation across a list of per-vertex values, sampled at
 * `fraction` of the way along. Used for river channel width, which is
 * authored per waypoint and needs a value at an arbitrary point between
 * two of them.
 */
export function sampleTapered(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const clamped = Math.max(0, Math.min(1, fraction));
  const scaled = clamped * (values.length - 1);
  const index = Math.min(values.length - 2, Math.floor(scaled));
  const t = scaled - index;
  return values[index] * (1 - t) + values[index + 1] * t;
}
