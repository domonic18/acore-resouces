import * as THREE from "three";
import type {
  AnimBoneTrackData,
  AnimFileData,
  AnimSectionData,
  M2Sequence,
  M2Track,
  ParsedM2,
  SequenceTrackData,
} from "./types";
import {
  ALIAS_NEXT_TERMINATOR,
  ANIM_BONE_ANIMATION_HEADER_SIZE,
  ANIM_BONE_FLAG_ROTATION,
  ANIM_BONE_FLAG_SCALING,
  ANIM_BONE_FLAG_TRANSLATION,
  ANIM_BONE_REFERENCE_SIZE,
  ANIM_FILE_EXTENSION,
  ANIM_FILE_HEADER_SIZE,
  ANIM_FILE_MAGIC,
  ANIM_ID_PADDING,
  ANIM_MODERN_ENTRY_SIZE,
  ANIM_MODERN_HEADER_SIZE,
  ANIM_MODERN_MAGIC,
  ANIM_SECTION_HEADER_SIZE,
  ANIM_SECTION_MAGIC,
  BYTES_PER_FLOAT32,
  BYTES_PER_INT16,
  BYTES_PER_UINT32,
  COMPONENTS_PER_QUATERNION,
  COMPONENTS_PER_VECTOR,
  MAX_TRACK_ENTRY_COUNT,
  MILLISECONDS_PER_SECOND,
  NORMALIZATION_EPSILON,
  QUATERNION_INT16_MAX,
  QUATERNION_INT16_OFFSET,
  QUATERNION_VALUE_SIZE_BYTES,
  SEQUENCE_ALIAS_FLAG,
  SEQUENCE_EXTERNAL_ANIM_MASK,
  SUB_ANIM_ID_PADDING,
  VECTOR_VALUE_SIZE_BYTES,
} from "./constants";
import { convertM2Position } from "./coordinates";

export function buildAnimFileName(
  modelName: string,
  animId: number,
  subAnimId: number,
): string {
  const base =
    modelName.replace(/\\/g, "/").split("/").pop()?.replace(/\.m2$/i, "") ?? "";
  return `${base}${String(animId).padStart(ANIM_ID_PADDING, "0")}-${String(subAnimId).padStart(SUB_ANIM_ID_PADDING, "0")}${ANIM_FILE_EXTENSION}`;
}

export function isExternalSequence(sequence: M2Sequence): boolean {
  // Client loads external .anim files when none of bits 0x20, 0x10, 0x100 are set.
  // See https://wowdev.wiki/M2
  return (sequence.flags & SEQUENCE_EXTERNAL_ANIM_MASK) === 0;
}

interface ResolvedSequence {
  index: number;
  sequence: M2Sequence;
}

function resolveSequence(
  m2: ParsedM2["m2"],
  animId: number,
): ResolvedSequence | null {
  let sequenceIndex = -1;

  if (animId >= 0 && animId < m2.animationLookup.length) {
    sequenceIndex = m2.animationLookup[animId];
  }

  if (sequenceIndex < 0 || sequenceIndex >= m2.sequences.length) {
    // Fallback: some retro-ported models have a broken lookup table but the
    // sequence.id field still matches the requested animation ID.
    const directIndex = m2.sequences.findIndex((seq) => seq.id === animId);
    if (directIndex >= 0) {
      // eslint-disable-next-line no-console
      console.log(
        "[resolveSequence] lookup failed for animId=",
        animId,
        "using direct sequence.id match index=",
        directIndex,
      );
      sequenceIndex = directIndex;
    } else {
      return null;
    }
  }

  let resolvedIndex = sequenceIndex;
  let sequence = m2.sequences[resolvedIndex];
  const visited = new Set<number>();
  visited.add(resolvedIndex);
  while (
    (sequence.flags & SEQUENCE_ALIAS_FLAG) !== 0 &&
    sequence.aliasNext !== ALIAS_NEXT_TERMINATOR &&
    sequence.aliasNext < m2.sequences.length &&
    !visited.has(sequence.aliasNext)
  ) {
    resolvedIndex = sequence.aliasNext;
    sequence = m2.sequences[resolvedIndex];
    visited.add(resolvedIndex);
  }

  return { index: resolvedIndex, sequence };
}

// ---------------------------------------------------------------------------
// Modern .anim file parsing (Legion+ / retro-port format)
// ---------------------------------------------------------------------------

