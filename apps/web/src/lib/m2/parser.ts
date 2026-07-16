import type {
  M2Bone,
  M2Data,
  M2Material,
  M2Sequence,
  M2SkinBatch,
  M2SkinData,
  M2SkinSubmesh,
  M2Texture,
  M2Track,
  M2Vertex,
  ParsedM2,
} from "./types";
import {
  BONE_STRIDE_CANDIDATES,
  COMPONENTS_PER_UV,
  COMPONENTS_PER_VECTOR,
  M2_HEADER_SIZE,
  M2_MAGIC,
  M2_VERSION_CATACLYSM,
  M2_VERSION_WOTLK,
  MAX_BONE_INFLUENCES,
  SKIN_MAGIC,
  STANDARD_BONE_SIZE,
  TEXTURE_COORD_SETS,
} from "./constants";

class BufferReader {
  private view: DataView;
  private _offset = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  get length(): number {
    return this.view.byteLength;
  }

  get offset(): number {
    return this._offset;
  }

  seek(offset: number): void {
    this._offset = offset;
  }

  skip(bytes: number): void {
    this._offset += bytes;
  }

  readUint8(): number {
    const value = this.view.getUint8(this._offset);
    this._offset += 1;
    return value;
  }

  readInt16(): number {
    const value = this.view.getInt16(this._offset, true);
    this._offset += 2;
    return value;
  }

  readUint16(): number {
    const value = this.view.getUint16(this._offset, true);
    this._offset += 2;
    return value;
  }

  readInt32(): number {
    const value = this.view.getInt32(this._offset, true);
    this._offset += 4;
    return value;
  }

  readUint32(): number {
    const value = this.view.getUint32(this._offset, true);
    this._offset += 4;
    return value;
  }

  readFloat32(): number {
    const value = this.view.getFloat32(this._offset, true);
    this._offset += 4;
    return value;
  }

  readFloat32Array(count: number): Float32Array {
    const array = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      array[i] = this.readFloat32();
    }
    return array;
  }

  readUint8Array(count: number): Uint8Array {
    const array = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      array[i] = this.readUint8();
    }
    return array;
  }

  readUint16Array(count: number): Uint16Array {
    const array = new Uint16Array(count);
    for (let i = 0; i < count; i++) {
      array[i] = this.readUint16();
    }
    return array;
  }

  readUint32Array(count: number): Uint32Array {
    const array = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      array[i] = this.readUint32();
    }
    return array;
  }

  readCString(maxLength: number): string {
    let end = this._offset;
    const limit = Math.min(this._offset + maxLength, this.view.byteLength);
    while (end < limit && this.view.getUint8(end) !== 0) {
      end++;
    }
    const bytes = new Uint8Array(
      this.view.buffer,
      this._offset,
      end - this._offset,
    );
    this._offset = end;
    return new TextDecoder("utf-8").decode(bytes);
  }

  readBytes(count: number): Uint8Array {
    const bytes = new Uint8Array(this.view.buffer, this._offset, count);
    this._offset += count;
    return bytes;
  }
}

function readVertex(reader: BufferReader): M2Vertex {
  const position = reader.readFloat32Array(COMPONENTS_PER_VECTOR);
  const boneWeights = reader.readUint8Array(MAX_BONE_INFLUENCES);
  const boneIndices = reader.readUint8Array(MAX_BONE_INFLUENCES);
  const normal = reader.readFloat32Array(COMPONENTS_PER_VECTOR);
  const textureCoords: Float32Array[] = [];
  for (let i = 0; i < TEXTURE_COORD_SETS; i++) {
    textureCoords.push(reader.readFloat32Array(COMPONENTS_PER_UV));
  }
  return { position, boneWeights, boneIndices, normal, textureCoords };
}

