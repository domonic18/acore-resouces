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
} from "@/shared/resources";
import { AssetFileTree } from "@/components/viewer/AssetFileTree";
import { ModelViewer } from "@/components/viewer/ModelViewer";
import { ModelMetadataPanel } from "@/components/viewer/ModelMetadataPanel";
import { ImageGallery } from "@/components/media/ImageGallery";
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

  function handleTextureSelect(file: AssetFile) {
    setSelectedTexture(file);
    setActiveTab("model");
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
              <ImageGallery
                variant="viewer"
                files={imageFiles}
                selected={selectedImage}
                onSelect={setSelectedImage}
              />
            )}
          </div>
        </div>

        {/* Right: Textures & Meta */}
        <ModelMetadataPanel
          textures={textures}
          selectedTexture={selectedTexture}
          onSelectTexture={handleTextureSelect}
          modelPreview={modelPreview}
        />
      </div>
    </div>
  );
}
