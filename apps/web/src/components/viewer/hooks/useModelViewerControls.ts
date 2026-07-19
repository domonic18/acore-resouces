import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ZOOM_IN_FACTOR, ZOOM_OUT_FACTOR } from "../constants";
import type { CameraPreset } from "../types";

export function useModelViewerControls() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset | null>(null);

  const handleZoomIn = useCallback(() => {
    const controls = controlsRef.current;
    const camera = controls?.object;
    if (!controls || !camera) return;
    const direction = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .multiplyScalar(ZOOM_IN_FACTOR);
    camera.position.copy(controls.target).add(direction);
    controls.update();
  }, []);

  const handleZoomOut = useCallback(() => {
    const controls = controlsRef.current;
    const camera = controls?.object;
    if (!controls || !camera) return;
    const direction = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .multiplyScalar(ZOOM_OUT_FACTOR);
    camera.position.copy(controls.target).add(direction);
    controls.update();
  }, []);

  const handleReset = useCallback(() => {
    setCameraPreset("default");
  }, []);

  const handleFullscreen = useCallback(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      container.requestFullscreen().catch(() => {});
    }
  }, []);

  return {
    canvasContainerRef,
    controlsRef,
    cameraPreset,
    setCameraPreset,
    handleZoomIn,
    handleZoomOut,
    handleReset,
    handleFullscreen,
  };
}
