import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { M2Bone, M2Data, M2SkinData, ParsedM2 } from "@/lib/m2/types";
import { convertM2Position, convertM2Normal } from "@/lib/m2/coordinates";
import {
  BONE_WEIGHT_MAX,
  MAX_BONE_INFLUENCES,
  UV_FLIP_V_OFFSET,
  UV_FLIP_V_SCALE,
} from "@/lib/m2/constants";
import {
  DIAGNOSTIC_LOG_INTERVAL_SECONDS,
  MATERIAL_DEFAULT_COLOR,
  MATERIAL_DEFAULT_METALNESS,
  MATERIAL_DEFAULT_ROUGHNESS,
  MATERIAL_DEFAULT_SIDE,
  MODEL_ROOT_ROTATION_X,
} from "./constants";

interface M2SceneProps {
  parsed: ParsedM2;
  textureUrls: Record<number, string>;
  wireframe?: boolean;
  animationClip?: THREE.AnimationClip | null;
  isPlaying?: boolean;
  playbackRate?: number;
}

function resolveTextureUrl(
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

interface SubmeshGeometry {
  geometry: THREE.BufferGeometry;
  hasSkinning: boolean;
}

function buildSubmeshGeometry(
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

function buildSkeleton(
  bones: M2Bone[],
): { skeleton: THREE.Skeleton; rootBone: THREE.Bone } | null {
  if (bones.length === 0) {
    return null;
  }

  const threeBones: THREE.Bone[] = [];
  const pivotMap = new Map<number, THREE.Vector3>();

  for (const bone of bones) {
    const pivot = new THREE.Vector3(...convertM2Position(bone.pivotPoint));
    pivotMap.set(threeBones.length, pivot);

    const threeBone = new THREE.Bone();
    threeBone.name = `bone_${threeBones.length}`;

    if (bone.parentID >= 0 && bone.parentID < threeBones.length) {
      const parentPivot = pivotMap.get(bone.parentID) ?? new THREE.Vector3();
      threeBone.position.copy(pivot).sub(parentPivot);
      threeBones[bone.parentID].add(threeBone);
    } else {
      threeBone.position.copy(pivot);
    }

    threeBones.push(threeBone);
  }

  const rootBone = new THREE.Bone();
  rootBone.name = "root";
  for (const bone of threeBones) {
    if (bone.parent === null) {
      rootBone.add(bone);
    }
  }

  return { skeleton: new THREE.Skeleton(threeBones), rootBone };
}

function useOptionalTexture(url: string | null): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    let cancelled = false;
    loader.load(
      url,
      (loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        loaded.flipY = false;
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.RepeatWrapping;
        // eslint-disable-next-line no-console
        console.log("[useOptionalTexture] loaded", url);
        setTexture(loaded);
      },
      undefined,
      (err) => {
        // eslint-disable-next-line no-console
        console.error("[useOptionalTexture] failed to load", url, err);
      },
    );

    return () => {
      cancelled = true;
      setTexture((current) => {
        current?.dispose();
        return null;
      });
    };
  }, [url]);

  return texture;
}

