import * as THREE from "three";
import type { M2Sequence, M2Track, ParsedM2, SequenceTrackData } from "./types";
import {
  ALIAS_NEXT_TERMINATOR,
  ANIM_FILE_EXTENSION,
  ANIM_FILE_HEADER_SIZE,
  ANIM_FILE_MAGIC,
  ANIM_ID_PADDING,
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
  SEQUENCE_EXTERNAL_ANIM_MASK,
  SUB_ANIM_ID_PADDING,
  VECTOR_VALUE_SIZE_BYTES,
} from "./constants";
import { convertM2Position } from "./coordinates";

export interface AnimFileData {
  buffer: ArrayBuffer;
  dataOffset: number;
  dataLength: number;
}

export function parseAnimFile(buffer: ArrayBuffer): AnimFileData {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== ANIM_FILE_MAGIC) {
    throw new Error(`Invalid .anim magic: 0x${magic.toString(16)}`);
  }
  const chunkSize = view.getUint32(4, true);
  return {
    buffer,
    dataOffset: ANIM_FILE_HEADER_SIZE,
    dataLength: Math.min(chunkSize, buffer.byteLength - ANIM_FILE_HEADER_SIZE),
  };
}

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

function readTrackTimestamps(
  buffer: ArrayBuffer,
  baseOffset: number,
  track: M2Track,
  sequenceIndex: number,
): Uint32Array {
  const view = new DataView(buffer);
  if (
    sequenceIndex < 0 ||
    track.timestampsCount <= 0 ||
    sequenceIndex >= track.timestampsCount
  ) {
    return new Uint32Array(0);
  }

  const outerOffset = baseOffset + track.timestampsOffset + sequenceIndex * 8;
  if (outerOffset + 8 > buffer.byteLength) {
    // eslint-disable-next-line no-console
    console.warn(
      "[readTrackTimestamps] outer offset out of bounds",
      outerOffset,
      buffer.byteLength,
    );
    return new Uint32Array(0);
  }

  const count = view.getUint32(outerOffset, true);
  const offset = view.getUint32(outerOffset + BYTES_PER_UINT32, true);

  if (count === 0 || offset === 0 || count > MAX_TRACK_ENTRY_COUNT) {
    return new Uint32Array(0);
  }

  const dataOffset = baseOffset + offset;
  const dataByteLength = count * BYTES_PER_UINT32;
  if (dataOffset + dataByteLength > buffer.byteLength) {
    // eslint-disable-next-line no-console
    console.warn(
      "[readTrackTimestamps] data offset out of bounds",
      dataOffset,
      dataByteLength,
      buffer.byteLength,
    );
    return new Uint32Array(0);
  }

  const result = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    result[i] = view.getUint32(dataOffset + i * BYTES_PER_UINT32, true);
  }
  return result;
}

function readTrackValues(
  buffer: ArrayBuffer,
  baseOffset: number,
  track: M2Track,
  sequenceIndex: number,
  valueSizeBytes: number,
): Float32Array | Int16Array {
  const view = new DataView(buffer);
  if (
    sequenceIndex < 0 ||
    track.valuesCount <= 0 ||
    sequenceIndex >= track.valuesCount
  ) {
    return valueSizeBytes === QUATERNION_VALUE_SIZE_BYTES
      ? new Int16Array(0)
      : new Float32Array(0);
  }

  const outerOffset = baseOffset + track.valuesOffset + sequenceIndex * 8;
  if (outerOffset + 8 > buffer.byteLength) {
    // eslint-disable-next-line no-console
    console.warn(
      "[readTrackValues] outer offset out of bounds",
      outerOffset,
      buffer.byteLength,
    );
    return valueSizeBytes === QUATERNION_VALUE_SIZE_BYTES
      ? new Int16Array(0)
      : new Float32Array(0);
  }

  const count = view.getUint32(outerOffset, true);
  const offset = view.getUint32(outerOffset + BYTES_PER_UINT32, true);

  if (count === 0 || offset === 0 || count > MAX_TRACK_ENTRY_COUNT) {
    return valueSizeBytes === QUATERNION_VALUE_SIZE_BYTES
      ? new Int16Array(0)
      : new Float32Array(0);
  }

  const dataOffset = baseOffset + offset;

  if (valueSizeBytes === QUATERNION_VALUE_SIZE_BYTES) {
    const dataByteLength = count * COMPONENTS_PER_QUATERNION * BYTES_PER_INT16;
    if (dataOffset + dataByteLength > buffer.byteLength) {
      // eslint-disable-next-line no-console
      console.warn(
        "[readTrackValues] quaternion data out of bounds",
        dataOffset,
        dataByteLength,
        buffer.byteLength,
      );
      return new Int16Array(0);
    }
    const result = new Int16Array(count * COMPONENTS_PER_QUATERNION);
    for (let i = 0; i < count * COMPONENTS_PER_QUATERNION; i++) {
      result[i] = view.getInt16(dataOffset + i * BYTES_PER_INT16, true);
    }
    return result;
  }

  const dataByteLength = count * COMPONENTS_PER_VECTOR * BYTES_PER_FLOAT32;
  if (dataOffset + dataByteLength > buffer.byteLength) {
    // eslint-disable-next-line no-console
    console.warn(
      "[readTrackValues] vector data out of bounds",
      dataOffset,
      dataByteLength,
      buffer.byteLength,
    );
    return new Float32Array(0);
  }
  const result = new Float32Array(count * COMPONENTS_PER_VECTOR);
  for (let i = 0; i < count * COMPONENTS_PER_VECTOR; i++) {
    result[i] = view.getFloat32(dataOffset + i * BYTES_PER_FLOAT32, true);
  }
  return result;
}