function readUint32(buffer: ArrayBuffer, offset: number): number {
  return new DataView(buffer).getUint32(offset, true);
}

function hasMagicAt(
  buffer: ArrayBuffer,
  offset: number,
  magic: number,
): boolean {
  if (offset + BYTES_PER_UINT32 > buffer.byteLength) return false;
  return readUint32(buffer, offset) === magic;
}

interface ModernAnimEntry {
  id: number;
  offset: number;
  size: number;
}

function parseModernAnimHeader(
  buffer: ArrayBuffer,
): { version: number; entries: ModernAnimEntry[] } | null {
  if (!hasMagicAt(buffer, 0, ANIM_MODERN_MAGIC)) return null;
  if (buffer.byteLength < ANIM_MODERN_HEADER_SIZE) return null;

  const view = new DataView(buffer);
  const version = view.getUint32(4, true);
  const idCount = view.getUint32(8, true);
  const entryOffset = view.getUint32(16, true);

  if (
    idCount === 0 ||
    entryOffset < ANIM_MODERN_HEADER_SIZE ||
    entryOffset + idCount * ANIM_MODERN_ENTRY_SIZE > buffer.byteLength
  ) {
    return null;
  }

  const entries: ModernAnimEntry[] = [];
  for (let i = 0; i < idCount; i++) {
    const offset = entryOffset + i * ANIM_MODERN_ENTRY_SIZE;
    entries.push({
      id: view.getUint32(offset, true),
      offset: view.getUint32(offset + BYTES_PER_UINT32, true),
      size: view.getUint32(offset + BYTES_PER_UINT32 * 2, true),
    });
  }

  return { version, entries };
}

function readModernVectorValues(
  reader: BufferReader,
  count: number,
): Float32Array {
  const result = new Float32Array(count * COMPONENTS_PER_VECTOR);
  for (let i = 0; i < count * COMPONENTS_PER_VECTOR; i++) {
    result[i] = reader.readFloat32();
  }
  return result;
}

function readModernQuaternionValues(
  reader: BufferReader,
  count: number,
): Int16Array {
  const result = new Int16Array(count * COMPONENTS_PER_QUATERNION);
  for (let i = 0; i < count * COMPONENTS_PER_QUATERNION; i++) {
    result[i] = reader.readInt16();
  }
  return result;
}

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

  readInt16(): number {
    const value = this.view.getInt16(this._offset, true);
    this._offset += BYTES_PER_INT16;
    return value;
  }

  readUint32(): number {
    const value = this.view.getUint32(this._offset, true);
    this._offset += BYTES_PER_UINT32;
    return value;
  }

  readFloat32(): number {
    const value = this.view.getFloat32(this._offset, true);
    this._offset += BYTES_PER_FLOAT32;
    return value;
  }
}

function readModernTimestamps(
  reader: BufferReader,
  count: number,
): Uint32Array {
  const result = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    result[i] = reader.readUint32();
  }
  return result;
}