function M2MaterialMesh({
  geometry,
  textureUrl,
  wireframe,
  skeleton,
  rootBone,
}: {
  geometry: THREE.BufferGeometry;
  textureUrl: string | null;
  wireframe: boolean;
  skeleton: THREE.Skeleton | null;
  rootBone: THREE.Bone | null;
}) {
  const texture = useOptionalTexture(textureUrl);
  const meshRef = useRef<THREE.SkinnedMesh | THREE.Mesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !skeleton) return;

    if (mesh instanceof THREE.SkinnedMesh) {
      // eslint-disable-next-line no-console
      console.log(
        "[M2MaterialMesh] binding SkinnedMesh to skeleton",
        skeleton.bones.length,
        "bones",
      );
      rootBone?.updateMatrixWorld(true);
      // Recompute bind-pose inverses now that the bones have valid world matrices.
      skeleton.calculateInverses();
      mesh.bind(skeleton);
    } else {
      // eslint-disable-next-line no-console
      console.log("[M2MaterialMesh] mesh is not SkinnedMesh");
    }
  }, [skeleton, rootBone]);

  const material = (
    <meshStandardMaterial
      color={MATERIAL_DEFAULT_COLOR}
      roughness={MATERIAL_DEFAULT_ROUGHNESS}
      metalness={MATERIAL_DEFAULT_METALNESS}
      side={MATERIAL_DEFAULT_SIDE}
      wireframe={wireframe}
      map={texture}
      transparent={textureUrl !== null}
    />
  );

  if (skeleton) {
    return (
      <skinnedMesh
        ref={meshRef as React.RefObject<THREE.SkinnedMesh>}
        geometry={geometry}
      >
        {material}
      </skinnedMesh>
    );
  }

  return (
    <mesh ref={meshRef as React.RefObject<THREE.Mesh>} geometry={geometry}>
      {material}
    </mesh>
  );
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
        // eslint-disable-next-line no-console
        console.warn(`Submesh ${i} geometry build failed:`, err);
        geometries.push(null);
      }
    }
    return geometries;
  }, [m2, skin]);

  const skeletonResult = useMemo(() => buildSkeleton(m2.bones), [m2.bones]);
  const skeleton = skeletonResult?.skeleton ?? null;
  const rootBone = skeletonResult?.rootBone ?? null;

  // eslint-disable-next-line no-console
  console.log(
    "[M2Scene] skinBoneIndices=",
    skin.skinBoneIndices.length / MAX_BONE_INFLUENCES,
    "skeleton bones=",
    skeleton?.bones.length,
  );

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);

  useEffect(() => {
    return () => {
      submeshGeometries.forEach((item) => item?.geometry.dispose());
    };
  }, [submeshGeometries]);

  useEffect(() => {
    if (!rootBone || !animationClip) {
      mixerRef.current = null;
      actionRef.current = null;
      return;
    }

    const mixer = new THREE.AnimationMixer(rootBone);
    const action = mixer.clipAction(animationClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    mixerRef.current = mixer;
    actionRef.current = action;

    return () => {
      action.stop();
      mixerRef.current = null;
      actionRef.current = null;
    };
  }, [rootBone, animationClip]);

  useEffect(() => {
    const action = actionRef.current;
    if (!action) return;

    action.paused = !isPlaying;
    action.timeScale = playbackRate;
  }, [isPlaying, playbackRate]);

  const lastLogTime = useRef(0);
  const nanReported = useRef(false);
  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
    const action = actionRef.current;
    if (action && mixerRef.current) {
      const now = mixerRef.current.time;

      if (rootBone && !nanReported.current) {
        let hasNaN = false;
        rootBone.traverse((obj) => {
          if (obj instanceof THREE.Bone) {
            const pos = obj.position;
            const quat = obj.quaternion;
            const scale = obj.scale;
            if (
              !Number.isFinite(pos.x) ||
              !Number.isFinite(pos.y) ||
              !Number.isFinite(pos.z) ||
              !Number.isFinite(quat.x) ||
              !Number.isFinite(quat.y) ||
              !Number.isFinite(quat.z) ||
              !Number.isFinite(quat.w) ||
              !Number.isFinite(scale.x) ||
              !Number.isFinite(scale.y) ||
              !Number.isFinite(scale.z)
            ) {
              hasNaN = true;
            }
          }
        });
        if (hasNaN) {
          nanReported.current = true;
          // eslint-disable-next-line no-console
          console.error(
            "[M2Scene] NaN detected in skeleton at mixer time=",
            now.toFixed(2),
            "stopping animation",
          );
          action.stop();
          mixerRef.current.stopAllAction();
          skeleton?.pose();
          rootBone.updateMatrixWorld(true);
        }
      }

      if (now - lastLogTime.current > DIAGNOSTIC_LOG_INTERVAL_SECONDS) {
        lastLogTime.current = now;
        const bone0 = rootBone?.getObjectByName("bone_0") as
          THREE.Bone | undefined;
        // eslint-disable-next-line no-console
        console.log(
          "[M2Scene] mixer time=",
          now.toFixed(2),
          "bone_0 pos=",
          bone0?.position.toArray().map((v) => v.toFixed(2)),
        );
      }
    }
  });

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
        // eslint-disable-next-line no-console
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

export function computeModelBox(parsed: ParsedM2): {
  box: THREE.Box3;
  size: THREE.Vector3;
  center: THREE.Vector3;
  maxDim: number;
} {
  const { skin } = parsed;
  const box = new THREE.Box3();

  if (skin.submeshes.length > 0) {
    skin.submeshes.forEach((submesh) => {
      const center = new THREE.Vector3(
        submesh.centerMass[0],
        submesh.centerMass[2],
        -submesh.centerMass[1],
      );
      box.expandByPoint(center);
      box.expandByPoint(
        new THREE.Vector3(
          center.x + submesh.radius,
          center.y + submesh.radius,
          center.z + submesh.radius,
        ),
      );
      box.expandByPoint(
        new THREE.Vector3(
          center.x - submesh.radius,
          center.y - submesh.radius,
          center.z - submesh.radius,
        ),
      );
    });
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  return { box, size, center, maxDim };
}

export function centerCameraOnModel(
  camera: THREE.Camera,
  parsed: ParsedM2,
): void {
  const { center, maxDim } = computeModelBox(parsed);
  camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
  camera.lookAt(center);
}
