import * as THREE from "three";
import type { M2Sequence, M2Track, ParsedM2, SequenceTrackData } from "./types";

const AFM2_MAGIC = 0x324d4641; // "AFM2" as little-endian uint32

export interface AnimFileData {
  buffer: ArrayBuffer;
  dataOffset: number;
  dataLength: number;
}

export function parseAnimFile(buffer: ArrayBuffer): AnimFileData {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== AFM2_MAGIC) {
    throw new Error(`Invalid .anim magic: 0x${magic.toString(16)}`);
  }
  const chunkSize = view.getUint32(4, true);
  return {
    buffer,
    dataOffset: 8,
    dataLength: Math.min(chunkSize, buffer.byteLength - 8),
  };
}

export function buildAnimFileName(
  modelName: string,
  animId: number,
  subAnimId: number,
): string {
  const base =
    modelName.replace(/\\/g, "/").split("/").pop()?.replace(/\.m2$/i, "") ?? "";
  return `${base}${String(animId).padStart(4, "0")}-${String(subAnimId).padStart(2, "0")}.anim`;
}

export function isExternalSequence(sequence: M2Sequence): boolean {
  // Client loads external .anim files when none of bits 0x20, 0x10, 0x100 are set.
  // See https://wowdev.wiki/M2
  return (sequence.flags & 0x130) === 0;
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
  const offset = view.getUint32(outerOffset + 4, true);

  if (count === 0 || offset === 0 || count > 100_000) {
    return new Uint32Array(0);
  }

  const dataOffset = baseOffset + offset;
  const dataByteLength = count * 4;
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
    result[i] = view.getUint32(dataOffset + i * 4, true);
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
    return valueSizeBytes === 8 ? new Int16Array(0) : new Float32Array(0);
  }

  const outerOffset = baseOffset + track.valuesOffset + sequenceIndex * 8;
  if (outerOffset + 8 > buffer.byteLength) {
    // eslint-disable-next-line no-console
    console.warn(
      "[readTrackValues] outer offset out of bounds",
      outerOffset,
      buffer.byteLength,
    );
    return valueSizeBytes === 8 ? new Int16Array(0) : new Float32Array(0);
  }

  const count = view.getUint32(outerOffset, true);
  const offset = view.getUint32(outerOffset + 4, true);

  if (count === 0 || offset === 0 || count > 100_000) {
    return valueSizeBytes === 8 ? new Int16Array(0) : new Float32Array(0);
  }

  const dataOffset = baseOffset + offset;

  if (valueSizeBytes === 8) {
    const dataByteLength = count * 4 * 2;
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
    const result = new Int16Array(count * 4);
    for (let i = 0; i < count * 4; i++) {
      result[i] = view.getInt16(dataOffset + i * 2, true);
    }
    return result;
  }

  const dataByteLength = count * 3 * 4;
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
  const result = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    result[i] = view.getFloat32(dataOffset + i * 4, true);
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
  return (value < 0 ? value + 32768 : value - 32767) / 32767.0;
}

function convertM2Position(pos: Float32Array): [number, number, number] {
  return [-pos[0], -pos[2], pos[1]];
}

function convertM2Scale(scale: Float32Array): [number, number, number] {
  // M2 Y/Z axes are swapped when mapped to the skinning coordinate space.
  return [scale[0], scale[2], scale[1]];
}

