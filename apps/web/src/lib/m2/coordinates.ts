/**
 * Coordinate conversions between the M2 file format and Three.js.
 *
 * M2 uses a right-handed coordinate system where:
 *   X = right, Y = forward, Z = up
 * Three.js uses a right-handed coordinate system where:
 *   X = right, Y = up, Z = forward (towards the viewer)
 */
export function convertM2Position(pos: Float32Array): [number, number, number] {
  return [-pos[0], -pos[2], pos[1]];
}
