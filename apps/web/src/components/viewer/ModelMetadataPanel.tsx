import { TextureViewer } from "./TextureViewer";
import type { AssetFile } from "@/shared/types";

interface ModelMetadataPanelProps {
  textures: AssetFile[];
  selectedTexture: AssetFile | null;
  onSelectTexture: (file: AssetFile) => void;
  modelPreview?: {
    status: string;
    metadata?: Record<string, unknown> | null;
  } | null;
}

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return `${value.length} 项`;
  return String(value);
}

export function ModelMetadataPanel({
  textures,
  selectedTexture,
  onSelectTexture,
  modelPreview,
}: ModelMetadataPanelProps) {
  const metaEntries = modelPreview?.metadata
    ? Object.entries(modelPreview.metadata)
    : [];

  return (
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
                  active={selectedTexture?.relative_path === file.relative_path}
                  onClick={() => onSelectTexture(file)}
                />
              ))}
            </div>
            <div className="px-4 pb-4">
              <div className="text-xs text-text-tertiary">当前贴图</div>
              <div className="mt-1 text-sm font-medium text-text-primary">
                {selectedTexture?.name || textures[0].name}
              </div>
              <div className="mt-1 text-[11px] text-text-tertiary">
                {selectedTexture?.relative_path || textures[0].relative_path}
              </div>
            </div>
          </>
        ) : (
          <div className="p-4 text-sm text-text-secondary">未找到贴图文件</div>
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
  );
}
