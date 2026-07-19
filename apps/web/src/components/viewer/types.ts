import * as THREE from "three";
import { CAMERA_BOTTOM_PRESET_MULTIPLIER } from "./constants";

export type CameraPreset =
  "default" | "front" | "back" | "left" | "right" | "top" | "bottom";

export const PRESET_LABELS: Record<CameraPreset, string> = {
  default: "默认视角",
  front: "正面",
  back: "背面",
  left: "左侧",
  right: "右侧",
  top: "顶部",
  bottom: "底部",
};

export function getPresetPosition(
  center: THREE.Vector3,
  distance: number,
  preset: CameraPreset,
): THREE.Vector3 {
  switch (preset) {
    case "front":
      return new THREE.Vector3(center.x + distance, center.y, center.z);
    case "back":
      return new THREE.Vector3(center.x - distance, center.y, center.z);
    case "left":
      return new THREE.Vector3(center.x, center.y + distance, center.z);
    case "right":
      return new THREE.Vector3(center.x, center.y - distance, center.z);
    case "top":
      return new THREE.Vector3(center.x, center.y, center.z + distance);
    case "bottom":
      return new THREE.Vector3(
        center.x,
        center.y,
        center.z - distance * CAMERA_BOTTOM_PRESET_MULTIPLIER,
      );
    case "default":
    default:
      return new THREE.Vector3(
        center.x + distance,
        center.y + distance,
        center.z + distance,
      );
  }
}
