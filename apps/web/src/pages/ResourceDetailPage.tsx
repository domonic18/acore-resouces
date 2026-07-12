import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Box,
  FolderTree,
  RefreshCw,
  Eye,
  Layers,
  Save,
} from "lucide-react";
import {
  getResource,
  getResourceAssets,
  getBlpPreviewUrl,
  getFilePreviewUrl,
  getAllIcons,
  getIconPreviewUrl,
  updateResource,
} from "@/shared/resources";
import { AssetFileTree } from "@/components/viewer/AssetFileTree";
import { cn } from "@/shared/utils";
import type { AssetFile, Resource, ResourceUpdate } from "@/shared/types";

const DBC_TABS = [
  { key: "creature_display_info", label: "CreatureDisplayInfo" },
  { key: "creature_model_data", label: "CreatureModelData" },
  { key: "spell", label: "Spell" },
  { key: "item", label: "Item" },
  { key: "creature_template", label: "CreatureTemplate" },
  { key: "creature_model_info", label: "CreatureModelInfo" },
  { key: "item_template", label: "ItemTemplate" },
];

interface FormState {
  name: string;
  mount_type: string;
  star_rating: string;
  subtype: string;
  rarity: string;
  drop_entry: string | number;
  drop_instance: string;
  drop_boss: string;
  drop_rate: string | number;
  debug_passed: boolean;
  added: boolean;
}

function buildForm(resource?: Resource): FormState {
  return {
    name: resource?.official_db.name || resource?.name || "",
    mount_type: resource?.mount_type || "",
    star_rating: resource?.star_rating || "",
    subtype: resource?.subtype || "",
    rarity: resource?.rarity || "",
    drop_entry: resource?.drop.entry ?? "",
    drop_instance: resource?.drop.instance ?? "",
    drop_boss: resource?.drop.boss ?? "",
    drop_rate: resource?.drop.rate ?? "",
    debug_passed: resource?.debug_passed ?? false,
    added: resource?.added ?? false,
  };
}

