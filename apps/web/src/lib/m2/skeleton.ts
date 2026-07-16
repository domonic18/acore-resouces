import * as THREE from "three";
import type { M2Bone } from "./types";
import { convertM2Position } from "./coordinates";

export function buildSkeleton(
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
