import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useOptionalTexture } from "./hooks/useOptionalTexture";
import {
  MATERIAL_DEFAULT_COLOR,
  MATERIAL_DEFAULT_METALNESS,
  MATERIAL_DEFAULT_ROUGHNESS,
  MATERIAL_DEFAULT_SIDE,
} from "./constants";

interface M2MaterialMeshProps {
  geometry: THREE.BufferGeometry;
  textureUrl: string | null;
  wireframe: boolean;
  skeleton: THREE.Skeleton | null;
  rootBone: THREE.Bone | null;
}

export function M2MaterialMesh({
  geometry,
  textureUrl,
  wireframe,
  skeleton,
  rootBone,
}: M2MaterialMeshProps) {
  const texture = useOptionalTexture(textureUrl);
  const meshRef = useRef<THREE.SkinnedMesh | THREE.Mesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !skeleton) return;

    if (mesh instanceof THREE.SkinnedMesh) {
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