export function ResourceDetailPage() {
  const { resourceType = "mount", id } = useParams<{
    resourceType: string;
    id: string;
  }>();
  const resourceId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();
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

  const { data: iconNames = [] } = useQuery({
    queryKey: ["icons"],
    queryFn: getAllIcons,
    enabled: !!resource,
  });

  const [form, setForm] = useState<FormState>(() => buildForm(resource));

  useEffect(() => {
    if (resource) setForm(buildForm(resource));
  }, [resource]);

  const [itemIcon, setItemIcon] = useState(resource?.official_db.icon_name || "");
  const [spellIcon, setSpellIcon] = useState(
    resource?.official_db.spell_icon_name || "",
  );

  useEffect(() => {
    setItemIcon(resource?.official_db.icon_name || "");
    setSpellIcon(resource?.official_db.spell_icon_name || "");
  }, [resource?.official_db.icon_name, resource?.official_db.spell_icon_name]);

  const updateMutation = useMutation({
    mutationFn: (update: ResourceUpdate) =>
      updateResource(resourceType, resourceId, update),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["resource", resourceType, resourceId],
      });
      queryClient.invalidateQueries({ queryKey: ["resources-all"] });
    },
  });

  const hasChanges = useMemo(() => {
    if (!resource) return false;
    return JSON.stringify(form) !== JSON.stringify(buildForm(resource));
  }, [form, resource]);

  const iconChanged = useMemo(() => {
    if (!resource) return false;
    return (
      itemIcon !== (resource.official_db.icon_name || "") ||
      spellIcon !== (resource.official_db.spell_icon_name || "")
    );
  }, [itemIcon, spellIcon, resource]);

  const updateField = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!resource) return;
    const update: ResourceUpdate = {};
    const baseline = buildForm(resource);

    if (form.name !== baseline.name) {
      update.name = form.name || null;
    }
    if (form.mount_type !== baseline.mount_type) {
      update.mount_type = form.mount_type || null;
    }
    if (form.star_rating !== baseline.star_rating) {
      update.star_rating = form.star_rating || null;
    }
    if (form.subtype !== baseline.subtype) {
      update.subtype = form.subtype || null;
    }
    if (form.rarity !== baseline.rarity) {
      update.rarity = form.rarity || null;
    }
    if (
      form.debug_passed !== baseline.debug_passed ||
      form.added !== baseline.added
    ) {
      update.debug_passed = form.debug_passed;
      update.added = form.added;
    }

    const dropUpdate: ResourceUpdate["drop"] = {};
    const entry = normalizeInt(form.drop_entry);
    if (entry !== resource.drop.entry) dropUpdate.entry = entry;
    const rate = normalizeFloat(form.drop_rate);
    if (rate !== resource.drop.rate) dropUpdate.rate = rate;
    if (form.drop_instance !== (resource.drop.instance ?? "")) {
      dropUpdate.instance = form.drop_instance || null;
    }
    if (form.drop_boss !== (resource.drop.boss ?? "")) {
      dropUpdate.boss = form.drop_boss || null;
    }
    if (Object.keys(dropUpdate).length > 0) {
      update.drop = dropUpdate;
    }

    updateMutation.mutate(update);
  };

  const handleSaveIcons = () => {
    if (!resource) return;
    const update: ResourceUpdate = {};
    if (itemIcon !== (resource.official_db.icon_name || "")) {
      update.icon_name = itemIcon || null;
    }
    if (spellIcon !== (resource.official_db.spell_icon_name || "")) {
      update.spell_icon_name = spellIcon || null;
    }
    updateMutation.mutate(update);
  };

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

  const isMount = resource.resource_type === "mount";

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
          <button
            className="btn btn-success"
            disabled={!hasChanges || updateMutation.isPending}
            onClick={handleSave}
          >
            <Save className="h-4 w-4" />
            {updateMutation.isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </header>

      {updateMutation.isError && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {updateMutation.error instanceof Error
            ? updateMutation.error.message
            : "保存失败"}
        </div>
      )}

      <div className="detail-layout">
        <div className="detail-main">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">基础信息</div>
                <div className="card-subtitle">
                  id: {String(resource.id).padStart(4, "0")} · 最后修改：
                  {formatDateTime(resource.updated_at)}
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
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                  />
                </FormGroup>
                {isMount && (
                  <>
                    <FormGroup label="坐骑类型">
                      <select
                        className="form-select"
                        value={form.mount_type}
                        onChange={(e) =>
                          updateField("mount_type", e.target.value)
                        }
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
                        value={form.star_rating}
                        onChange={(e) =>
                          updateField("star_rating", e.target.value)
                        }
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
                        value={form.subtype}
                        onChange={(e) => updateField("subtype", e.target.value)}
                      />
                    </FormGroup>
                  </>
                )}
                {!isMount && (
                  <FormGroup label="稀有度">
                    <input
                      type="text"
                      className="form-input"
                      value={form.rarity}
                      onChange={(e) => updateField("rarity", e.target.value)}
                    />
                  </FormGroup>
                )}
                <FormGroup label="状态" className="full-width">
                  <div className="flex gap-5">
                    <label className="flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={form.debug_passed}
                        onChange={(e) =>
                          updateField("debug_passed", e.target.checked)
                        }
                      />{" "}
                      调试通过
                    </label>
                    <label className="flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={form.added}
                        onChange={(e) => updateField("added", e.target.checked)}
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
                    type="number"
                    className="form-input"
                    value={form.drop_entry}
                    onChange={(e) => updateField("drop_entry", e.target.value)}
                  />
                </FormGroup>
                <FormGroup label="副本">
                  <input
                    type="text"
                    className="form-input"
                    value={form.drop_instance}
                    onChange={(e) =>
                      updateField("drop_instance", e.target.value)
                    }
                  />
                </FormGroup>
                <FormGroup label="Boss 名称">
                  <input
                    type="text"
                    className="form-input"
                    value={form.drop_boss}
                    onChange={(e) => updateField("drop_boss", e.target.value)}
                  />
                </FormGroup>
                <FormGroup label="掉率">
                  <input
                    type="number"
                    step="0.0001"
                    className="form-input"
                    value={form.drop_rate}
                    onChange={(e) => updateField("drop_rate", e.target.value)}
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
              <div className="card-title">{isMount ? "图标配置" : "图标"}</div>
            </div>
            <div className="card-body space-y-5">
              {isMount && (
                <>
                  <IconEditor
                    label="Item 图标"
                    value={itemIcon}
                    iconNames={iconNames}
                    onChange={setItemIcon}
                  />
                  <IconEditor
                    label="Spell 图标"
                    value={spellIcon}
                    iconNames={iconNames}
                    onChange={setSpellIcon}
                  />
                </>
              )}
              {!isMount && (
                <IconEditor
                  label="图标名称"
                  value={itemIcon}
                  iconNames={iconNames}
                  onChange={setItemIcon}
                />
              )}
              <button
                className="btn btn-primary w-full"
                disabled={!iconChanged || updateMutation.isPending}
                onClick={handleSaveIcons}
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "保存中..." : "保存图标"}
              </button>
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

function IconEditor({
  label,
  value,
  iconNames,
  onChange,
}: {
  label: string;
  value: string;
  iconNames: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-bg-surface">
          {value ? (
            <img
              src={getIconPreviewUrl(value, 96)}
              alt={value}
              className="h-12 w-12 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Box className="h-8 w-8 text-text-tertiary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <label className="form-label">{label}</label>
          <input
            list="icon-options"
            type="text"
            className="form-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="输入或选择图标"
          />
          <datalist id="icon-options">
            {iconNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeInt(value: string | number): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function normalizeFloat(value: string | number): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isNaN(n) ? null : n;
}
