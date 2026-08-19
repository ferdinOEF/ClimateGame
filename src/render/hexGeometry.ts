import * as THREE from "three";

/**
 * A pointy-top hex prism, matching Dorfromantik's tile silhouette (a vertex
 * points toward the camera's "up" edge of the tile, flat sides left/right).
 *
 * THREE.CylinderGeometry's default 6-segment cross-section already places a
 * vertex on +Z/-Z (radialSegments start at theta=0 -> +Z), which is exactly
 * the "pointy-top" orientation axialToWorld's spacing formula assumes. No
 * extra rotation here — adding one would desync the geometry's silhouette
 * from the axial math and break edge-to-edge tessellation.
 */
export function createHexPrismGeometry(radius: number, height: number): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 6, 1, false);
  geometry.translate(0, height / 2, 0);
  return geometry;
}