function parseModernAnimSection(
  buffer: ArrayBuffer,
  offset: number,
  size: number,
): AnimSectionData | null {
  if (
    offset < 0 ||
    size < ANIM_SECTION_HEADER_SIZE ||
    offset + size > buffer.byteLength ||
    !hasMagicAt(buffer, offset, ANIM_SECTION_MAGIC)
  ) {
    return null;
  }

  const view = new DataView(buffer);
  const sectionId = view.getUint32(offset + BYTES_PER_UINT32, true);
  const startFrame = view.getUint32(offset + BYTES_PER_UINT32 * 2, true);
  const endFrame = view.getUint32(offset + BYTES_PER_UINT32 * 3, true);

  const boneOffsetArrayOffset = offset + ANIM_SECTION_HEADER_SIZE;
  const remainingSize = size - ANIM_SECTION_HEADER_SIZE;
  if (remainingSize % ANIM_BONE_REFERENCE_SIZE !== 0) return null;

  const boneCount = remainingSize / ANIM_BONE_REFERENCE_SIZE;
  const reader = new BufferReader(buffer);

  const boneOffsets: number[] = [];
  reader.seek(boneOffsetArrayOffset);
  for (let i = 0; i < boneCount; i++) {
    boneOffsets.push(reader.readUint32());
  }

  const boneAnimations: AnimBoneTrackData[] = [];
  for (const boneOffset of boneOffsets) {
    if (boneOffset === 0) {
      boneAnimations.push({
        boneId: 0,
        translation: null,
        rotation: null,
        scaling: null,
      });
      continue;
    }

    const absoluteOffset = offset + boneOffset;
    if (absoluteOffset + ANIM_BONE_ANIMATION_HEADER_SIZE > buffer.byteLength) {
      boneAnimations.push({
        boneId: 0,
        translation: null,
        rotation: null,
        scaling: null,
      });
      continue;
    }

    reader.seek(absoluteOffset);
    const boneId = reader.readUint32();
    const flags = reader.readUint32();

    let translation: SequenceTrackData | null = null;
    if ((flags & ANIM_BONE_FLAG_TRANSLATION) !== 0) {
      const count = reader.readUint32();
      if (count > 0 && count <= MAX_TRACK_ENTRY_COUNT) {
        translation = {
          timestamps: readModernTimestamps(reader, count),
          values: readModernVectorValues(reader, count),
        };
      }
    }

    let rotation: SequenceTrackData | null = null;
    if ((flags & ANIM_BONE_FLAG_ROTATION) !== 0) {
      const count = reader.readUint32();
      if (count > 0 && count <= MAX_TRACK_ENTRY_COUNT) {
        rotation = {
          timestamps: readModernTimestamps(reader, count),
          values: readModernQuaternionValues(reader, count),
        };
      }
    }

    let scaling: SequenceTrackData | null = null;
    if ((flags & ANIM_BONE_FLAG_SCALING) !== 0) {
      const count = reader.readUint32();
      if (count > 0 && count <= MAX_TRACK_ENTRY_COUNT) {
        scaling = {
          timestamps: readModernTimestamps(reader, count),
          values: readModernVectorValues(reader, count),
        };
      }
    }

    boneAnimations.push({ boneId, translation, rotation, scaling });
  }

  return {
    id: sectionId,
    start: startFrame,
    end: endFrame,
    boneAnimations,
  };
}

function parseModernAnimFile(buffer: ArrayBuffer): AnimFileData | null {
  const header = parseModernAnimHeader(buffer);
  if (!header) return null;

  const sections: AnimSectionData[] = [];
  for (const entry of header.entries) {
    const section = parseModernAnimSection(buffer, entry.offset, entry.size);
    if (section) {
      sections.push(section);
    }
  }

  if (sections.length === 0) return null;
  return { format: "modern", sections };
}

export function parseAnimFile(buffer: ArrayBuffer): AnimFileData {
  const modern = parseModernAnimFile(buffer);
  if (modern) {
    return modern;
  }

  // Treat anything without a MAOF header as legacy raw M2 track data. The
  // legacy path reads timestamps/values using the M2 track outer arrays.
  return { format: "legacy", buffer };
}

// ---------------------------------------------------------------------------
// M2 internal track reading (used for non-external sequences)
// ---------------------------------------------------------------------------

function readTrackTimestamps(
  outerBuffer: ArrayBuffer,
  dataBuffer: ArrayBuffer,
  outerBaseOffset: number,
  dataBaseOffset: number,
  track: M2Track,
  sequenceIndex: number,
): Uint32Array {
  const outerView = new DataView(outerBuffer);
  if (
    sequenceIndex < 0 ||
    track.timestampsCount <= 0 ||
    sequenceIndex >= track.timestampsCount
  ) {
    return new Uint32Array(0);
  }

  const outerOffset =
    outerBaseOffset + track.timestampsOffset + sequenceIndex * 8;
  if (outerOffset + 8 > outerBuffer.byteLength) {
    // eslint-disable-next-line no-console
    console.warn(
      "[readTrackTimestamps] outer offset out of bounds",
      outerOffset,
      outerBuffer.byteLength,
    );
    return new Uint32Array(0);
  }

  const count = outerView.getUint32(outerOffset, true);
  const offset = outerView.getUint32(outerOffset + BYTES_PER_UINT32, true);

  if (count === 0 || offset === 0 || count > MAX_TRACK_ENTRY_COUNT) {
    return new Uint32Array(0);
  }

  const dataView = new DataView(dataBuffer);
  const dataOffset = dataBaseOffset + offset;
  const dataByteLength = count * BYTES_PER_UINT32;
  if (dataOffset + dataByteLength > dataBuffer.byteLength) {
    // eslint-disable-next-line no-console
    console.warn(
      "[readTrackTimestamps] data offset out of bounds",
      dataOffset,
      dataByteLength,
      dataBuffer.byteLength,
    );
    return new Uint32Array(0);
  }

  const result = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    result[i] = dataView.getUint32(dataOffset + i * BYTES_PER_UINT32, true);
  }
  return result;
}