export function readSequenceTrackData(
  m2Buffer: ArrayBuffer,
  animData: AnimFileData | null,
  track: M2Track,
  sequenceIndex: number,
  valueSizeBytes: number,
  isExternal: boolean,
): SequenceTrackData {
  const useAnimFile = isExternal && animData !== null;

  const baseBuffer = useAnimFile ? animData.buffer : m2Buffer;
  const baseOffset = useAnimFile ? animData.dataOffset : 0;
  // External .anim files contain data for a single sequence, so their track
  // outer arrays only have one entry (index 0).
  const trackIndex = useAnimFile ? 0 : sequenceIndex;

  return {
    timestamps: readTrackTimestamps(baseBuffer, baseOffset, track, trackIndex),
    values: readTrackValues(
      baseBuffer,
      baseOffset,
      track,
      trackIndex,
      valueSizeBytes,
    ),
  };
}

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
  // Quaternion vector part transforms the same way as a position vector.
  return [-q[0], -q[2], q[1], q[3]];
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
  if (external && animBuffer) {
    try {
      animData = parseAnimFile(animBuffer);
      // eslint-disable-next-line no-console
      console.log(
        "[buildAnimationClip] parsed anim file, dataOffset=",
        animData.dataOffset,
        "dataLength=",
        animData.dataLength,
      );
    } catch {
      // eslint-disable-next-line no-console
      console.log("[buildAnimationClip] failed to parse anim file");
      return null;
    }
  }

  const tracks: THREE.KeyframeTrack[] = [];
  const duration = sequence.length / MILLISECONDS_PER_SECOND;

  let animatedBoneCount = 0;

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

    const translation = readSequenceTrackData(
      m2Buffer,
      animData,
      bone.translation,
      resolvedIndex,
      VECTOR_VALUE_SIZE_BYTES,
      external,
    );
    if (translation.timestamps.length > 0 && translation.values.length > 0) {
      const keyframes = buildVectorKeyframes(
        translation.timestamps,
        translation.values as Float32Array,
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

    const rotation = readSequenceTrackData(
      m2Buffer,
      animData,
      bone.rotation,
      resolvedIndex,
      QUATERNION_VALUE_SIZE_BYTES,
      external,
    );
    if (rotation.timestamps.length > 0 && rotation.values.length > 0) {
      const keyframes = buildQuaternionKeyframes(
        rotation.timestamps,
        rotation.values as Int16Array,
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

    const scaling = readSequenceTrackData(
      m2Buffer,
      animData,
      bone.scaling,
      resolvedIndex,
      VECTOR_VALUE_SIZE_BYTES,
      external,
    );
    if (scaling.timestamps.length > 0 && scaling.values.length > 0) {
      const keyframes = buildVectorKeyframes(
        scaling.timestamps,
        scaling.values as Float32Array,
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
