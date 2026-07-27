import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import * as THREE from "three";
import { useM2Loader } from "./hooks/useM2Loader";
import { useM2Textures } from "./hooks/useM2Textures";
import { useM2Animation } from "./hooks/useM2Animation";
import { useModelViewerControls } from "./hooks/useModelViewerControls";
import { ModelCanvas } from "./ModelCanvas";
import { ModelViewerToolbar } from "./ModelViewerToolbar";
import type { AnimationState } from "@/lib/m2/animationIds";
import type { ModelPreview } from "@/shared/types";
import { DEFAULT_CAMERA_FOV, DEFAULT_CAMERA_POSITION } from "./constants";

interface ModelViewerProps {
  preview: ModelPreview;
  resourceType: string;
  selectedTexture?: string | null;
  selectedVariations?: [string | null, string | null, string | null];
  scale?: number;
}

export function ModelViewer({
  preview,
  selectedTexture,
  selectedVariations,
  scale = 1,
}: ModelViewerProps) {
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [animationState, setAnimationState] = useState<AnimationState>("stand");
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [customAnimId, setCustomAnimId] = useState("");
  const [debugAnimId, setDebugAnimId] = useState<number | null>(null);

  const { parsed, error, loading, m2BufferRef, canRender } =
    useM2Loader(preview);
  const textureUrls = useM2Textures(
    parsed,
    preview,
    selectedTexture,
    selectedVariations,
  );
  const animationClip = useM2Animation(
    parsed,
    preview.anim_files,
    animationState,
    debugAnimId,
    m2BufferRef,
  );

  const {
    canvasContainerRef,
    controlsRef,
    cameraPreset,
    setCameraPreset,
    handleZoomIn,
    handleZoomOut,
    handleReset,
    handleFullscreen,
  } = useModelViewerControls();

  const initialCamera = useMemo(
    () => ({
      position: new THREE.Vector3(
        DEFAULT_CAMERA_POSITION[0],
        DEFAULT_CAMERA_POSITION[1],
        DEFAULT_CAMERA_POSITION[2],
      ),
      fov: DEFAULT_CAMERA_FOV,
    }),
    [],
  );

  return (
    <div className="flex h-full flex-col">
      <div ref={canvasContainerRef} className="viewer-canvas">
        {loading && (
          <div className="preview-placeholder">
            <p>正在解析 M2 模型...</p>
          </div>
        )}
        {!loading && error && (
          <div className="preview-placeholder">
            <AlertCircle className="h-12 w-12 text-warning" />
            <p>{error}</p>
          </div>
        )}
        {!loading && !error && parsed && (
          <ModelCanvas
            initialCamera={initialCamera}
            parsed={parsed}
            textureUrls={textureUrls}
            scale={scale}
            wireframe={wireframe}
            animationClip={animationClip}
            isPlaying={isPlaying}
            playbackRate={playbackRate}
            controlsRef={controlsRef}
            autoRotate={autoRotate}
            cameraPreset={cameraPreset}
          />
        )}
        {!loading && !error && !parsed && !canRender && (
          <div className="preview-placeholder">
            <AlertCircle className="h-12 w-12 text-text-tertiary" />
            <p>暂无可用的 3D 模型数据（{preview.status}）</p>
          </div>
        )}
      </div>
      <ModelViewerToolbar
        parsed={parsed}
        autoRotate={autoRotate}
        setAutoRotate={setAutoRotate}
        wireframe={wireframe}
        setWireframe={setWireframe}
        cameraPreset={cameraPreset}
        setCameraPreset={setCameraPreset}
        animationState={animationState}
        setAnimationState={setAnimationState}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        playbackRate={playbackRate}
        setPlaybackRate={setPlaybackRate}
        customAnimId={customAnimId}
        setCustomAnimId={setCustomAnimId}
        debugAnimId={debugAnimId}
        setDebugAnimId={setDebugAnimId}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        onFullscreen={handleFullscreen}
      />
    </div>
  );
}
