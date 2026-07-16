import {
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
import { PLAYBACK_RATE_OPTIONS } from "./constants";
import { PRESET_LABELS, type CameraPreset } from "./types";
import type { AnimationState } from "@/lib/m2/animationIds";
import type { ParsedM2 } from "@/lib/m2/types";

interface ModelViewerToolbarProps {
  parsed: ParsedM2 | null;
  autoRotate: boolean;
  setAutoRotate: (value: boolean) => void;
  wireframe: boolean;
  setWireframe: (value: boolean) => void;
  cameraPreset: CameraPreset | null;
  setCameraPreset: (preset: CameraPreset | null) => void;
  animationState: AnimationState;
  setAnimationState: (state: AnimationState) => void;
  isPlaying: boolean;
  setIsPlaying: (value: boolean) => void;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  customAnimId: string;
  setCustomAnimId: (value: string) => void;
  debugAnimId: number | null;
  setDebugAnimId: (id: number | null) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFullscreen: () => void;
}

export function ModelViewerToolbar({
  parsed,
  autoRotate,
  setAutoRotate,
  wireframe,
  setWireframe,
  cameraPreset,
  setCameraPreset,
  animationState,
  setAnimationState,
  isPlaying,
  setIsPlaying,
  playbackRate,
  setPlaybackRate,
  customAnimId,
  setCustomAnimId,
  debugAnimId,
  setDebugAnimId,
  onZoomIn,
  onZoomOut,
  onReset,
  onFullscreen,
}: ModelViewerToolbarProps) {
  return (
    <div className="viewer-toolbar flex-wrap">
      <button
        className={`btn btn-sm ${autoRotate ? "btn-primary" : "btn-ghost"}`}
        title={autoRotate ? "停止旋转" : "自动旋转"}
        onClick={() => setAutoRotate(!autoRotate)}
      >
        <RotateCw className="h-4 w-4" />
      </button>
      <button className="btn btn-sm btn-ghost" title="放大" onClick={onZoomIn}>
        <ZoomIn className="h-4 w-4" />
      </button>
      <button className="btn btn-sm btn-ghost" title="缩小" onClick={onZoomOut}>
        <ZoomOut className="h-4 w-4" />
      </button>
      <button
        className="btn btn-sm btn-ghost"
        title="重置视角"
        onClick={onReset}
      >
        <RefreshCw className="h-4 w-4" />
      </button>
      <button
        className={`btn btn-sm ${wireframe ? "btn-primary" : "btn-ghost"}`}
        title="线框模式"
        onClick={() => setWireframe(!wireframe)}
      >
        <Hexagon className="h-4 w-4" />
      </button>
      <button
        className="btn btn-sm btn-ghost"
        title="全屏"
        onClick={onFullscreen}
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
              onClick={() => setIsPlaying(!isPlaying)}
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
  );
}