function readTexture(reader: BufferReader): M2Texture {
  const type = reader.readUint32();
  const flags = reader.readUint32();
  const filenameLength = reader.readUint32();
  const filenameOffset = reader.readUint32();

  const savedOffset = reader.offset;
  reader.seek(filenameOffset);
  const filename = reader.readCString(filenameLength);
  reader.seek(savedOffset);

  return { type, flags, filename };
}

function readMaterial(reader: BufferReader): M2Material {
  const renderFlags = reader.readUint16();
  const blendingMode = reader.readUint16();
  return { renderFlags, blendingMode };
}

function readTrack(reader: BufferReader): M2Track {
  const interpolationType = reader.readUint16();
  const globalSequence = reader.readUint16();
  const timestampsCount = reader.readUint32();
  const timestampsOffset = reader.readUint32();
  const valuesCount = reader.readUint32();
  const valuesOffset = reader.readUint32();

  return {
    interpolationType,
    globalSequence,
    timestampsCount,
    timestampsOffset,
    valuesCount,
    valuesOffset,
  };
}

function readBone(reader: BufferReader): M2Bone {
  const keyBoneID = reader.readInt32();
  const flags = reader.readUint32();
  const parentID = reader.readInt16();
  const submeshID = reader.readInt16();
  const boneNameCRC = reader.readUint32();

  const translation = readTrack(reader);
  const rotation = readTrack(reader);
  const scaling = readTrack(reader);

  const pivotPoint = reader.readFloat32Array(3);
  return {
    keyBoneID,
    flags,
    parentID,
    submeshID,
    boneNameCRC,
    pivotPoint,
    translation,
    rotation,
    scaling,
  };
}

function readSequence(reader: BufferReader): M2Sequence {
  const id = reader.readUint16();
  const subId = reader.readUint16();
  const length = reader.readUint32();
  const moveSpeed = reader.readFloat32();
  const flags = reader.readUint32();
  const probability = reader.readInt16();
  const order = reader.readUint16();
  const replayMin = reader.readUint32();
  const replayMax = reader.readUint32();
  const blendTime = reader.readUint32();
  const boundsMin = reader.readFloat32Array(3);
  const boundsMax = reader.readFloat32Array(3);
  const radius = reader.readFloat32();
  const variationNext = reader.readInt16();
  const aliasNext = reader.readUint16();

  return {
    id,
    subId,
    length,
    moveSpeed,
    flags,
    probability,
    order,
    replayMin,
    replayMax,
    blendTime,
    boundsMin,
    boundsMax,
    radius,
    variationNext,
    aliasNext,
  };
}

interface M2ArrayHeader {
  count: number;
  offset: number;
}

function readM2ArrayHeader(reader: BufferReader): M2ArrayHeader {
  return {
    count: reader.readUint32(),
    offset: reader.readUint32(),
  };
}

interface M2Header {
  globalSequences: M2ArrayHeader;
  sequences: M2ArrayHeader;
  animationLookup: M2ArrayHeader;
  bones: M2ArrayHeader;
  keyBoneLookup: M2ArrayHeader;
  vertices: M2ArrayHeader;
  colors: M2ArrayHeader;
  textures: M2ArrayHeader;
  transparency: M2ArrayHeader;
  textureAnimations: M2ArrayHeader;
  textureReplaceLookup: M2ArrayHeader;
  materials: M2ArrayHeader;
  boneLookupTable: M2ArrayHeader;
  textureLookups: M2ArrayHeader;
}

/**
 * Read the geometry-relevant headers for WotLK (version 263).
 *
 * WotLK keeps `numViews` and `numSkinProfiles` as two uint32s right after the
 * vertices array. Everything else lines up with the Cataclysm layout.
 */
