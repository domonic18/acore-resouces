import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { M2Scene } from "./M2Scene";
import { CameraController } from "./CameraController";
import {
  AMBIENT_LIGHT_INTENSITY,
  AUTO_ROTATE_SPEED,
  DIRECTIONAL_LIGHT_INTENSITY,
  DIRECTIONAL_LIGHT_POSITION,
  GRID_FADE_DISTANCE,
} from "./constants";
import type { ParsedM2 } from "@/lib/m2/types";

interface ModelCanvasProps {
  initialCamera: { position: THREE.Vector3; fov: number };
  parsed: ParsedM2;
  textureUrls: Record<number, string>;
  scale?: number;
  wireframe: boolean;
  animationClip: THREE.AnimationClip | null;
  isPlaying: boolean;
  playbackRate: number;
  controlsRef: React.RefObject<OrbitControlsImpl>;
  autoRotate: boolean;
  cameraPreset: import("./types").CameraPreset | null;
}

export function ModelCanvas({
  initialCamera,
  parsed,
  textureUrls,
  scale = 1,
  wireframe,
  animationClip,
  isPlaying,
  playbackRate,
  controlsRef,
  autoRotate,
  cameraPreset,
}: ModelCanvasProps) {
  return (
    <Canvas camera={initialCamera}>
      <ambientLight intensity={AMBIENT_LIGHT_INTENSITY} />
      <directionalLight
        position={DIRECTIONAL_LIGHT_POSITION}
        intensity={DIRECTIONAL_LIGHT_INTENSITY}
      />
      <Grid infiniteGrid fadeDistance={GRID_FADE_DISTANCE} />
      <M2Scene
        parsed={parsed}
        textureUrls={textureUrls}
        scale={scale}
        wireframe={wireframe}
        animationClip={animationClip}
        isPlaying={isPlaying}
        playbackRate={playbackRate}
      />
      <CameraController parsed={parsed} preset={cameraPreset} />
      <OrbitControls
        ref={controlsRef}
        autoRotate={autoRotate}
        autoRotateSpeed={AUTO_ROTATE_SPEED}
      />
    </Canvas>
  );
}
