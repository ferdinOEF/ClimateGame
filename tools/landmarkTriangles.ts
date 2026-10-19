/**
 * Section 18: triangles per landmark model and in total, and each model's plan
 * size at scale 1. Usage: npx tsx tools/landmarkTriangles.ts
 */
import { landmarkGeometry, LANDMARK_IDS } from "../src/render/landmarkModels";
let total = 0;
for (const id of LANDMARK_IDS) {
  const g = landmarkGeometry(id)!;
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const t = g.attributes.position.count / 3;
  total += t;
  console.log(id.padEnd(32), String(t).padStart(6), "tris", `w ${(b.max.x - b.min.x).toFixed(2)} d ${(b.max.z - b.min.z).toFixed(2)} h ${b.max.y.toFixed(2)} minY ${b.min.y.toFixed(2)} halfDiag ${(Math.hypot(Math.max(-b.min.x, b.max.x), Math.max(-b.min.z, b.max.z))).toFixed(2)}`);
}
console.log("total", total);
