import * as THREE from "three";

/**
 * STEP_PROMPT element-icon-redesign pass: every element built from real
 * low-poly 3D primitives (boxes, tapered cylinders/prisms, domes, thin
 * angled blades) with per-vertex color baked in, rather than the earlier
 * generation's thin flat-cutout icons (`flatIcon`, still used nowhere
 * after this pass). Multi-color parts need a real `color` vertex
 * attribute, not just the per-instance tint `ElementMeshManager` applies
 * on top (that still runs — see its own comment — this is what it
 * multiplies against). Segment counts are kept low (6-8) on purpose to
 * stay in the same low-poly family as the hex-prism terrain.
 */

/**
 * `mergeGeometries` refuses to merge a mix of indexed and non-indexed
 * geometries ("make sure index attribute exists among all geometries, or
 * in none of them") — `ExtrudeGeometry` (used by `taperedSlab`/`blade`)
 * comes out non-indexed, while `BoxGeometry`/`CylinderGeometry`/
 * `SphereGeometry` come out indexed, so any element mixing both families
 * (nearly all of them) would silently fail to merge (returns `null`)
 * without this. De-indexing everything here, in the one function every
 * primitive already funnels through, keeps every individual builder free
 * to mix primitive types without having to know about this.
 */
function paint(geometry: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const color = new THREE.Color(hex);
  const count = flat.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return flat;
}

/** A solid box sitting on the tile, base at y=0 unless `baseY` overrides it. */
export function box(width: number, height: number, depth: number, color: string, baseY = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(width, height, depth);
  g.translate(0, baseY + height / 2, 0);
  return paint(g, color);
}

/**
 * A trapezoid-cross-section slab (wider base, narrower top, or vice
 * versa) extruded along depth — the wall-family shape (Seawall, Small
 * Dam, Khazan's bund) and the Dune ridge shape share this construction.
 */
export function taperedSlab(
  bottomWidth: number,
  topWidth: number,
  height: number,
  depth: number,
  color: string,
  baseY = 0
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-bottomWidth / 2, 0);
  shape.lineTo(bottomWidth / 2, 0);
  shape.lineTo(topWidth / 2, height);
  shape.lineTo(-topWidth / 2, height);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, baseY, -depth / 2);
  return paint(g, color);
}

/** A tapered cylinder (cone frustum) — trunks, dam buttresses, dredge-arm segments. */
export function coneFrustum(
  topRadius: number,
  bottomRadius: number,
  height: number,
  radialSegments: number,
  color: string,
  baseY = 0
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(topRadius, bottomRadius, height, radialSegments);
  g.translate(0, baseY + height / 2, 0);
  return paint(g, color);
}

/** A squashed sphere (dome/canopy mass) — Mangrove's canopy, low rounded forms. */
export function dome(radiusX: number, radiusY: number, radiusZ: number, color: string, baseY = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 8, 6);
  g.scale(radiusX, radiusY, radiusZ);
  g.translate(0, baseY + radiusY, 0);
  return paint(g, color);
}

/** A thin flat angled blade/panel — grass tufts, pandanus/palm fronds, prop-root struts, the sluice-gate slats. */
export function blade(points: [number, number][], color: string, thickness = 0.06): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.translate(0, 0, -thickness / 2);
  return paint(g, color);
}

/**
 * A shallow solid built from a top-down (X,Z) footprint extruded upward
 * by `height` — the Yacht hull's lens/canoe shape (tapered at both ends,
 * low profile) is the first thing that needed this: `taperedSlab`/`blade`
 * both build a shape in the XY plane extruded along depth (a wall or a
 * standing-upright panel), the wrong orientation for something meant to
 * sit flat and low like a hull. `points` are (x, z) pairs.
 */
export function plan(points: [number, number][], height: number, color: string, baseY = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const [x, z] of points.slice(1)) shape.lineTo(x, z);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // (x, y, z) -> (x, z, -y): the shape's own plane becomes the (X,Z) footprint, its extrusion becomes height (+Y)
  g.translate(0, baseY, 0);
  return paint(g, color);
}

/** Rotates a geometry in place (radians) — for angling struts, fronds, tufts, arms. Returns the same geometry for chaining. */
export function rotate(g: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  g.rotateX(x);
  g.rotateY(y);
  g.rotateZ(z);
  return g;
}

/** Translates a geometry in place. Returns the same geometry for chaining. */
export function move(g: THREE.BufferGeometry, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  g.translate(x, y, z);
  return g;
}

/** Scales a geometry in place about the local origin — every primitive here already sits base-at-y=0, so a uniform scale shrinks a whole clump (trunk, roots, canopy) without lifting it off the ground. Returns the same geometry for chaining. */
export function scale(g: THREE.BufferGeometry, x: number, y = x, z = x): THREE.BufferGeometry {
  g.scale(x, y, z);
  return g;
}
