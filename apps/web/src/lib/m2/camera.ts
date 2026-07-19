import * as THREE from "three";
import type { ParsedM2 } from "./types";

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