function readTrackValues(
  outerBuffer: ArrayBuffer,
  dataBuffer: ArrayBuffer,
  outerBaseOffset: number,
  dataBaseOffset: number,
  track: M2Track,
  sequenceIndex: number,
  valueSizeBytes: number,
): Float32Array | Int16Array {
  const outerView = new DataView(outerBuffer);
  if (
    sequenceIndex < 0 ||
    track.valuesCount <= 0 ||
    sequenceIndex >= track.valuesCount
  ) {
    return valueSizeBytes === QUATERNION_VALUE_SIZE_BYTES
      ? new Int16Array(0)
      : new Float32Array(0);
  }

  const outerOffset = outerBaseOffset + track.valuesOffset + sequenceIndex * 8;
  if (outerOffset + 8 > outerBuffer.byteLength) {
    // eslint-disable-next-line no-console
    console.warn(
      "[readTrackValues] outer offset out of bounds",
      outerOffset,
      outerBuffer.byteLength,
    );
    return valueSizeBytes === QUATERNION_VALUE_SIZE_BYTES
      ? new Int16Array(0)
      : new Float32Array(0);
  }

  const count = outerView.getUint32(outerOffset, true);
  const offset = outerView.getUint32(outerOffset + BYTES_PER_UINT32, true);

  if (count === 0 || offset === 0 || count > MAX_TRACK_ENTRY_COUNT) {
    return valueSizeBytes === QUATERNION_VALUE_SIZE_BYTES
      ? new Int16Array(0)
      : new Float32Array(0);
  }

  const dataView = new DataView(dataBuffer);
  const dataOffset = dataBaseOffset + offset;

  if (valueSizeBytes === QUATERNION_VALUE_SIZE_BYTES) {
    const dataByteLength = count * COMPONENTS_PER_QUATERNION * BYTES_PER_INT16;
    if (dataOffset + dataByteLength > dataBuffer.byteLength) {
      // eslint-disable-next-line no-console
      console.warn(
        "[readTrackValues] quaternion data out of bounds",
        dataOffset,
        dataByteLength,
        dataBuffer.byteLength,
      );
      return new Int16Array(0);
    }
    const result = new Int16Array(count * COMPONENTS_PER_QUATERNION);
    for (let i = 0; i < count * COMPONENTS_PER_QUATERNION; i++) {
      result[i] = dataView.getInt16(dataOffset + i * BYTES_PER_INT16, true);
    }
    return result;
  }

  const dataByteLength = count * COMPONENTS_PER_VECTOR * BYTES_PER_FLOAT32;
  if (dataOffset + dataByteLength > dataBuffer.byteLength) {
    // eslint-disable-next-line no-console
    console.warn(
      "[readTrackValues] vector data out of bounds",
      dataOffset,
      dataByteLength,
      dataBuffer.byteLength,
    );
    return new Float32Array(0);
  }
  const result = new Float32Array(count * COMPONENTS_PER_VECTOR);
  for (let i = 0; i < count * COMPONENTS_PER_VECTOR; i++) {
    result[i] = dataView.getFloat32(dataOffset + i * BYTES_PER_FLOAT32, true);
  }
  return result;
}

function readM2SequenceTrackData(
  outerBuffer: ArrayBuffer,
  dataBuffer: ArrayBuffer,
  outerBaseOffset: number,
  dataBaseOffset: number,
  track: M2Track,
  sequenceIndex: number,
  valueSizeBytes: number,
): SequenceTrackData {
  return {
    timestamps: readTrackTimestamps(
      outerBuffer,
      dataBuffer,
      outerBaseOffset,
      dataBaseOffset,
      track,
      sequenceIndex,
    ),
    values: readTrackValues(
      outerBuffer,
      dataBuffer,
      outerBaseOffset,
      dataBaseOffset,
      track,
      sequenceIndex,
      valueSizeBytes,
    ),
  };
}

// ---------------------------------------------------------------------------
// Animation clip construction
// ---------------------------------------------------------------------------

