import * as THREE from "three";
import type { AxialCoord } from "@core/hex";
import { axialToWorld } from "@core/hex";
import { createHexPrismGeometry } from "./hexGeometry";
import { jitterColor, paletteColor } from "./palette";
import terrainData from "@data/terrain.json";

export interface TerrainDef {
  id: string;
  name: string;
  edgeTypes: string[];
  elevationTier: "coastal" | "midland" | "highland";
  flammability: number;
  decorationDensityRange: [number, number];
  colorKey: string;
}

export const TERRAIN_DEFS: TerrainDef[] = terrainData as TerrainDef[];
export const TERRAIN_BY_ID = new Map(TERRAIN_DEFS.map((t) => [t.id, t]));

export const HEX_SIZE = 1.0;
const MAX_INSTANCES_PER_TYPE = 400;

const TIER_HEIGHT: Record<TerrainDef["elevationTier"], number> = {
  coastal: 0.45,
  midland: 0.85,
  highland: 1.35
};

interface TerrainInstance {
  coord: AxialCoord;
  index: number;
}

export class TerrainMeshManager {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private counts = new Map<string, number>();
  private placed = new Map<string, TerrainInstance>();

  constructor() {
    for (const terrain of TERRAIN_DEFS) {
      const height = TIER_HEIGHT[terrain.elevationTier];
      const geometry = createHexPrismGeometry(HEX_SIZE * 0.98, height);
      // Per-instance tint comes from InstancedMesh.instanceColor, which the
      // renderer picks up automatically — vertexColors is for a per-vertex
      // `color` geometry attribute we don't have, and would otherwise force
      // the shader to multiply against a missing (black) attribute.
      const material = new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.9,
        metalness: 0.0
      });
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES_PER_TYPE);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES_PER_TYPE * 3), 3);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = `terrain-${terrain.id}`;
      this.meshes.set(terrain.id, mesh);
      this.counts.set(terrain.id, 0);
      this.group.add(mesh);
    }
  }

  height(terrainId: string): number {
    const terrain = TERRAIN_BY_ID.get(terrainId);
    return terrain ? TIER_HEIGHT[terrain.elevationTier] : TIER_HEIGHT.midland;
  }

  hasTile(coord: AxialCoord): boolean {
    return this.placed.has(`${coord.q},${coord.r}`);
  }

  placeTile(coord: AxialCoord, terrainId: string): void {
    const terrain = TERRAIN_BY_ID.get(terrainId);
    if (!terrain) throw new Error(`Unknown terrain id: ${terrainId}`);
    const mesh = this.meshes.get(terrainId)!;
    const index = this.counts.get(terrainId)!;
    if (index >= MAX_INSTANCES_PER_TYPE) throw new Error(`Terrain instance cap exceeded for ${terrainId}`);

    const { x, z } = axialToWorld(coord, HEX_SIZE);
    const matrix = new THREE.Matrix4().makeTranslation(x, 0, z);
    mesh.setMatrixAt(index, matrix);

    const seed = coord.q * 31 + coord.r * 17;
    const color = jitterColor(paletteColor(terrain.colorKey), seed);
    mesh.setColorAt(index, color);

    this.counts.set(terrainId, index + 1);
    mesh.count = index + 1;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.placed.set(`${coord.q},${coord.r}`, { coord, index });
  }
}
