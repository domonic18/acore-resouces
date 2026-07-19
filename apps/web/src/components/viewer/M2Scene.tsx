import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ParsedM2 } from "@/lib/m2/types";
import { MAX_BONE_INFLUENCES } from "@/lib/m2/constants";
import { buildSubmeshGeometry, type SubmeshGeometry } from "@/lib/m2/geometry";
import { buildSkeleton } from "@/lib/m2/skeleton";
import { resolveTextureUrl } from "@/lib/m2/material";
import { M2MaterialMesh } from "./M2MaterialMesh";
import { useM2AnimationMixer } from "./hooks/useM2AnimationMixer";
import { MODEL_ROOT_ROTATION_X } from "./constants";

interface M2SceneProps {
  parsed: ParsedM2;
  textureUrls: Record<number, string>;
  wireframe?: boolean;
  animationClip?: THREE.AnimationClip | null;
  isPlaying?: boolean;
  playbackRate?: number;
}

export function M2Scene({
  parsed,
  textureUrls,
  wireframe = false,
  animationClip = null,
  isPlaying = true,
  playbackRate = 1,
}: M2SceneProps) {
  const { m2, skin } = parsed;

  const submeshGeometries = useMemo(() => {
    const geometries: (SubmeshGeometry | null)[] = [];
    for (let i = 0; i < skin.submeshes.length; i++) {
      try {
        geometries.push(buildSubmeshGeometry(m2, skin, i));
      } catch (err) {
        console.warn(`Submesh ${i} geometry build failed:`, err);
        geometries.push(null);
      }
    }
    return geometries;
  }, [m2, skin]);

  const skeletonResult = useMemo(() => buildSkeleton(m2.bones), [m2.bones]);
  const skeleton = skeletonResult?.skeleton ?? null;
  const rootBone = skeletonResult?.rootBone ?? null;

  console.log(
    "[M2Scene] skinBoneIndices=",
    skin.skinBoneIndices.length / MAX_BONE_INFLUENCES,
    "skeleton bones=",
    skeleton?.bones.length,
  );

  useM2AnimationMixer(
    rootBone,
    skeleton,
    animationClip,
    isPlaying,
    playbackRate,
  );

  useEffect(() => {
    return () => {
      submeshGeometries.forEach((item) => item?.geometry.dispose());
    };
  }, [submeshGeometries]);

  return (
    <group rotation={[MODEL_ROOT_ROTATION_X, 0, 0]}>
      {rootBone && <primitive object={rootBone} />}
      {skin.submeshes.map((submesh, index) => {
        const item = submeshGeometries[index];
        if (!item || item.geometry.attributes.position?.count === 0) {
          return null;
        }

        const submeshBatches = skin.batches.filter(
          (batch) =>
            batch.submeshIndex === index || batch.submeshIndex2 === index,
        );

        const batch = submeshBatches[0];
        const textureUrl = batch
          ? resolveTextureUrl(m2, batch, textureUrls)
          : null;

        console.log(
          "[M2Scene] submesh",
          index,
          "partID",
          submesh.partID,
          "batches",
          submeshBatches.length,
          "textureLookup",
          batch?.textureLookup,
          "textureUrl",
          textureUrl,
        );

        return (
          <M2MaterialMesh
            key={`submesh-${index}-${submesh.partID}`}
            geometry={item.geometry}
            textureUrl={textureUrl}
            wireframe={wireframe}
            skeleton={item.hasSkinning ? skeleton : null}
            rootBone={item.hasSkinning ? rootBone : null}
          />
        );
      })}
    </group>
  );
}
