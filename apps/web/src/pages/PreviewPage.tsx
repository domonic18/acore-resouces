import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  FolderTree,
  Layers,
  FolderOpen,
  AlertCircle,
  Box,
  Image as ImageIcon,
} from "lucide-react";
import {
  getResource,
  getResourceAssets,
  getModelPreview,
  getFilePreviewUrl,
  getBlpPreviewUrl,
} from "@/shared/resources";
import { AssetFileTree } from "@/components/viewer/AssetFileTree";
import { TextureViewer } from "@/components/viewer/TextureViewer";
import { ModelViewer } from "@/components/viewer/ModelViewer";
import { uniqueFiles } from "@/shared/utils";
import type { AssetFile } from "@/shared/types";

type PreviewTab = "model" | "image";

export function PreviewPage() {
  const { resourceType, id } = useParams<{
    resourceType?: string;
    id?: string;
  }>();
  const resourceId = id ? parseInt(id, 10) : 0;
  const [activeTab, setActiveTab] = useState<PreviewTab>("model");
  const [selectedTexture, setSelectedTexture] = useState<AssetFile | null>(
    null,
  );
  const [selectedImage, setSelectedImage] = useState<AssetFile | null>(null);

  const {
    data: resource,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["resource", resourceType, resourceId],
    queryFn: () => getResource(resourceType!, resourceId),
    enabled: !!resourceType && resourceId > 0,
  });

  const { data: assets } = useQuery({
    queryKey: ["assets", resourceType, resourceId],
    queryFn: () => getResourceAssets(resourceType!, resourceId),
    enabled: !!resource,
  });

  const { data: modelPreview } = useQuery({
    queryKey: ["model-preview", resource?.model_folder, resourceType],
    queryFn: () => getModelPreview(resource!.model_folder, resourceType),
    enabled: !!resource,
  });

  if (!resourceType || !id) {
    return (
      <div className="content">
        <div className="empty-state">
          <FolderOpen className="mb-5 h-16 w-16 text-text-tertiary" />
          <h3>未选择资源</h3>
          <p>请从资源列表选择一个资源进入预览页面。</p>
          <Link to="/resources" className="btn btn-primary mt-4">
            前往资源列表
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="content">
        <p className="text-text-secondary">加载中...</p>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="content">
        <div className="card p-6">
          <Link to="/resources" className="btn btn-sm btn-ghost mb-4">
            <ArrowLeft className="h-4 w-4" /> 返回列表
          </Link>
          <p className="text-danger">
            {error instanceof Error ? error.message : "资源不存在"}
          </p>
        </div>
      </div>
    );
  }

  const textures = assets
    ? [...assets.matched_textures, ...assets.texture_files]
    : [];
  const imageFiles = assets ? assets.image_files : [];
  const metaEntries = modelPreview?.metadata
    ? Object.entries(modelPreview.metadata)
    : [];

  const canShowModel = modelPreview?.status === "available";
  const canShowImage = imageFiles.length > 0;

  function handleFileSelect(file: AssetFile) {
    if (file.file_type === "m2") {
      setActiveTab("model");
    } else if (file.file_type === "blp") {
      setSelectedTexture(file);
      setActiveTab("model");
    } else if (["png", "gif"].includes(file.file_type)) {
      setSelectedImage(file);
      setActiveTab("image");
    }
  }

  const allFiles = assets
    ? uniqueFiles([
        ...assets.m2_files,
        ...assets.texture_files,
        ...(assets.anim_files ?? []),
        ...assets.image_files,
        ...assets.icon_files,
      ])
    : [];

  return (
    <div className="content">
      <header className="topbar">
        <div className="flex items-center gap-3">
          <Link
            to={`/resources/${resourceType}/${resourceId}`}
            className="btn btn-sm btn-ghost"
          >
            <ArrowLeft className="h-4 w-4" /> 返回编辑
          </Link>
          <h1 className="page-title">
            资源预览：{resource.name || resource.model_folder}
          </h1>
        </div>
        <div className="topbar-actions">
          <Link to={`/resources/${resourceType}/${resourceId}`} className="btn">
            编辑资源
          </Link>
        </div>
      </header>

      <div className="viewer-container">
        {/* Left: File Tree */}
        <div className="viewer-panel">
          <div className="panel-header">文件树</div>
          <div className="panel-body">
            {assets ? (
              <div className="p-2">
                <div className="file-tree-item font-medium text-text-primary">
                  <FolderTree className="h-4 w-4" />
                  {assets.model_folder}
                </div>
                <AssetFileTree
                  title=""
                  icon=<Layers className="h-4 w-4" />
                  files={allFiles}
                  activePath={
                    activeTab === "image"
                      ? selectedImage?.relative_path
                      : activeTab === "model" && selectedTexture
                        ? selectedTexture.relative_path
                        : activeTab === "model"
                          ? modelPreview?.main_m2
                          : undefined
                  }
                  onSelect={handleFileSelect}
                />
              </div>
            ) : (
              <div className="p-4 text-sm text-text-secondary">
                暂无文件信息
              </div>
            )}
          </div>
          <div className="panel-footer">
            <button
              className="btn btn-sm w-full"
              disabled
              title="打开资源目录开发中"
            >
              <FolderOpen className="h-4 w-4" /> 打开资源目录
            </button>
          </div>
        </div>

        {/* Center: Tabbed Viewer */}
        <div className="viewer-panel">
          <div className="panel-header flex items-center gap-2">
            {canShowModel && (
              <button
                type="button"
                onClick={() => setActiveTab("model")}
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-sm ${
                  activeTab === "model"
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                <Box className="h-4 w-4" /> 3D 模型
              </button>
            )}
            {canShowImage && (
              <button
                type="button"
                onClick={() => setActiveTab("image")}
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-sm ${
                  activeTab === "image"
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                <ImageIcon className="h-4 w-4" /> 图片
              </button>
            )}
          </div>

          <div className="relative flex-1 overflow-hidden">
            {activeTab === "model" && modelPreview && (
              <ModelViewer
                preview={modelPreview}
                resourceType={resourceType}
                selectedTexture={selectedTexture?.relative_path}
              />
            )}
            {activeTab === "model" && !canShowModel && (
              <div className="preview-placeholder">
                <AlertCircle className="h-12 w-12 text-text-tertiary" />
                <p>暂无可用的 3D 模型数据</p>
                <p className="text-text-tertiary">
                  状态：{modelPreview?.status || "未知"}
                </p>
              </div>
            )}
            {activeTab === "image" && (
              <ImageViewer
                files={imageFiles}
                selected={selectedImage}
                onSelect={setSelectedImage}
              />
            )}
          </div>
        </div>

        {/* Right: Textures & Meta */}
        <div className="viewer-panel">
          <div className="panel-header">贴图变体</div>
          <div className="panel-body">
            {textures.length > 0 ? (
              <>
                <div className="texture-grid">
                  {textures.map((file) => (
                    <TextureViewer
                      key={file.relative_path}
                      path={file.relative_path}
                      label={file.name}
                      size={96}
                      active={
                        selectedTexture?.relative_path === file.relative_path
                      }
                      onClick={() => {
                        setSelectedTexture(file);
                        setActiveTab("model");
                      }}
                    />
                  ))}
                </div>
                <div className="px-4 pb-4">
                  <div className="text-xs text-text-tertiary">当前贴图</div>
                  <div className="mt-1 text-sm font-medium text-text-primary">
                    {selectedTexture?.name || textures[0].name}
                  </div>
                  <div className="mt-1 text-[11px] text-text-tertiary">
                    {selectedTexture?.relative_path ||
                      textures[0].relative_path}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 text-sm text-text-secondary">
                未找到贴图文件
              </div>
            )}

            <div className="border-t border-border"></div>
            <div className="panel-header">模型元数据</div>
            <div className="meta-list">
              {metaEntries.length > 0 ? (
                metaEntries.map(([key, value]) => (
                  <div className="meta-item" key={key}>
                    <span className="meta-label">{key}</span>
                    <span className="meta-value">{formatMetaValue(value)}</span>
                  </div>
                ))
              ) : (
                <div className="text-text-secondary">暂无元数据</div>
              )}
              <div className="meta-item">
                <span className="meta-label">渲染状态</span>
                <span
                  className={`meta-value ${
                    modelPreview?.status === "available"
                      ? "text-success"
                      : "text-warning"
                  }`}
                >
                  {modelPreview?.status === "available"
                    ? "可渲染"
                    : modelPreview?.status === "skin_missing"
                      ? "缺少 skin 文件"
                      : modelPreview?.status || "未知"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageViewer({
  files,
  selected,
  onSelect,
}: {
  files: AssetFile[];
  selected: AssetFile | null;
  onSelect: (file: AssetFile) => void;
}) {
  if (files.length === 0) {
    return (
      <div className="preview-placeholder">
        <AlertCircle className="h-12 w-12 text-text-tertiary" />
        <p>没有图片文件</p>
      </div>
    );
  }

  const current = selected ?? files[0];

  return (
    <>
      <div className="viewer-canvas">
        <img
          src={filePreviewUrl(current)}
          alt={current.name}
          className="relative z-10 max-h-full max-w-full rounded-md object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>
      <div className="viewer-toolbar flex-wrap">
        {files.map((file) => (
          <button
            key={file.relative_path}
            type="button"
            onClick={() => onSelect(file)}
            className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border object-cover transition-all ${
              current.relative_path === file.relative_path
                ? "border-accent"
                : "border-border hover:border-border-hover"
            }`}
          >
            <img
              src={filePreviewUrl(file)}
              alt={file.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </button>
        ))}
      </div>
    </>
  );
}

function filePreviewUrl(file: AssetFile): string {
  if (file.file_type === "blp") {
    return getBlpPreviewUrl(file.relative_path, 512);
  }
  return getFilePreviewUrl(file.relative_path);
}

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return `${value.length} 项`;
  return String(value);
}
