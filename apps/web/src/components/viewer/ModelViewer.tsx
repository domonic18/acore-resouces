import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import {
  AlertCircle,
  RotateCw,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Hexagon,
  Maximize,
  Camera,
  Play,
  Pause,
} from "lucide-react";
import * as THREE from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { parseM2WithSkin } from "@/lib/m2/parser";
import { buildAnimationClip, buildAnimFileName } from "@/lib/m2/animation";
import type { AnimationState } from "@/lib/m2/animationIds";
import { resolveAnimationId } from "@/lib/m2/animationIds";
import {
  ANIM_FILE_EXTENSION,
  ANIM_ID_PADDING,
  SUB_ANIM_ID_PADDING,
} from "@/lib/m2/constants";
import {
  fetchAnimBinary,
  fetchM2Binary,
  getBlpPreviewUrl,
} from "@/shared/resources";
import { M2Scene, centerCameraOnModel, computeModelBox } from "./M2Scene";
import type { ModelPreview } from "@/shared/types";
import type { ParsedM2 } from "@/lib/m2/types";
import {
  AMBIENT_LIGHT_INTENSITY,
  AUTO_ROTATE_SPEED,
  CAMERA_BOTTOM_PRESET_MULTIPLIER,
  CAMERA_PRESET_DISTANCE_MULTIPLIER,
  DEFAULT_CAMERA_FOV,
  DEFAULT_CAMERA_POSITION,
  DIRECTIONAL_LIGHT_INTENSITY,
  DIRECTIONAL_LIGHT_POSITION,
  GRID_FADE_DISTANCE,
  PLAYBACK_RATE_OPTIONS,
  ZOOM_IN_FACTOR,
  ZOOM_OUT_FACTOR,
} from "./constants";

interface ModelViewerProps {
  preview: ModelPreview;
  resourceType: string;
  selectedTexture?: string | null;
}

type CameraPreset =
  "default" | "front" | "back" | "left" | "right" | "top" | "bottom";

const PRESET_LABELS: Record<CameraPreset, string> = {
  default: "默认视角",
  front: "正面",
  back: "背面",
  left: "左侧",
  right: "右侧",
  top: "顶部",
  bottom: "底部",
};

function extractVariationSuffix(path: string): string | null {
  const name = path.split("/").pop()?.replace(".blp", "") ?? "";
  const lastUnderscore = name.lastIndexOf("_");
  if (lastUnderscore <= 0) {
    return null;
  }
  return name.slice(lastUnderscore + 1).toLowerCase();
}

function resolveSkinTextures(
  selectedPath: string | null | undefined,
  blpFiles: string[],
  modelFolder: string,
): string[] {
  if (!selectedPath) {
    return blpFiles.filter((path) =>
      path.toLowerCase().includes(modelFolder.toLowerCase()),
    );
  }

  const suffix = extractVariationSuffix(selectedPath);
  if (!suffix) {
    return [selectedPath];
  }

  const matching = blpFiles.filter((path) => {
    const name = path.split("/").pop()?.replace(".blp", "").toLowerCase() ?? "";
    return name.endsWith(`_${suffix}`);
  });

  return matching.length > 0 ? matching.sort() : [selectedPath];
}

