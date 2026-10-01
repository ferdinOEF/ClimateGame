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

/**
 * STEP_PROMPT_hazard_vfx_and_fluidity.md Section 1: a flat hex top face
 * subdivided into a real triangle grid (not just the 6-triangle fan a
 * `CylinderGeometry` cap gives you), so a per-vertex sine wave displacement
 * (`waveMath.ts`) has enough resolution to actually read as a wave surface
 * rather than 6 giant tilting triangles. Same pointy-top orientation as
 * `createHexPrismGeometry` (vertex toward +Z/-Z) so river-water tiles built
 * from this tessellate edge-to-edge with the terrain hexes under them.
 *
 * Built as 6 sectors (center -> corner_k -> corner_{k+1}), each subdivided
 * into `segmentsPerEdge`^2 small triangles via barycentric interpolation —
 * the standard triangle-subdivision pattern. Every sector's own apex lands
 * on the same world position (the hex center) but is a distinct vertex, not
 * a shared/welded one — harmless for a flat-shaded water surface (no smooth
 * normal interpolation is riding on vertex sharing here) and far simpler
 * than deduplicating.
 */
export function createHexWaterGeometry(radius: number, segmentsPerEdge: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const corner = (k: number): [number, number] => {
    const angle = (Math.PI / 3) * k; // 6 corners, 60 degrees apart, matching the cylinder cap's own theta=0 -> +Z start
    return [radius * Math.sin(angle), radius * Math.cos(angle)];
  };
  for (let k = 0; k < 6; k++) {
    const [bx, bz] = corner(k);
    const [cx, cz] = corner(k + 1);
    const base = positions.length / 3;
    for (let i = 0; i <= segmentsPerEdge; i++) {
      for (let j = 0; j <= segmentsPerEdge - i; j++) {
        const u = i / segmentsPerEdge;
        const v = j / segmentsPerEdge;
        const x = u * bx + v * cx;
        const z = u * bz + v * cz;
        positions.push(x, 0, z);
      }
    }
    // Row-major index within this sector's triangular grid: row i has (segmentsPerEdge - i + 1) entries.
    const rowStart: number[] = [];
    let cursor = base;
    for (let i = 0; i <= segmentsPerEdge; i++) {
      rowStart.push(cursor);
      cursor += segmentsPerEdge - i + 1;
    }
    for (let i = 0; i < segmentsPerEdge; i++) {
      const rowLen = segmentsPerEdge - i + 1;
      for (let j = 0; j < rowLen - 1; j++) {
        const a = rowStart[i] + j;
        const b = rowStart[i] + j + 1;
        const c = rowStart[i + 1] + j;
        indices.push(a, b, c);
        if (j < rowLen - 2) {
          const d = rowStart[i + 1] + j + 1;
          indices.push(b, d, c);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