function readM2HeaderV263(reader: BufferReader): M2Header {
  reader.readUint32(); // global_flags

  const globalSequences = readM2ArrayHeader(reader);
  const sequences = readM2ArrayHeader(reader);
  const animationLookup = readM2ArrayHeader(reader);

  const bones = readM2ArrayHeader(reader);
  const keyBoneLookup = readM2ArrayHeader(reader);

  const vertices = readM2ArrayHeader(reader);

  reader.readUint32(); // numViews
  reader.readUint32(); // numSkinProfiles

  const colors = readM2ArrayHeader(reader);

  const textures = readM2ArrayHeader(reader);
  const transparency = readM2ArrayHeader(reader);
  const textureAnimations = readM2ArrayHeader(reader);
  const textureReplaceLookup = readM2ArrayHeader(reader);

  const materials = readM2ArrayHeader(reader);
  const boneLookupTable = readM2ArrayHeader(reader);

  const textureLookups = readM2ArrayHeader(reader);

  return {
    globalSequences,
    sequences,
    animationLookup,
    bones,
    keyBoneLookup,
    vertices,
    colors,
    textures,
    transparency,
    textureAnimations,
    textureReplaceLookup,
    materials,
    boneLookupTable,
    textureLookups,
  };
}

/**
 * Read the geometry-relevant headers for Cataclysm+ (version 264+).
 *
 * Cataclysm collapses the WotLK view fields into a single `num_skin_profiles`
 * uint32 and adds `texture_combiner_combos` at the end of the header.
 */
function readM2HeaderV264(reader: BufferReader): M2Header {
  reader.readUint32(); // global_flags

  const globalSequences = readM2ArrayHeader(reader);
  const sequences = readM2ArrayHeader(reader);
  const animationLookup = readM2ArrayHeader(reader);

  const bones = readM2ArrayHeader(reader);
  const keyBoneLookup = readM2ArrayHeader(reader);

  const vertices = readM2ArrayHeader(reader);

  reader.readUint32(); // num_skin_profiles

  const colors = readM2ArrayHeader(reader);

  const textures = readM2ArrayHeader(reader);
  const transparency = readM2ArrayHeader(reader);
  const textureAnimations = readM2ArrayHeader(reader);
  const textureReplaceLookup = readM2ArrayHeader(reader);

  const materials = readM2ArrayHeader(reader);
  const boneLookupTable = readM2ArrayHeader(reader);

  const textureLookups = readM2ArrayHeader(reader);

  return {
    globalSequences,
    sequences,
    animationLookup,
    bones,
    keyBoneLookup,
    vertices,
    colors,
    textures,
    transparency,
    textureAnimations,
    textureReplaceLookup,
    materials,
    boneLookupTable,
    textureLookups,
  };
}

function readM2Header(reader: BufferReader, version: number): M2Header {
  switch (version) {
    case M2_VERSION_WOTLK:
      return readM2HeaderV263(reader);
    case M2_VERSION_CATACLYSM:
      return readM2HeaderV264(reader);
    default:
      throw new Error(
        `Unsupported M2 version: ${version}. Supported versions: ${M2_VERSION_WOTLK} (WotLK), ${M2_VERSION_CATACLYSM} (Cataclysm).`,
      );
  }
}

function validateBoneLayout(
  reader: BufferReader,
  bonesHeader: M2ArrayHeader,
  verticesOffset: number,
): number {
  if (bonesHeader.count <= 0) return STANDARD_BONE_SIZE;

  for (const size of BONE_STRIDE_CANDIDATES) {
    const endOffset = bonesHeader.offset + bonesHeader.count * size;
    if (endOffset <= verticesOffset && endOffset <= reader.length) {
      return size;
    }
  }

  return STANDARD_BONE_SIZE;
}