export function decompressM2Quaternion(
  values: Int16Array,
  index: number,
): number[] {
  const offset = index * 4;
  return [
    decompressComponent(values[offset]),
    decompressComponent(values[offset + 1]),
    decompressComponent(values[offset + 2]),
    decompressComponent(values[offset + 3]),
  ];
}

function decompressComponent(value: number): number {
  return (
    (value < 0
      ? value + QUATERNION_INT16_OFFSET
      : value - QUATERNION_INT16_MAX) / QUATERNION_INT16_MAX
  );
}

function convertM2Scale(scale: Float32Array): [number, number, number] {
  // M2 Y/Z axes are swapped when mapped to the skinning coordinate space.
  return [scale[0], scale[2], scale[1]];
}

function convertM2Quaternion(q: number[]): [number, number, number, number] {
  // M2 -> Three.js is a -90 degree rotation around X:
  //   (x, y, z) -> (x, z, -y)
  // Apply the same rotation to the quaternion vector part.
  return [q[0], q[2], -q[1], q[3]];
}

interface VectorKeyframe {
  time: number;
  value: [number, number, number];
}

function buildVectorKeyframes(
  timestamps: Uint32Array,
  values: Float32Array,
  converter?: (v: Float32Array) => [number, number, number],
): number[] | null {
  if (values.length < timestamps.length * 3) {
    // eslint-disable-next-line no-console
    console.warn(
      "[buildVectorKeyframes] values count mismatch",
      values.length,
      timestamps.length,
    );
    return null;
  }

  const keyframes: VectorKeyframe[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i] / MILLISECONDS_PER_SECOND;
    if (!Number.isFinite(time)) {
      // eslint-disable-next-line no-console
      console.warn("[buildVectorKeyframes] non-finite timestamp at", i, time);
      continue;
    }

    const x = values[i * 3];
    const y = values[i * 3 + 1];
    const z = values[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      // eslint-disable-next-line no-console
      console.warn("[buildVectorKeyframes] non-finite value at", i, x, y, z);
      continue;
    }

    const converted = converter
      ? converter(new Float32Array([x, y, z]))
      : ([x, y, z] as [number, number, number]);
    keyframes.push({ time, value: converted });
  }

  if (keyframes.length === 0) {
    return null;
  }

  keyframes.sort((a, b) => a.time - b.time);

  const result: number[] = [];
  for (const { time, value } of keyframes) {
    result.push(time, value[0], value[1], value[2]);
  }
  return result;
}

interface QuaternionKeyframe {
  time: number;
  value: [number, number, number, number];
}

function buildQuaternionKeyframes(
  timestamps: Uint32Array,
  values: Int16Array,
): number[] | null {
  if (values.length < timestamps.length * 4) {
    // eslint-disable-next-line no-console
    console.warn(
      "[buildQuaternionKeyframes] values count mismatch",
      values.length,
      timestamps.length,
    );
    return null;
  }

  const keyframes: QuaternionKeyframe[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i] / MILLISECONDS_PER_SECOND;
    if (!Number.isFinite(time)) {
      // eslint-disable-next-line no-console
      console.warn(
        "[buildQuaternionKeyframes] non-finite timestamp at",
        i,
        time,
      );
      continue;
    }

    const q = decompressM2Quaternion(values, i);
    if (!q.every(Number.isFinite)) {
      // eslint-disable-next-line no-console
      console.warn("[buildQuaternionKeyframes] non-finite value at", i, q);
      continue;
    }
    const magnitude = Math.sqrt(
      q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3],
    );
    if (magnitude <= NORMALIZATION_EPSILON) {
      // eslint-disable-next-line no-console
      console.warn("[buildQuaternionKeyframes] zero quaternion at", i, q);
      continue;
    }
    const converted = convertM2Quaternion(q.map((v) => v / magnitude));
    keyframes.push({ time, value: converted });
  }

  if (keyframes.length === 0) {
    return null;
  }

  keyframes.sort((a, b) => a.time - b.time);

  const result: number[] = [];
  for (const { time, value } of keyframes) {
    result.push(time, value[0], value[1], value[2], value[3]);
  }
  return result;
}

function findModernSection(
  animData: AnimFileData | null,
  sectionId: number,
): AnimSectionData | null {
  if (animData?.format !== "modern") return null;
  return animData.sections.find((section) => section.id === sectionId) ?? null;
}