function convertM2Quaternion(q: number[]): [number, number, number, number] {
  // Quaternion vector part transforms the same way as a position vector.
  return [-q[0], -q[2], q[1], q[3]];
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

  const keyframes: number[] = [];
  let lastTime = -1;
  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i] / 1000;
    if (time < lastTime) {
      // eslint-disable-next-line no-console
      console.warn(
        "[buildVectorKeyframes] non-monotonic timestamp at",
        i,
        time,
        lastTime,
      );
      return null;
    }
    if (!Number.isFinite(time)) {
      // eslint-disable-next-line no-console
      console.warn("[buildVectorKeyframes] non-finite timestamp at", i, time);
      return null;
    }
    lastTime = time;
    keyframes.push(time);

    const x = values[i * 3];
    const y = values[i * 3 + 1];
    const z = values[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      // eslint-disable-next-line no-console
      console.warn("[buildVectorKeyframes] non-finite value at", i, x, y, z);
      return null;
    }
    if (converter) {
      keyframes.push(...converter(new Float32Array([x, y, z])));
    } else {
      keyframes.push(x, y, z);
    }
  }
  return keyframes;
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

  const keyframes: number[] = [];
  let lastTime = -1;
  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i] / 1000;
    if (time < lastTime) {
      // eslint-disable-next-line no-console
      console.warn(
        "[buildQuaternionKeyframes] non-monotonic timestamp at",
        i,
        time,
        lastTime,
      );
      return null;
    }
    if (!Number.isFinite(time)) {
      // eslint-disable-next-line no-console
      console.warn(
        "[buildQuaternionKeyframes] non-finite timestamp at",
        i,
        time,
      );
      return null;
    }
    lastTime = time;
    keyframes.push(time);

    const q = decompressM2Quaternion(values, i);
    if (!q.every(Number.isFinite)) {
      // eslint-disable-next-line no-console
      console.warn("[buildQuaternionKeyframes] non-finite value at", i, q);
      return null;
    }
    const magnitude = Math.sqrt(
      q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3],
    );
    if (magnitude <= 1e-6) {
      // eslint-disable-next-line no-console
      console.warn("[buildQuaternionKeyframes] zero quaternion at", i, q);
      return null;
    }
    const converted = convertM2Quaternion(q.map((v) => v / magnitude));
    keyframes.push(converted[0], converted[1], converted[2], converted[3]);
  }
  return keyframes;
}

export function buildAnimationClip(
  parsed: ParsedM2,
  m2Buffer: ArrayBuffer,
  animId: number,
  animBuffer: ArrayBuffer | null,
): THREE.AnimationClip | null {
  const { m2 } = parsed;
  if (animId < 0 || animId >= m2.animationLookup.length) {
    // eslint-disable-next-line no-console
    console.log(
      "[buildAnimationClip] animId out of lookup range",
      animId,
      m2.animationLookup.length,
    );
    return null;
  }

  const sequenceIndex = m2.animationLookup[animId];
  if (sequenceIndex < 0 || sequenceIndex >= m2.sequences.length) {
    // eslint-disable-next-line no-console
    console.log("[buildAnimationClip] invalid sequenceIndex", sequenceIndex);
    return null;
  }

  let resolvedIndex = sequenceIndex;
  let sequence = m2.sequences[resolvedIndex];
  const visited = new Set<number>();
  visited.add(resolvedIndex);
  while (
    sequence.aliasNext !== 0xffff &&
    sequence.aliasNext < m2.sequences.length &&
    !visited.has(sequence.aliasNext)
  ) {
    resolvedIndex = sequence.aliasNext;
    sequence = m2.sequences[resolvedIndex];
    visited.add(resolvedIndex);
  }

  const external = isExternalSequence(sequence);
  // eslint-disable-next-line no-console
  console.log(
    "[buildAnimationClip] originalIndex=",
    sequenceIndex,
    "resolvedIndex=",
    resolvedIndex,
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
  const duration = sequence.length / 1000;

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
      12,
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
      }
    }

    const rotation = readSequenceTrackData(
      m2Buffer,
      animData,
      bone.rotation,
      resolvedIndex,
      8,
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
      }
    }

    const scaling = readSequenceTrackData(
      m2Buffer,
      animData,
      bone.scaling,
      resolvedIndex,
      12,
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
      }
    }
  }

  if (tracks.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[buildAnimationClip] no tracks generated");
    return null;
  }

  // eslint-disable-next-line no-console
  console.log("[buildAnimationClip] generated", tracks.length, "tracks");
  return new THREE.AnimationClip(`anim_${animId}`, duration, tracks);
}
