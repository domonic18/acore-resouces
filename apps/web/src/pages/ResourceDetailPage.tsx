import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Box,
  FolderTree,
  RefreshCw,
  Eye,
  Layers,
} from "lucide-react";
import {
  getResource,
  getResourceAssets,
  getBlpPreviewUrl,
  getFilePreviewUrl,
} from "@/shared/resources";
import { AssetFileTree } from "@/components/viewer/AssetFileTree";
import { cn } from "@/shared/utils";
import type { AssetFile, Resource } from "@/shared/types";

const DBC_TABS = [
  { key: "creature_display_info", label: "CreatureDisplayInfo" },
  { key: "creature_model_data", label: "CreatureModelData" },
  { key: "spell", label: "Spell" },
  { key: "item", label: "Item" },
  { key: "creature_template", label: "CreatureTemplate" },
  { key: "creature_model_info", label: "CreatureModelInfo" },
  { key: "item_template", label: "ItemTemplate" },
];

export function ResourceDetailPage() {
  const { resourceType = "mount", id } = useParams<{
    resourceType: string;
    id: string;
  }>();
  const resourceId = parseInt(id || "0", 10);
  const [activeTab, setActiveTab] = useState("creature_display_info");
  const [selectedImage, setSelectedImage] = useState<AssetFile | null>(null);

  const {
    data: resource,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["resource", resourceType, resourceId],
    queryFn: () => getResource(resourceType, resourceId),
  });

  const { data: assets } = useQuery({
    queryKey: ["assets", resourceType, resourceId],
    queryFn: () => getResourceAssets(resourceType, resourceId),
    enabled: !!resource,
  });

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

  const allFiles = assets
    ? [
        ...assets.m2_files,
        ...assets.texture_files,
        ...assets.image_files,
        ...assets.icon_files,
      ]
    : [];

  return (
    <div className="content">
      <header className="topbar">
        <div className="flex items-center gap-3">
          <Link to="/resources" className="btn btn-sm btn-ghost">
            <ArrowLeft className="h-4 w-4" /> 返回列表
          </Link>
          <h1 className="page-title">编辑资源</h1>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-danger" disabled title="删除功能开发中">
            删除
          </button>
          <button className="btn btn-success" disabled title="保存功能开发中">
            保存
          </button>
        </div>
      </header>

      <div className="detail-layout">
        <div className="detail-main">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">基础信息</div>
                <div className="card-subtitle">
                  id: {String(resource.id).padStart(4, "0")} · 最后修改：
                  {today()}
                </div>
              </div>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <FormGroup label="资源 ID">
                  <input
                    type="text"
                    className="form-input"
                    value={resource.id}
                    readOnly
                  />
                  <p className="form-hint">由系统生成，不可修改</p>
                </FormGroup>
                <FormGroup label="模型文件夹">
                  <input
                    type="text"
                    className="form-input"
                    value={resource.model_folder}
                    readOnly
                  />
                </FormGroup>
                <FormGroup label="官方名称">
                  <input
                    type="text"
                    className="form-input"
                    value={resource.official_db.name || ""}
                    readOnly
                  />
                </FormGroup>
                {resource.resource_type === "mount" && (
                  <>
                    <FormGroup label="坐骑类型">
                      <select
                        className="form-select"
                        value={resource.mount_type || ""}
                        disabled
                      >
                        <option value="">未设置</option>
                        <option>飞行坐骑</option>
                        <option>陆地坐骑</option>
                        <option>水域坐骑</option>
                      </select>
                    </FormGroup>
                    <FormGroup label="星级">
                      <select
                        className="form-select"
                        value={resource.star_rating || ""}
                        disabled
                      >
                        <option value="">未设置</option>
                        <option>一星</option>
                        <option>二星</option>
                        <option>三星</option>
                        <option>四星</option>
                        <option>五星</option>
                      </select>
                    </FormGroup>
                    <FormGroup label="子类型">
                      <input
                        type="text"
                        className="form-input"
                        value={resource.subtype || ""}
                        readOnly
                      />
                    </FormGroup>
                  </>
                )}
                {(resource.resource_type === "pet" ||
                  resource.resource_type === "npc") && (
                  <FormGroup label="稀有度">
                    <input
                      type="text"
                      className="form-input"
                      value={resource.rarity || ""}
                      readOnly
                    />
                  </FormGroup>
                )}
                <FormGroup label="状态" className="full-width">
                  <div className="flex gap-5">
                    <label className="flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={resource.debug_passed}
                        disabled
                      />{" "}
                      调试通过
                    </label>
                    <label className="flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={resource.added}
                        disabled
                      />{" "}
                      已添加
                    </label>
                  </div>
                </FormGroup>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">掉落信息</div>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <FormGroup label="掉落 entry">
                  <input
                    type="text"
                    className="form-input"
                    value={resource.drop.entry ?? ""}
                    readOnly
                  />
                </FormGroup>
                <FormGroup label="副本">
                  <input
                    type="text"
                    className="form-input"
                    value={resource.drop.instance ?? ""}
                    readOnly
                  />
                </FormGroup>
                <FormGroup label="Boss 名称">
                  <input
                    type="text"
                    className="form-input"
                    value={resource.drop.boss ?? ""}
                    readOnly
                  />
                </FormGroup>
                <FormGroup label="掉率">
                  <input
                    type="text"
                    className="form-input"
                    value={resource.drop.rate ?? ""}
                    readOnly
                  />
                </FormGroup>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">DBC / 数据库配置</div>
            </div>
            <div className="card-body">
              <div className="tabs mb-5 px-0">
                {DBC_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    className={cn("tab", activeTab === tab.key && "active")}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <FormGroup label="原始数据" className="full-width">
                  <textarea
                    className="form-textarea"
                    rows={12}
                    value={getTabData(resource, activeTab)}
                    readOnly
                  />
                  <p className="form-hint">由系统自动同步，不建议直接编辑</p>
                </FormGroup>
              </div>
            </div>
          </div>
        </div>

        <div className="detail-sidebar">
          <div className="card">
            <div className="card-header">
              <div className="card-title">模型预览</div>
            </div>
            <div className="card-body">
              <ImageGallery
                files={
                  assets
                    ? [
                        ...assets.image_files,
                        ...assets.matched_textures,
                        ...assets.icon_files,
                      ]
                    : []
                }
                selected={selectedImage}
                onSelect={setSelectedImage}
              />
              <div className="preview-toolbar">
                <button className="btn btn-sm w-full" disabled>
                  <RefreshCw className="h-4 w-4" /> 刷新
                </button>
                <Link
                  to={`/preview/${resourceType}/${resourceId}`}
                  className="btn btn-sm btn-primary w-full"
                >
                  <Eye className="h-4 w-4" /> 完整预览
                </Link>
              </div>
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

          <div className="card">
            <div className="card-header">
              <div className="card-title">操作日志</div>
            </div>
            <div className="card-body">
              <div className="space-y-3 text-xs text-text-secondary">
                <LogEntry time={`${today()} 15:32`} text="从 Excel 重新导入" />
                <LogEntry
                  time={`${today()} 11:08`}
                  text="更新 star_rating: 三星 → 四星"
                />
                <LogEntry time={`${today()} 10:15`} text="创建资源定义" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("form-group", className)}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

function LogEntry({ time, text }: { time: string; text: string }) {
  return (
    <div className="border-b border-border pb-3 last:border-b-0">
      <div className="text-[11px] text-text-tertiary">{time}</div>
      <div>{text}</div>
    </div>
  );
}

function ImageGallery({
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
      <div className="preview-frame">
        <div className="preview-placeholder">
          <Box className="h-12 w-12" />
          <p>未找到模型图片</p>
        </div>
      </div>
    );
  }

  const current = selected ?? files[0];

  return (
    <div>
      <div className="preview-frame">
        <img
          src={filePreviewUrl(current)}
          alt={current.name}
          className="relative z-10 max-h-full max-w-full rounded-md object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {files.map((file) => (
          <button
            key={file.relative_path}
            type="button"
            onClick={() => onSelect(file)}
            className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border object-cover transition-all ${
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
    </div>
  );
}

function filePreviewUrl(file: AssetFile): string {
  if (file.file_type === "blp") {
    return getBlpPreviewUrl(file.relative_path, 512);
  }
  return getFilePreviewUrl(file.relative_path);
}

function getTabData(resource: Resource, key: string): string {
  const data =
    (resource.dbc as unknown as Record<string, unknown>)[key] ??
    (resource.db as unknown as Record<string, unknown>)[key] ??
    {};
  return JSON.stringify(data, null, 2);
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}