export function parseM2(buffer: ArrayBuffer): M2Data {
  const reader = new BufferReader(buffer);

  const magic = reader.readUint32();
  if (magic !== M2_MAGIC) {
    throw new Error(`Invalid M2 magic: 0x${magic.toString(16)}`);
  }

  const version = reader.readUint32();
  const nameLength = reader.readUint32();
  const nameOffset = reader.readUint32();

  reader.seek(nameOffset);
  const name = reader.readCString(nameLength);

  reader.seek(M2_HEADER_SIZE);

  const {
    globalSequences,
    sequences,
    animationLookup,
    bones,
    vertices,
    textures,
    materials,
    textureLookups,
    boneLookupTable,
  } = readM2Header(reader, version);

  const parsedGlobalSequences: number[] = [];
  if (globalSequences.offset > 0 && globalSequences.count > 0) {
    reader.seek(globalSequences.offset);
    for (let i = 0; i < globalSequences.count; i++) {
      parsedGlobalSequences.push(reader.readUint32());
    }
  }

  const parsedSequences: M2Sequence[] = [];
  if (sequences.offset > 0 && sequences.count > 0) {
    reader.seek(sequences.offset);
    for (let i = 0; i < sequences.count; i++) {
      parsedSequences.push(readSequence(reader));
    }
  }

  const parsedAnimationLookup: number[] = [];
  if (animationLookup.offset > 0 && animationLookup.count > 0) {
    reader.seek(animationLookup.offset);
    for (let i = 0; i < animationLookup.count; i++) {
      parsedAnimationLookup.push(reader.readInt16());
    }
  }

  const parsedBones: M2Bone[] = [];
  if (bones.offset > 0 && bones.count > 0) {
    const boneStride = validateBoneLayout(reader, bones, vertices.offset);
    reader.seek(bones.offset);
    for (let i = 0; i < bones.count; i++) {
      const boneOffset = reader.offset;
      parsedBones.push(readBone(reader));
      // Advance to next bone record for non-standard strides.
      reader.seek(boneOffset + boneStride);
    }
  }

  const parsedVertices: M2Vertex[] = [];
  if (vertices.offset > 0 && vertices.count > 0) {
    reader.seek(vertices.offset);
    for (let i = 0; i < vertices.count; i++) {
      parsedVertices.push(readVertex(reader));
    }
  }

  const parsedTextures: M2Texture[] = [];
  if (textures.offset > 0 && textures.count > 0) {
    reader.seek(textures.offset);
    for (let i = 0; i < textures.count; i++) {
      parsedTextures.push(readTexture(reader));
    }
  }

  const parsedMaterials: M2Material[] = [];
  if (materials.offset > 0 && materials.count > 0) {
    reader.seek(materials.offset);
    for (let i = 0; i < materials.count; i++) {
      parsedMaterials.push(readMaterial(reader));
    }
  }

  const parsedTextureLookups: number[] = [];
  if (textureLookups.offset > 0 && textureLookups.count > 0) {
    reader.seek(textureLookups.offset);
    for (let i = 0; i < textureLookups.count; i++) {
      parsedTextureLookups.push(reader.readInt16());
    }
  }

  const parsedBoneLookups: number[] = [];
  if (boneLookupTable.offset > 0 && boneLookupTable.count > 0) {
    reader.seek(boneLookupTable.offset);
    for (let i = 0; i < boneLookupTable.count; i++) {
      parsedBoneLookups.push(reader.readInt16());
    }
  }

  return {
    version,
    name,
    vertices: parsedVertices,
    bones: parsedBones,
    sequences: parsedSequences,
    animationLookup: parsedAnimationLookup,
    globalSequences: parsedGlobalSequences,
    textures: parsedTextures,
    materials: parsedMaterials,
    textureLookups: parsedTextureLookups,
    boneLookups: parsedBoneLookups,
  };
}

function readSkinSubmesh(reader: BufferReader): M2SkinSubmesh {
  const partID = reader.readUint16();
  const level = reader.readUint16();
  const startVertex = reader.readUint16();
  const vertexCount = reader.readUint16();
  const startTriangle = reader.readUint16();
  const triangleCount = reader.readUint16();
  const boneCount = reader.readUint16();
  const startBone = reader.readUint16();
  const boneInfluences = reader.readUint16();
  const rootBone = reader.readUint16();
  const centerMass = reader.readFloat32Array(3);
  const centerBoundingBox = reader.readFloat32Array(3);
  const radius = reader.readFloat32();

  return {
    partID,
    level,
    startVertex,
    vertexCount,
    startTriangle,
    triangleCount,
    boneCount,
    startBone,
    boneInfluences,
    rootBone,
    centerMass,
    centerBoundingBox,
    radius,
  };
}