function getFirstModernSection(
  animData: AnimFileData | null,
): AnimSectionData | null {
  if (animData?.format !== "modern") return null;
  return animData.sections[0] ?? null;
}

export function buildAnimationClip(
  parsed: ParsedM2,
  m2Buffer: ArrayBuffer,
  animId: number,
  animBuffer: ArrayBuffer | null,
): THREE.AnimationClip | null {
  const { m2 } = parsed;

  const resolved = resolveSequence(m2, animId);
  if (!resolved) {
    // eslint-disable-next-line no-console
    console.log(
      "[buildAnimationClip] no sequence found for animId=",
      animId,
      "lookupLength=",
      m2.animationLookup.length,
      "sequences=",
      m2.sequences.length,
    );
    return null;
  }

  const { index: resolvedIndex, sequence } = resolved;
  const external = isExternalSequence(sequence);
  // eslint-disable-next-line no-console
  console.log(
    "[buildAnimationClip] animId=",
    animId,
    "resolvedIndex=",
    resolvedIndex,
    "sequence.id=",
    sequence.id,
    "aliasNext=",
    sequence.aliasNext,
    "external=",
    external,
    "flags=",
    sequence.flags,
    "length=",
    sequence.length,
  );

  if (external && !animBuffer) {
    // eslint-disable-next-line no-console
    console.log("[buildAnimationClip] external but no animBuffer");
    return null;
  }

  let animData: AnimFileData | null = null;
  if (animBuffer) {
    try {
      animData = parseAnimFile(animBuffer);
      // eslint-disable-next-line no-console
      console.log(
        "[buildAnimationClip] parsed anim file, format=",
        animData.format,
        animData.format === "modern"
          ? `sections=${animData.sections.length}`
          : `size=${animData.buffer.byteLength}`,
      );
    } catch {
      // eslint-disable-next-line no-console
      console.log("[buildAnimationClip] failed to parse anim file");
      return null;
    }
  }

  // Classic (pre-Legion) .anim files are raw M2 track data. The M2 file's
  // track offsets point into this blob. For AFM2-wrapped files the chunk
  // header is 8 bytes, so the track offsets are relative to byte 8.
  const legacyAnimBaseOffset =
    animBuffer &&
    animData?.format === "legacy" &&
    hasMagicAt(animBuffer, 0, ANIM_FILE_MAGIC)
      ? ANIM_FILE_HEADER_SIZE
      : 0;

  const useModernAnim = external && animData?.format === "modern";
  const modernSection = useModernAnim
    ? findModernSection(animData, sequence.id)
    : null;
  const fallbackSection = useModernAnim
    ? getFirstModernSection(animData)
    : null;
  const activeSection = modernSection ?? fallbackSection;

  const tracks: THREE.KeyframeTrack[] = [];
  const duration = sequence.length / MILLISECONDS_PER_SECOND;

  let animatedBoneCount = 0;

  // Build a bone lookup map for modern sections. Sections store bone data in a
  // parallel array, but each entry also carries the global bone ID so we can
  // verify the mapping.
  const modernBoneMap = activeSection
    ? new Map(
        activeSection.boneAnimations.map((anim, index) => [
          anim.boneId >= 0 ? anim.boneId : index,
          anim,
        ]),
      )
    : null;

  // Diagnostic summary for the root bone to help identify why full-body
  // animation is not applied.
  const rootBone = m2.bones[0];
  if (rootBone) {
    // eslint-disable-next-line no-console
    console.log(
      "[buildAnimationClip] root bone track metadata:",
      "translation",
      rootBone.translation.timestampsCount,
      rootBone.translation.valuesCount,
      "rotation",
      rootBone.rotation.timestampsCount,
      rootBone.rotation.valuesCount,
      "scale",
      rootBone.scaling.timestampsCount,
      rootBone.scaling.valuesCount,
    );
  }

  for (let boneIndex = 0; boneIndex < m2.bones.length; boneIndex++) {
    const bone = m2.bones[boneIndex];
    const boneName = `bone_${boneIndex}`;

    const rawPivot = bone.pivotPoint;
    const parentPivot =
      bone.parentID >= 0 && bone.parentID < m2.bones.length
        ? m2.bones[bone.parentID].pivotPoint
        : new Float32Array([0, 0, 0]);
    const basePosition = convertM2Position(
      new Float32Array([
        rawPivot[0] - parentPivot[0],
        rawPivot[1] - parentPivot[1],
        rawPivot[2] - parentPivot[2],
      ]),
    );

    let translationData: SequenceTrackData | null = null;
    let rotationData: SequenceTrackData | null = null;
    let scalingData: SequenceTrackData | null = null;

    if (activeSection) {
      const boneAnim = modernBoneMap?.get(boneIndex);
      if (boneAnim) {
        translationData = boneAnim.translation;
        rotationData = boneAnim.rotation;
        scalingData = boneAnim.scaling;
      }
    } else {
      const useExternalAnimBuffer =
        external && animData?.format === "legacy" && animBuffer;
      const outerBuffer = m2Buffer;
      const dataBuffer = useExternalAnimBuffer ? animBuffer : m2Buffer;
      const dataBaseOffset = useExternalAnimBuffer ? legacyAnimBaseOffset : 0;
      translationData = readM2SequenceTrackData(
        outerBuffer,
        dataBuffer,
        0,
        dataBaseOffset,
        bone.translation,
        resolvedIndex,
        VECTOR_VALUE_SIZE_BYTES,
      );
      rotationData = readM2SequenceTrackData(
        outerBuffer,
        dataBuffer,
        0,
        dataBaseOffset,
        bone.rotation,
        resolvedIndex,
        QUATERNION_VALUE_SIZE_BYTES,
      );
      scalingData = readM2SequenceTrackData(
        outerBuffer,
        dataBuffer,
        0,
        dataBaseOffset,
        bone.scaling,
        resolvedIndex,
        VECTOR_VALUE_SIZE_BYTES,
      );
    }

    if (
      translationData &&
      translationData.timestamps.length > 0 &&
      translationData.values.length > 0
    ) {
      const keyframes = buildVectorKeyframes(
        translationData.timestamps,
        translationData.values as Float32Array,
        convertM2Position,
      );
      if (keyframes) {
        // M2 translation tracks are offsets from the bone's pivot. Add the
        // bind-pose local position so Three.js keyframes are absolute local
        // positions relative to the parent bone.
        for (let i = 1; i < keyframes.length; i += 4) {
          keyframes[i] += basePosition[0];
          keyframes[i + 1] += basePosition[1];
          keyframes[i + 2] += basePosition[2];
        }
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${boneName}.position`,
            keyframes.filter((_, i) => i % 4 === 0),
            keyframes.filter((_, i) => i % 4 !== 0),
          ),
        );
        animatedBoneCount++;
      }
    }

    if (
      rotationData &&
      rotationData.timestamps.length > 0 &&
      rotationData.values.length > 0
    ) {
      const keyframes = buildQuaternionKeyframes(
        rotationData.timestamps,
        rotationData.values as Int16Array,
      );
      if (keyframes) {
        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${boneName}.quaternion`,
            keyframes.filter((_, i) => i % 5 === 0),
            keyframes.filter((_, i) => i % 5 !== 0),
          ),
        );
        animatedBoneCount++;
      }
    }

    if (boneIndex === 0) {
      // eslint-disable-next-line no-console
      console.log(
        "[buildAnimationClip] root bone resolved track counts:",
        "translation",
        translationData?.timestamps.length ?? 0,
        translationData?.values.length ?? 0,
        "rotation",
        rotationData?.timestamps.length ?? 0,
        rotationData?.values.length ?? 0,
        "scale",
        scalingData?.timestamps.length ?? 0,
        scalingData?.values.length ?? 0,
      );
    }

    if (
      scalingData &&
      scalingData.timestamps.length > 0 &&
      scalingData.values.length > 0
    ) {
      const keyframes = buildVectorKeyframes(
        scalingData.timestamps,
        scalingData.values as Float32Array,
        convertM2Scale,
      );
      if (keyframes) {
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${boneName}.scale`,
            keyframes.filter((_, i) => i % 4 === 0),
            keyframes.filter((_, i) => i % 4 !== 0),
          ),
        );
        animatedBoneCount++;
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    "[buildAnimationClip] generated",
    tracks.length,
    "tracks for",
    animatedBoneCount,
    "bone tracks",
    "total bones=",
    m2.bones.length,
  );
  if (tracks.length === 0) {
    return null;
  }

  return new THREE.AnimationClip(`anim_${animId}`, duration, tracks);
}
