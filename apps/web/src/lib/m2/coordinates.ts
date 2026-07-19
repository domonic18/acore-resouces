/**
 * Coordinate conversions between the M2 file format and Three.js.
 *
 * M2 uses a right-handed coordinate system where:
 *   X = right, Y = forward, Z = up
 * Three.js uses a right-handed coordinate system where:
 *   X = right, Y = up, Z = forward (towards the viewer)
 *
 * The conversion is a -90 degree rotation around X:
 *   (x, y, z) -> (x, z, -y)
 */
export function convertM2Position(pos: Float32Array): [number, number, number] {
  return [pos[0], pos[2], -pos[1]];
}

export function convertM2Normal(
  normal: Float32Array,
): [number, number, number] {
  return [normal[0], normal[2], -normal[1]];
}