function readSkinBatch(reader: BufferReader): M2SkinBatch {
  const flags = reader.readUint16();
  const shaderID = reader.readUint16();
  const submeshIndex = reader.readUint16();
  const submeshIndex2 = reader.readUint16();
  const vertexColorAnimationIndex = reader.readInt16();
  const materialIndex = reader.readUint16();
  const layer = reader.readUint16();
  const opCount = reader.readUint16();
  const textureLookup = reader.readUint16();
  const textureMappingIndex = reader.readUint16();
  const transparencyAnimationLookup = reader.readUint16();
  const uvAnimationLookup = reader.readUint16();

  return {
    flags,
    shaderID,
    submeshIndex,
    submeshIndex2,
    vertexColorAnimationIndex,
    materialIndex,
    layer,
    opCount,
    textureLookup,
    textureMappingIndex,
    transparencyAnimationLookup,
    uvAnimationLookup,
  };
}

interface NofsHeader {
  count: number;
  offset: number;
}

function readNofs(reader: BufferReader): NofsHeader {
  return {
    count: reader.readUint32(),
    offset: reader.readUint32(),
  };
}

export function parseSkin(buffer: ArrayBuffer): M2SkinData {
  const reader = new BufferReader(buffer);

  const magic = reader.readUint32();
  if (magic !== SKIN_MAGIC) {
    throw new Error(`Invalid skin magic: 0x${magic.toString(16)}`);
  }

  const indicesNofs = readNofs(reader);
  const trianglesNofs = readNofs(reader);
  const boneIndicesNofs = readNofs(reader);
  const submeshesNofs = readNofs(reader);
  const batchesNofs = readNofs(reader);

  let indices: Uint16Array;
  if (indicesNofs.offset > 0 && indicesNofs.count > 0) {
    reader.seek(indicesNofs.offset);
    indices = reader.readUint16Array(indicesNofs.count);
  } else {
    indices = new Uint16Array(0);
  }

  let triangles: Uint16Array;
  if (trianglesNofs.offset > 0 && trianglesNofs.count > 0) {
    reader.seek(trianglesNofs.offset);
    triangles = reader.readUint16Array(trianglesNofs.count);
  } else {
    triangles = new Uint16Array(0);
  }

  let skinBoneIndices: Uint8Array = new Uint8Array(0);
  if (boneIndicesNofs.offset > 0 && boneIndicesNofs.count > 0) {
    reader.seek(boneIndicesNofs.offset);
    const byteCount = boneIndicesNofs.count * 4;
    skinBoneIndices = reader.readUint8Array(byteCount);
  }

  const submeshes: M2SkinSubmesh[] = [];
  if (submeshesNofs.offset > 0 && submeshesNofs.count > 0) {
    reader.seek(submeshesNofs.offset);
    for (let i = 0; i < submeshesNofs.count; i++) {
      submeshes.push(readSkinSubmesh(reader));
    }
  }

  const batches: M2SkinBatch[] = [];
  if (batchesNofs.offset > 0 && batchesNofs.count > 0) {
    reader.seek(batchesNofs.offset);
    for (let i = 0; i < batchesNofs.count; i++) {
      batches.push(readSkinBatch(reader));
    }
  }

  return { indices, triangles, submeshes, batches, skinBoneIndices };
}

export async function parseM2WithSkin(
  m2Buffer: ArrayBuffer,
  skinBuffer: ArrayBuffer,
): Promise<ParsedM2> {
  const m2 = parseM2(m2Buffer);
  const skin = parseSkin(skinBuffer);
  return { m2, skin };
}
