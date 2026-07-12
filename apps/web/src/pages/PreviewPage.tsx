import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  FolderTree,
  Layers,
  RotateCw,
  FolderOpen,
  AlertCircle,
} from "lucide-react";
import {
  getResource,
  getResourceAssets,
  getModelPreview,
} from "@/shared/resources";
import { AssetFileTree } from "@/components/viewer/AssetFileTree";
import { TextureViewer } from "@/components/viewer/TextureViewer";
import { ModelViewer } from "@/components/viewer/ModelViewer";
import type { AssetFile } from "@/shared/types";

export function PreviewPage() {
  const { resourceType, id } = useParams<{
    resourceType?: string;
    id?: string;
  }>();
  const resourceId = id ? parseInt(id, 10) : 0;
  const [selectedTexture, setSelectedTexture] = useState<AssetFile | null>(
    null,
  );

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
    ? [...assets.matched_textures, ...assets.image_files]
    : [];
  const metaEntries = modelPreview?.metadata
    ? Object.entries(modelPreview.metadata)
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
          <button className="btn btn-primary" disabled title="重新转换开发中">
            <RotateCw className="h-4 w-4" /> 重新转换
          </button>
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
                  files={[
                    ...assets.m2_files,
                    ...assets.texture_files,
                    ...assets.image_files,
                    ...assets.icon_files,
                  ]}
                  activePath={selectedTexture?.relative_path}
                  onSelect={(file) => setSelectedTexture(file)}
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

        {/* Center: 3D Viewer */}
        <div className="viewer-panel">
          {modelPreview ? (
            <ModelViewer preview={modelPreview} resourceType={resourceType} />
          ) : (
            <div className="viewer-canvas">
              <div className="preview-placeholder">
                <AlertCircle className="h-12 w-12" />
                <p>暂无模型预览数据</p>
              </div>
            </div>
          )}
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
                      onClick={() => setSelectedTexture(file)}
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
                <span className="meta-label">转换状态</span>
                <span
                  className={`meta-value ${
                    modelPreview?.conversion.status === "success"
                      ? "text-success"
                      : "text-warning"
                  }`}
                >
                  {modelPreview?.conversion.status === "success"
                    ? "成功"
                    : modelPreview?.conversion.status || "未知"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return `${value.length} 项`;
  return String(value);
}
