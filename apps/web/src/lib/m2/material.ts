import type { M2Data, M2SkinData } from "./types";

export function resolveTextureUrl(
  m2: M2Data,
  batch: M2SkinData["batches"][number],
  textureUrls: Record<number, string>,
): string | null {
  const lookupIndex = batch.textureLookup;
  if (lookupIndex < 0 || lookupIndex >= m2.textureLookups.length) {
    return null;
  }
  const textureIndex = m2.textureLookups[lookupIndex];
  if (textureIndex < 0 || textureIndex >= m2.textures.length) {
    return null;
  }
  return textureUrls[textureIndex] ?? null;
}
