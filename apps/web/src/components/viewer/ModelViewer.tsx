import { useState, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import {
  AlertCircle,
  RotateCw,
  ZoomIn,
  Move,
  RefreshCw,
  Hexagon,
} from "lucide-react";
import { parseM2WithSkin } from "@/lib/m2/parser";
import { fetchM2Binary, getBlpPreviewUrl } from "@/shared/resources";
import { M2Scene, centerCameraOnModel } from "./M2Scene";
import type { ModelPreview } from "@/shared/types";
import type { ParsedM2 } from "@/lib/m2/types";

interface ModelViewerProps {
  preview: ModelPreview;
  resourceType: string;
  selectedTexture?: string | null;
}

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
    const name =
      path.split("/").pop()?.replace(".blp", "").toLowerCase() ?? "";
    return name.endsWith(`_${suffix}`);
  });

  return matching.length > 0 ? matching.sort() : [selectedPath];
}

export function ModelViewer({ preview, selectedTexture }: ModelViewerProps) {
  const [parsed, setParsed] = useState<ParsedM2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wireframe, setWireframe] = useState(false);

  const canRender = preview.status === "available" && preview.skin_files.length > 0;

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
        // Hardcoded texture filename; try to find matching .blp
        const baseName = texture.filename.replace(/\\/g, "/").split("/").pop();
        if (baseName) {
          const candidate = preview.blp_files.find((path) =>
            path
              .toLowerCase()
              .includes(baseName.toLowerCase().replace(".blp", "")),
          );
          if (candidate) {
            urls[index] = getBlpPreviewUrl(candidate);
          }
        }
      }
    });

    // Map skin textures (type 11/12/13) to available BLPs. When the user has
    // selected a texture variation, prefer BLPs that share the same suffix
    // (e.g. "blue" matches both body and saddle blue textures).
    const skinTextures = resolveSkinTextures(
      selectedTexture,
      preview.blp_files,
      preview.model_folder,
    );
    const skinSlots = parsed.m2.textures
      .map((texture, index) => ({ texture, index }))
      .filter(
        ({ texture, index }) =>
          (texture.type === 11 ||
            texture.type === 12 ||
            texture.type === 13) &&
          !urls[index],
      )
      .map(({ index }) => index);

    skinTextures.forEach((path, arrayIndex) => {
      const slot = skinSlots[arrayIndex];
      if (slot !== undefined) {
        urls[slot] = getBlpPreviewUrl(path);
      }
    });

    return urls;
  }, [parsed, preview.blp_files, preview.model_folder, selectedTexture]);

  return (
    <div className="flex h-full flex-col">
      <div className="viewer-canvas">
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
          <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} />
            <Grid infiniteGrid fadeDistance={25} />
            <M2Scene parsed={parsed} textureUrls={textureUrls} wireframe={wireframe} />
            <CameraController parsed={parsed} />
            <OrbitControls />
          </Canvas>
        )}
        {!loading && !error && !parsed && !canRender && (
          <div className="preview-placeholder">
            <AlertCircle className="h-12 w-12 text-text-tertiary" />
            <p>暂无可用的 3D 模型数据（{preview.status}）</p>
          </div>
        )}
      </div>
      <div className="viewer-toolbar">
        <button className="btn btn-sm btn-ghost" title="旋转">
          <RotateCw className="h-4 w-4" />
        </button>
        <button className="btn btn-sm btn-ghost" title="缩放">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button className="btn btn-sm btn-ghost" title="平移">
          <Move className="h-4 w-4" />
        </button>
        <button className="btn btn-sm btn-ghost" title="重置视角">
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          className={`btn btn-sm ${wireframe ? "btn-primary" : "btn-ghost"}`}
          title="线框模式"
          onClick={() => setWireframe((v) => !v)}
        >
          <Hexagon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CameraController({ parsed }: { parsed: ParsedM2 }) {
  const { camera } = useThree();

  useEffect(() => {
    centerCameraOnModel(camera, parsed);
  }, [camera, parsed]);

  return null;
}
