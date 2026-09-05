import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FolderTree, Layers, Eye, Box, Image as ImageIcon, Maximize2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AssetFileTree } from "@/components/viewer/AssetFileTree";
import { ImageGallery } from "@/components/media/ImageGallery";
import { ModelViewer } from "@/components/viewer/ModelViewer";
import { getModelPreview } from "@/shared/resources";
import { uniqueFiles } from "@/shared/utils";
import type { AssetFile, ModelPreview } from "@/shared/types";

type PreviewTab = "model" | "image";

interface ResourceDetailSidebarProps {
  resourceType: string;
  resourceId: number;
  assets:
    | {
        model_folder: string;
        resource_dir?: string;
        m2_files: AssetFile[];
        texture_files: AssetFile[];
        image_files: AssetFile[];
        icon_files: AssetFile[];
        matched_textures: AssetFile[];
      }
    | null
    | undefined;
  selectedImage: AssetFile | null;
  onSelectImage: (file: AssetFile) => void;
  allFiles: AssetFile[];
  selectedVariations?: [string | null, string | null, string | null];
  scale?: number;
  modelName?: string | null;
}

function buildEffectivePreview(
  preview: ModelPreview | undefined,
  modelName: string | null | undefined,
): ModelPreview | undefined {
  if (!preview || preview.status !== "available") return preview;
  if (!modelName) return preview;

  const targetBasename = modelName
    .split(/[\\/]/)
    .pop()
    ?.toLowerCase()
    .replace(/\.m2$/, "");
  if (!targetBasename) return preview;

  const selectedM2 = preview.m2_files.find((path) => {
    const base = path.split("/").pop()?.toLowerCase().replace(/\.m2$/, "");
    return base === targetBasename;
  });
  if (!selectedM2) return preview;

  const mainStem = selectedM2.split("/").pop()?.replace(/\.m2$/i, "") ?? "";
  const skinFiles = preview.skin_files.filter((path) => {
    const name = path.split("/").pop()?.toLowerCase() ?? "";
    const stem = name.replace(/\.skin$/, "");
    const suffix = stem.slice(mainStem.length);
    return stem.startsWith(mainStem.toLowerCase()) && /^\d+$/.test(suffix);
  });

  return {
    ...preview,
    main_m2: selectedM2,
    skin_files: skinFiles.length > 0 ? skinFiles : preview.skin_files,
  };
}

export function ResourceDetailSidebar({
  resourceType,
  resourceId,
  assets,
  selectedImage,
  onSelectImage,
  allFiles,
  selectedVariations,
  scale = 1,
  modelName,
}: ResourceDetailSidebarProps) {
  const [activeTab, setActiveTab] = useState<PreviewTab>("model");

  const { data: modelPreview } = useQuery({
    queryKey: ["model-preview", assets?.model_folder, resourceType],
    queryFn: () => getModelPreview(assets!.model_folder, resourceType),
    enabled: !!assets?.model_folder,
  });

  const effectivePreview = useMemo(
    () => buildEffectivePreview(modelPreview, modelName),
    [modelPreview, modelName],
  );

  const galleryFiles = assets
    ? uniqueFiles([
        ...assets.image_files,
        ...assets.matched_textures,
        ...assets.icon_files,
      ])
    : [];

  const canShowModel = effectivePreview?.status === "available";
  const canShowImage = galleryFiles.length > 0;

  return (
    <div className="detail-sidebar">
      <div className="card">
        <div className="card-header">
          <div className="card-title">模型预览</div>
        </div>
        <div className="card-body space-y-3">
          <div className="flex items-center gap-2">
            {(canShowModel || !canShowImage) && (
              <button
                type="button"
                onClick={() => setActiveTab("model")}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "model"
                    ? "bg-accent text-white"
                    : "bg-bg-surface text-text-secondary hover:bg-bg-hover"
                }`}
              >
                <Box className="h-3.5 w-3.5" /> 3D 预览
              </button>
            )}
            {canShowImage && (
              <button
                type="button"
                onClick={() => setActiveTab("image")}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "image"
                    ? "bg-accent text-white"
                    : "bg-bg-surface text-text-secondary hover:bg-bg-hover"
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" /> 图片
              </button>
            )}
          </div>

          <div className="relative h-[300px] overflow-hidden rounded-lg border border-border bg-bg-elevated">
            <Link
              to={`/preview/${resourceType}/${resourceId}`}
              target="_blank"
              rel="noreferrer"
              title="新标签页打开完整预览"
              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Link>
            {activeTab === "model" && canShowModel && effectivePreview && (
              <ModelViewer
                preview={effectivePreview}
                resourceType={resourceType}
                selectedVariations={selectedVariations}
                scale={scale}
              />
            )}
            {activeTab === "model" && !canShowModel && (
              <div className="preview-placeholder flex h-full flex-col items-center justify-center px-4 text-center">
                <p>
                  {effectivePreview?.status === "skin_missing"
                    ? "缺少 skin 文件，无法预览"
                    : "暂无可用的 3D 模型数据"}
                </p>
              </div>
            )}
            {activeTab === "image" && (
              <ImageGallery
                files={galleryFiles}
                selected={selectedImage}
                onSelect={onSelectImage}
              />
            )}
          </div>

          <Link
            to={`/preview/${resourceType}/${resourceId}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm btn-primary w-full"
          >
            <Eye className="h-4 w-4" /> 完整预览
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">资源文件</div>
        </div>
        <div className="card-body">
          {assets ? (
            <>
              {assets.resource_dir && (
                <div className="file-tree-item mb-1 font-medium text-text-primary">
                  <FolderTree className="h-4 w-4" />
                  {assets.model_folder}
                </div>
              )}
              <AssetFileTree
                title=""
                icon=<Layers className="h-4 w-4" />
                files={allFiles}
              />
            </>
          ) : (
            <p className="text-sm text-text-secondary">暂无文件信息</p>
          )}
        </div>
      </div>
    </div>
  );
}