function getPresetPosition(
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

function findAnimFilePath(
  animFiles: string[] | undefined,
  modelName: string,
  animId: number,
  subAnimId = 0,
): string | null {
  if (!animFiles || animFiles.length === 0) return null;
  const expectedName = buildAnimFileName(modelName, animId, subAnimId);
  const lowerExpected = expectedName.toLowerCase();
  const fullMatch = animFiles.find((path) =>
    path.toLowerCase().endsWith(lowerExpected),
  );
  if (fullMatch) return fullMatch;

  const pattern =
    `${String(animId).padStart(ANIM_ID_PADDING, "0")}-${String(subAnimId).padStart(SUB_ANIM_ID_PADDING, "0")}${ANIM_FILE_EXTENSION}`.toLowerCase();
  return animFiles.find((path) => path.toLowerCase().endsWith(pattern)) ?? null;
}

export function ModelViewer({ preview, selectedTexture }: ModelViewerProps) {
  const [parsed, setParsed] = useState<ParsedM2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset | null>(null);
  const [animationState, setAnimationState] = useState<AnimationState>("stand");
  const [animationClip, setAnimationClip] =
    useState<THREE.AnimationClip | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [customAnimId, setCustomAnimId] = useState<string>("");
  const [debugAnimId, setDebugAnimId] = useState<number | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const m2BufferRef = useRef<ArrayBuffer | null>(null);

  const canRender =
    preview.status === "available" && preview.skin_files.length > 0;

  useEffect(() => {
    if (!canRender) {
      setParsed(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function loadModel() {
      try {
        const mainSkin = preview.skin_files[0];
        if (!mainSkin) {
          throw new Error("未找到 skin 文件");
        }

        const [m2Buffer, skinBuffer] = await Promise.all([
          fetchM2Binary(preview.main_m2),
          fetchM2Binary(mainSkin),
        ]);

        m2BufferRef.current = m2Buffer;
        const result = await parseM2WithSkin(m2Buffer, skinBuffer);
        if (!cancelled) {
          setParsed(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadModel();
    return () => {
      cancelled = true;
    };
  }, [preview.main_m2, preview.skin_files, canRender]);

  const textureUrls = useMemo(() => {
    const urls: Record<number, string> = {};
    if (!parsed) return urls;

    parsed.m2.textures.forEach((texture, index) => {
      if (texture.type === 0 && texture.filename) {
        const baseName = texture.filename
          .replace(/\\/g, "/")
          .split("/")
          .pop()
          ?.toLowerCase()
          .replace(/\.blp$/, "");
        if (!baseName) return;

        // Prefer an exact filename match, then a substring match.
        const exactMatch = preview.blp_files.find((path) => {
          const name = path
            .split("/")
            .pop()
            ?.toLowerCase()
            .replace(/\.blp$/, "");
          return name === baseName;
        });
        const candidate =
          exactMatch ??
          preview.blp_files.find((path) =>
            path.toLowerCase().includes(baseName),
          );
        if (candidate) {
          urls[index] = getBlpPreviewUrl(candidate);
        }
      }
    });

    const skinTextures = resolveSkinTextures(
      selectedTexture,
      preview.blp_files,
      preview.model_folder,
    );
    const skinSlots = parsed.m2.textures
      .map((texture, index) => ({ texture, index }))
      .filter(
        ({ texture, index }) =>
          (texture.type === 11 || texture.type === 12 || texture.type === 13) &&
          !urls[index],
      )
      .map(({ index }) => index);

    skinTextures.forEach((path, arrayIndex) => {
      const slot = skinSlots[arrayIndex];
      if (slot !== undefined) {
        urls[slot] = getBlpPreviewUrl(path);
      }
    });

    // eslint-disable-next-line no-console
    console.log(
      "[textureUrls] textures:",
      parsed.m2.textures.map((t, i) => ({
        index: i,
        type: t.type,
        filename: t.filename,
        resolved: urls[i] ?? null,
      })),
      "blp_files:",
      preview.blp_files,
    );

    return urls;
  }, [parsed, preview.blp_files, preview.model_folder, selectedTexture]);

  useEffect(() => {
    if (!parsed) {
      setAnimationClip(null);
      return;
    }

    const currentParsed = parsed;
    let cancelled = false;

    async function loadAnimation() {
      const availableIds = new Set<number>();
      currentParsed.m2.animationLookup.forEach((sequenceIndex, animId) => {
        if (
          sequenceIndex >= 0 &&
          sequenceIndex < currentParsed.m2.sequences.length
        ) {
          availableIds.add(animId);
        }
      });

      // eslint-disable-next-line no-console
      console.log(
        "[animation] sequences:",
        currentParsed.m2.sequences
          .map(
            (seq, idx) =>
              `[${idx}]id=${seq.id} sub=${seq.subId} len=${seq.length} flags=${seq.flags.toString(16)} alias=${seq.aliasNext}${
                (seq.flags & 0x40) !== 0 ? " ALIAS" : ""
              }`,
          )
          .join(", "),
        "lookup:",
        currentParsed.m2.animationLookup.slice(0, 256).join(","),
      );

      let animId: number | null;
      if (debugAnimId !== null) {
        animId = debugAnimId;
      } else {
        animId = resolveAnimationId(animationState, availableIds);
      }
      // eslint-disable-next-line no-console
      console.log(
        "[animation] state=",
        animationState,
        "resolved id=",
        animId,
        "debugAnimId=",
        debugAnimId,
      );
      if (animId === null) {
        setAnimationClip(null);
        return;
      }

      const animFiles = preview.anim_files ?? [];
      const animPath = findAnimFilePath(
        animFiles,
        currentParsed.m2.name,
        animId,
        0,
      );
      // eslint-disable-next-line no-console
      console.log(
        "[animation] anim path=",
        animPath,
        "total anim files=",
        animFiles.length,
      );

      try {
        let animBuffer: ArrayBuffer | null = null;
        if (animPath) {
          animBuffer = await fetchAnimBinary(animPath);
        }
        if (cancelled) return;

        const m2Buffer = m2BufferRef.current;
        if (!m2Buffer) {
          setAnimationClip(null);
          return;
        }

        const clip = buildAnimationClip(
          currentParsed,
          m2Buffer,
          animId,
          animBuffer,
        );
        // eslint-disable-next-line no-console
        console.log(
          "[animation] clip=",
          clip?.name,
          "duration=",
          clip?.duration,
          "tracks=",
          clip?.tracks.length,
        );
        if (!cancelled) {
          setAnimationClip(clip);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Animation load failed:", err);
        if (!cancelled) {
          setAnimationClip(null);
        }
      }
    }

    loadAnimation();
    return () => {
      cancelled = true;
    };
  }, [parsed, animationState, debugAnimId, preview.anim_files]);

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

  const initialCamera = useMemo(
    () => ({ position: DEFAULT_CAMERA_POSITION, fov: DEFAULT_CAMERA_FOV }),
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
        )}
        {!loading && !error && !parsed && !canRender && (
          <div className="preview-placeholder">
            <AlertCircle className="h-12 w-12 text-text-tertiary" />
            <p>暂无可用的 3D 模型数据（{preview.status}）</p>
          </div>
        )}
      </div>
      <div className="viewer-toolbar flex-wrap">
        <button
          className={`btn btn-sm ${autoRotate ? "btn-primary" : "btn-ghost"}`}
          title={autoRotate ? "停止旋转" : "自动旋转"}
          onClick={() => setAutoRotate((v) => !v)}
        >
          <RotateCw className="h-4 w-4" />
        </button>
        <button
          className="btn btn-sm btn-ghost"
          title="放大"
          onClick={handleZoomIn}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          className="btn btn-sm btn-ghost"
          title="缩小"
          onClick={handleZoomOut}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          className="btn btn-sm btn-ghost"
          title="重置视角"
          onClick={handleReset}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          className={`btn btn-sm ${wireframe ? "btn-primary" : "btn-ghost"}`}
          title="线框模式"
          onClick={() => setWireframe((v) => !v)}
        >
          <Hexagon className="h-4 w-4" />
        </button>
        <button
          className="btn btn-sm btn-ghost"
          title="全屏"
          onClick={handleFullscreen}
        >
          <Maximize className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1 border-l border-border pl-2">
          <Camera className="h-4 w-4 text-text-tertiary" />
          <select
            className="h-8 rounded-md border border-border bg-bg-input px-2 text-sm text-text-primary outline-none focus:border-border-focus"
            value={cameraPreset ?? ""}
            onChange={(e) =>
              setCameraPreset((e.target.value as CameraPreset) || null)
            }
            title="视角预设"
          >
            <option value="">视角预设</option>
            {(Object.keys(PRESET_LABELS) as CameraPreset[]).map((preset) => (
              <option key={preset} value={preset}>
                {PRESET_LABELS[preset]}
              </option>
            ))}
          </select>
        </div>
        {parsed && parsed.m2.bones.length > 0 && (
          <>
            <div className="flex items-center gap-1 border-l border-border pl-2">
              {(
                [
                  ["stand", "站立"],
                  ["walk", "行走"],
                  ["run", "奔跑"],
                  ["flight", "飞行"],
                ] as [AnimationState, string][]
              ).map(([state, label]) => (
                <button
                  key={state}
                  className={`btn btn-sm ${
                    animationState === state ? "btn-primary" : "btn-ghost"
                  }`}
                  title={label}
                  onClick={() => setAnimationState(state)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 border-l border-border pl-2">
              <button
                className={`btn btn-sm ${isPlaying ? "btn-primary" : "btn-ghost"}`}
                title={isPlaying ? "暂停" : "播放"}
                onClick={() => setIsPlaying((v) => !v)}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>
              <select
                className="h-8 rounded-md border border-border bg-bg-input px-2 text-sm text-text-primary outline-none focus:border-border-focus"
                value={playbackRate}
                onChange={(e) => setPlaybackRate(Number(e.target.value))}
                title="播放速度"
              >
                {PLAYBACK_RATE_OPTIONS.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}x
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1 border-l border-border pl-2">
              <span className="text-xs text-text-tertiary">AnimID</span>
              <input
                type="number"
                className="h-8 w-16 rounded-md border border-border bg-bg-input px-2 text-sm text-text-primary outline-none focus:border-border-focus"
                value={customAnimId}
                onChange={(e) => setCustomAnimId(e.target.value)}
                title="自定义动画 ID"
                placeholder="ID"
              />
              <button
                className="btn btn-sm btn-ghost"
                title="应用自定义动画 ID"
                onClick={() => {
                  const id = parseInt(customAnimId, 10);
                  setDebugAnimId(Number.isNaN(id) ? null : id);
                }}
              >
                应用
              </button>
              {debugAnimId !== null && (
                <button
                  className="btn btn-sm btn-ghost"
                  title="清除自定义动画 ID"
                  onClick={() => {
                    setDebugAnimId(null);
                    setCustomAnimId("");
                  }}
                >
                  清除
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CameraController({
  parsed,
  preset,
}: {
  parsed: ParsedM2;
  preset: CameraPreset | null;
}) {
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
