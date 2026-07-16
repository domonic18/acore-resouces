import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { centerCameraOnModel, computeModelBox } from "@/lib/m2/camera";
import { CAMERA_PRESET_DISTANCE_MULTIPLIER } from "./constants";
import { getPresetPosition, type CameraPreset } from "./types";
import type { ParsedM2 } from "@/lib/m2/types";

interface CameraControllerProps {
  parsed: ParsedM2;
  preset: CameraPreset | null;
}

export function CameraController({ parsed, preset }: CameraControllerProps) {
  const { camera, controls: rawControls } = useThree();
  const controls = rawControls as OrbitControlsImpl | null;

  useEffect(() => {
    if (preset && controls) {
      const { center, maxDim } = computeModelBox(parsed);
      const distance = maxDim * CAMERA_PRESET_DISTANCE_MULTIPLIER;
      const position = getPresetPosition(center, distance, preset);

      camera.position.copy(position);
      controls.target.copy(center);
      controls.update();
    } else {
      centerCameraOnModel(camera, parsed);
      controls?.update();
    }
  }, [camera, controls, parsed, preset]);

  return null;
}
