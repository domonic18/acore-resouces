import * as THREE from "three";
import type { M2Data, M2SkinData } from "./types";
import { convertM2Position, convertM2Normal } from "./coordinates";
import {
  BONE_WEIGHT_MAX,
  MAX_BONE_INFLUENCES,
  UV_FLIP_V_OFFSET,
  UV_FLIP_V_SCALE,
} from "./constants";

export interface SubmeshGeometry {
  geometry: THREE.BufferGeometry;
  hasSkinning: boolean;
}

export function buildSubmeshGeometry(
  m2: M2Data,
  skin: M2SkinData,
  submeshIndex: number,
): SubmeshGeometry | null {
  const submesh = skin.submeshes[submeshIndex];
  if (!submesh || submesh.triangleCount === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  const skinVertexSet = new Set<number>();
  const { startTriangle, triangleCount } = submesh;
  const endTriangle = startTriangle + triangleCount;

  for (let i = startTriangle; i < endTriangle; i++) {
    skinVertexSet.add(skin.triangles[i]);
  }

  if (skinVertexSet.size === 0) {
    return null;
  }

  const uniqueSkinVertices = Array.from(skinVertexSet);
  const indexMap = new Map<number, number>();
  uniqueSkinVertices.forEach((skinVertexIndex, newIndex) => {
    indexMap.set(skinVertexIndex, newIndex);
  });

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];

  const hasSkinBones = skin.skinBoneIndices.length > 0;
  const boneLookupBase = submesh.startBone;

  for (const skinVertexIndex of uniqueSkinVertices) {
    const vertexIndex = skin.indices[skinVertexIndex];
    const vertex = m2.vertices[vertexIndex];
    if (!vertex) continue;

    positions.push(...convertM2Position(vertex.position));
    normals.push(...convertM2Normal(vertex.normal));
    uvs.push(
      vertex.textureCoords[0][0],
      UV_FLIP_V_SCALE * vertex.textureCoords[0][1] + UV_FLIP_V_OFFSET,
    );

    if (hasSkinBones) {
      const totalWeight = vertex.boneWeights.reduce((sum, w) => sum + w, 0);
      const weightScale = totalWeight > 0 ? totalWeight : BONE_WEIGHT_MAX;
      const boneBase = skinVertexIndex * MAX_BONE_INFLUENCES;
      for (let i = 0; i < MAX_BONE_INFLUENCES; i++) {
        const localBone = skin.skinBoneIndices[boneBase + i];
        const lookupIndex = boneLookupBase + localBone;
        let globalBone =
          lookupIndex >= 0 && lookupIndex < m2.boneLookups.length
            ? m2.boneLookups[lookupIndex]
            : localBone;
        if (globalBone < 0 || globalBone >= m2.bones.length) {
          globalBone = 0;
        }
        skinIndices.push(globalBone);
        skinWeights.push(vertex.boneWeights[i] / weightScale);
      }
    }
  }

  if (positions.length === 0) {
    return null;
  }

  const indices: number[] = [];
  for (let i = startTriangle; i < endTriangle; i += 3) {
    const a = indexMap.get(skin.triangles[i]) ?? 0;
    const b = indexMap.get(skin.triangles[i + 1]) ?? 0;
    const c = indexMap.get(skin.triangles[i + 2]) ?? 0;
    indices.push(a, b, c);
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  if (hasSkinBones) {
    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(skinIndices, 4),
    );
    geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(skinWeights, 4),
    );
  }

  if (indices.length > 0) {
    geometry.setIndex(indices);
  }
  geometry.computeVertexNormals();

  return { geometry, hasSkinning: hasSkinBones };
}
