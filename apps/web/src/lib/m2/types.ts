export interface M2Vertex {
  position: Float32Array;
  boneWeights: Uint8Array;
  boneIndices: Uint8Array;
  normal: Float32Array;
  textureCoords: Float32Array[];
}

export interface M2Texture {
  type: number;
  flags: number;
  filename: string;
}

export interface M2Material {
  renderFlags: number;
  blendingMode: number;
}

export interface M2Bone {
  keyBoneID: number;
  flags: number;
  parentID: number;
  submeshID: number;
  pivotPoint: Float32Array;
}

export interface M2Data {
  version: number;
  name: string;
  vertices: M2Vertex[];
  bones: M2Bone[];
  textures: M2Texture[];
  materials: M2Material[];
  textureLookups: number[];
}

export interface M2SkinSubmesh {
  partID: number;
  level: number;
  startVertex: number;
  vertexCount: number;
  startTriangle: number;
  triangleCount: number;
  boneCount: number;
  startBone: number;
  boneInfluences: number;
  rootBone: number;
  centerMass: Float32Array;
  centerBoundingBox: Float32Array;
  radius: number;
}

export interface M2SkinBatch {
  flags: number;
  shaderID: number;
  submeshIndex: number;
  submeshIndex2: number;
  vertexColorAnimationIndex: number;
  materialIndex: number;
  layer: number;
  opCount: number;
  textureLookup: number;
  textureMappingIndex: number;
  transparencyAnimationLookup: number;
  uvAnimationLookup: number;
}

export interface M2SkinData {
  indices: Uint16Array;
  triangles: Uint16Array;
  submeshes: M2SkinSubmesh[];
  batches: M2SkinBatch[];
}

export interface ParsedM2 {
  m2: M2Data;
  skin: M2SkinData;
}
