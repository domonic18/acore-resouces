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

const QUALITY_OPTIONS = [
  { value: 0, label: "Poor 劣质" },
  { value: 1, label: "Common 普通" },
  { value: 2, label: "Uncommon 优秀" },
  { value: 3, label: "Rare 精良" },
  { value: 4, label: "Epic 史诗" },
  { value: 5, label: "Legendary 传说" },
  { value: 6, label: "Artifact 神器" },
  { value: 7, label: "Heirloom 传家宝" },
];

const CLASS_FLAGS = [
  { value: 1, label: "Warrior 战士" },
  { value: 2, label: "Paladin 圣骑士" },
  { value: 4, label: "Hunter 猎人" },
  { value: 8, label: "Rogue 盗贼" },
  { value: 16, label: "Priest 牧师" },
  { value: 32, label: "Death Knight 死亡骑士" },
  { value: 64, label: "Shaman 萨满" },
  { value: 128, label: "Mage 法师" },
  { value: 256, label: "Warlock 术士" },
  { value: 1024, label: "Druid 德鲁伊" },
];

const RACE_FLAGS = [
  { value: 1, label: "Human 人类" },
  { value: 2, label: "Orc 兽人" },
  { value: 4, label: "Dwarf 矮人" },
  { value: 8, label: "Night Elf 暗夜精灵" },
  { value: 16, label: "Undead 亡灵" },
  { value: 32, label: "Tauren 牛头人" },
  { value: 64, label: "Gnome 侏儒" },
  { value: 128, label: "Troll 巨魔" },
  { value: 512, label: "Blood Elf 血精灵" },
  { value: 1024, label: "Draenei 德莱尼" },
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
  const [pickerTarget, setPickerTarget] = useState<"item" | "spell" | null>(
    null,
  );
  const [pickerSearch, setPickerSearch] = useState("");

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

  const {
    data: iconNames = [],
    isLoading: iconsLoading,
    isError: iconsError,
    error: iconsErrorObj,
    refetch: refetchIcons,
  } = useQuery({
    queryKey: ["icons"],
    queryFn: getAllIcons,
    enabled: !!resource,
  });

  const [form, setForm] = useState<FormState>(() => buildForm(resource));
  const [itemIcon, setItemIcon] = useState(resource?.official_db.icon_name || "");
  const [spellIcon, setSpellIcon] = useState(
    resource?.official_db.spell_icon_name || "",
  );
  const [itemDbc, setItemDbc] = useState<Record<string, unknown>>(
    resource?.dbc.item ?? {},
  );
  const [itemDb, setItemDb] = useState<Record<string, unknown>>(
    resource?.db.item_template ?? {},
  );
  const [spellDbc, setSpellDbc] = useState<Record<string, unknown>>(
    resource?.dbc.spell ?? {},
  );
  const [spellDb, setSpellDb] = useState<Record<string, unknown>>(
    resource?.db.creature_template ?? {},
  );

  useEffect(() => {
    if (!resource) return;
    setForm(buildForm(resource));
    setItemIcon(resource.official_db.icon_name || "");
    setSpellIcon(resource.official_db.spell_icon_name || "");
    setItemDbc(resource.dbc.item ?? {});
    setItemDb(resource.db.item_template ?? {});
    setSpellDbc(resource.dbc.spell ?? {});
    setSpellDb(resource.db.creature_template ?? {});
  }, [resource]);

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

  const liveDbc = useMemo(
    () => ({
      ...resource?.dbc,
      item: itemDbc,
      spell: spellDbc,
    }),
    [resource?.dbc, itemDbc, spellDbc],
  );
  const liveDb = useMemo(
    () => ({
      ...resource?.db,
      item_template: itemDb,
      creature_template: spellDb,
    }),
    [resource?.db, itemDb, spellDb],
  );

  const hasChanges = useMemo(() => {
    if (!resource) return false;
    const baseForm = buildForm(resource);
    if (JSON.stringify(form) !== JSON.stringify(baseForm)) return true;
    if (itemIcon !== (resource.official_db.icon_name || "")) return true;
    if (spellIcon !== (resource.official_db.spell_icon_name || "")) return true;
    if (JSON.stringify(itemDbc) !== JSON.stringify(resource.dbc.item ?? {}))
      return true;
    if (
      JSON.stringify(itemDb) !== JSON.stringify(resource.db.item_template ?? {})
    )
      return true;
    if (JSON.stringify(spellDbc) !== JSON.stringify(resource.dbc.spell ?? {}))
      return true;
    if (
      JSON.stringify(spellDb) !==
      JSON.stringify(resource.db.creature_template ?? {})
    )
      return true;
    return false;
  }, [
    form,
    resource,
    itemIcon,
    spellIcon,
    itemDbc,
    itemDb,
    spellDbc,
    spellDb,
  ]);

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

    if (form.name !== baseline.name) update.name = form.name || null;
    if (form.mount_type !== baseline.mount_type) {
      update.mount_type = form.mount_type || null;
    }
    if (form.star_rating !== baseline.star_rating) {
      update.star_rating = form.star_rating || null;
    }
    if (form.subtype !== baseline.subtype) update.subtype = form.subtype || null;
    if (form.rarity !== baseline.rarity) update.rarity = form.rarity || null;
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

    if (itemIcon !== (resource.official_db.icon_name || "")) {
      update.icon_name = itemIcon || null;
    }
    if (spellIcon !== (resource.official_db.spell_icon_name || "")) {
      update.spell_icon_name = spellIcon || null;
    }

    if (JSON.stringify(itemDbc) !== JSON.stringify(resource.dbc.item ?? {})) {
      update.dbc_item = itemDbc;
    }
    if (
      JSON.stringify(itemDb) !== JSON.stringify(resource.db.item_template ?? {})
    ) {
      update.db_item_template = itemDb;
    }
    if (JSON.stringify(spellDbc) !== JSON.stringify(resource.dbc.spell ?? {})) {
      update.dbc_spell = spellDbc;
    }
    if (
      JSON.stringify(spellDb) !==
      JSON.stringify(resource.db.creature_template ?? {})
    ) {
      update.db_creature_template = spellDb;
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
        <div className="detail-main space-y-5">
          <SectionCard title="基础信息">
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
          </SectionCard>

          <SectionCard title="物品信息">
            <div className="space-y-5">
              <IconEditor
                label="Item 图标"
                value={itemIcon}
                iconNames={iconNames}
                onChange={setItemIcon}
                onOpenPicker={() => setPickerTarget("item")}
              />

              <div className="border-t border-border pt-4">
                <h4 className="mb-3 text-sm font-medium text-text-primary">
                  Item DBC
                </h4>
                <div className="form-grid">
                  <FormGroup label="ID">
                    <NumberInput
                      value={itemDbc.id}
                      onChange={(v) =>
                        setItemDbc((prev) => ({ ...prev, id: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="Class">
                    <NumberInput
                      value={itemDbc.class}
                      onChange={(v) =>
                        setItemDbc((prev) => ({ ...prev, class: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="SubClass">
                    <NumberInput
                      value={itemDbc.subclass}
                      onChange={(v) =>
                        setItemDbc((prev) => ({ ...prev, subclass: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="Material">
                    <NumberInput
                      value={itemDbc.material}
                      onChange={(v) =>
                        setItemDbc((prev) => ({ ...prev, material: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="Display ID">
                    <NumberInput
                      value={itemDbc.display_id}
                      onChange={(v) =>
                        setItemDbc((prev) => ({ ...prev, display_id: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="Inventory Type">
                    <NumberInput
                      value={itemDbc.inventory_type}
                      onChange={(v) =>
                        setItemDbc((prev) => ({ ...prev, inventory_type: v }))
                      }
                    />
                  </FormGroup>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="mb-3 text-sm font-medium text-text-primary">
                  Item 数据库（item_template）
                </h4>
                <div className="form-grid">
                  <FormGroup label="entry">
                    <NumberInput
                      value={itemDb.entry}
                      onChange={(v) => setItemDb((prev) => ({ ...prev, entry: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="name">
                    <input
                      type="text"
                      className="form-input"
                      value={String(itemDb.name ?? "")}
                      onChange={(e) =>
                        setItemDb((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="displayid（物品图标ID）">
                    <NumberInput
                      value={itemDb.displayid}
                      onChange={(v) =>
                        setItemDb((prev) => ({ ...prev, displayid: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="Quality">
                    <select
                      className="form-select"
                      value={selectValue(itemDb.Quality) ?? ""}
                      onChange={(e) =>
                        setItemDb((prev) => ({
                          ...prev,
                          Quality: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                    >
                      <option value="">未设置</option>
                      {QUALITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </FormGroup>
                  <FormGroup label="AllowableClass" className="full-width">
                    <BitmaskCheckboxes
                      options={CLASS_FLAGS}
                      value={normalizeInt(itemDb.AllowableClass)}
                      onChange={(v) =>
                        setItemDb((prev) => ({ ...prev, AllowableClass: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="AllowableRace" className="full-width">
                    <BitmaskCheckboxes
                      options={RACE_FLAGS}
                      value={normalizeInt(itemDb.AllowableRace)}
                      onChange={(v) =>
                        setItemDb((prev) => ({ ...prev, AllowableRace: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="spellid_2">
                    <NumberInput
                      value={itemDb.spellid_2}
                      onChange={(v) =>
                        setItemDb((prev) => ({ ...prev, spellid_2: v }))
                      }
                    />
                  </FormGroup>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="技能信息">
            <div className="space-y-5">
              <IconEditor
                label="Spell 图标"
                value={spellIcon}
                iconNames={iconNames}
                onChange={setSpellIcon}
                onOpenPicker={() => setPickerTarget("spell")}
              />

              <div className="border-t border-border pt-4">
                <h4 className="mb-3 text-sm font-medium text-text-primary">
                  Spell DBC
                </h4>
                <div className="form-grid">
                  <FormGroup label="ID">
                    <NumberInput
                      value={spellDbc.id}
                      onChange={(v) =>
                        setSpellDbc((prev) => ({ ...prev, id: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="Name">
                    <input
                      type="text"
                      className="form-input"
                      value={String(spellDbc.name ?? "")}
                      onChange={(e) =>
                        setSpellDbc((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="Icon ID">
                    <NumberInput
                      value={spellDbc.icon_id}
                      onChange={(v) =>
                        setSpellDbc((prev) => ({ ...prev, icon_id: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="Visual ID">
                    <NumberInput
                      value={spellDbc.visual_id}
                      onChange={(v) =>
                        setSpellDbc((prev) => ({ ...prev, visual_id: v }))
                      }
                    />
                  </FormGroup>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="mb-3 text-sm font-medium text-text-primary">
                  Spell 数据库（creature_template）
                </h4>
                <div className="form-grid">
                  <FormGroup label="entry">
                    <NumberInput
                      value={spellDb.entry}
                      onChange={(v) =>
                        setSpellDb((prev) => ({ ...prev, entry: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="name">
                    <input
                      type="text"
                      className="form-input"
                      value={String(spellDb.name ?? "")}
                      onChange={(e) =>
                        setSpellDb((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="modelid1">
                    <NumberInput
                      value={spellDb.modelid1}
                      onChange={(v) =>
                        setSpellDb((prev) => ({ ...prev, modelid1: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="modelid2">
                    <NumberInput
                      value={spellDb.modelid2}
                      onChange={(v) =>
                        setSpellDb((prev) => ({ ...prev, modelid2: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="minlevel">
                    <NumberInput
                      value={spellDb.minlevel}
                      onChange={(v) =>
                        setSpellDb((prev) => ({ ...prev, minlevel: v }))
                      }
                    />
                  </FormGroup>
                  <FormGroup label="maxlevel">
                    <NumberInput
                      value={spellDb.maxlevel}
                      onChange={(v) =>
                        setSpellDb((prev) => ({ ...prev, maxlevel: v }))
                      }
                    />
                  </FormGroup>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="掉落信息">
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
                  onChange={(e) => updateField("drop_instance", e.target.value)}
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
          </SectionCard>

          <SectionCard title="明细数据">
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
              <FormGroup label="原始 JSON 数据" className="full-width">
                <textarea
                  className="form-textarea font-mono text-xs"
                  rows={12}
                  value={getTabData({ dbc: liveDbc, db: liveDb }, activeTab)}
                  readOnly
                />
                <p className="form-hint">上方区域修改时，本明细会同步更新</p>
              </FormGroup>
            </div>
          </SectionCard>
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
        </div>
      </div>

      {pickerTarget && (
        <IconPickerDialog
          title={pickerTarget === "item" ? "选择 Item 图标" : "选择 Spell 图标"}
          selectedValue={pickerTarget === "item" ? itemIcon : spellIcon}
          iconNames={iconNames}
          isLoading={iconsLoading}
          isError={iconsError}
          error={iconsErrorObj}
          search={pickerSearch}
          onSearch={setPickerSearch}
          onRefresh={refetchIcons}
          onSelect={(name) => {
            if (pickerTarget === "item") {
              setItemIcon(name);
            } else {
              setSpellIcon(name);
            }
            setPickerTarget(null);
            setPickerSearch("");
          }}
          onClose={() => {
            setPickerTarget(null);
            setPickerSearch("");
          }}
        />
      )}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">{title}</div>
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function IconEditor({
  label,
  value,
  iconNames,
  onChange,
  onOpenPicker,
}: {
  label: string;
  value: string;
  iconNames: string[];
  onChange: (value: string) => void;
  onOpenPicker: () => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onOpenPicker}
        className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-bg-surface transition-colors hover:border-primary hover:bg-bg-hover focus:outline-none focus:ring-2 focus:ring-primary"
        title="点击选择图标"
      >
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
      </button>
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
  );
}

function IconPickerDialog({
  title,
  selectedValue,
  iconNames,
  isLoading,
  isError,
  error,
  search,
  onSearch,
  onSelect,
  onClose,
  onRefresh,
}: {
  title: string;
  selectedValue: string;
  iconNames: string[];
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (name: string) => void;
  onClose: () => void;
  onRefresh?: () => void;
}) {
  const searchLower = search.trim().toLowerCase();
  const filtered = searchLower
    ? iconNames.filter((name) => name.toLowerCase().includes(searchLower))
    : iconNames;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          <div className="flex items-center gap-1">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-md p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
                title="刷新图标列表"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="border-b border-border p-4">
          <input
            type="text"
            autoFocus
            className="form-input w-full"
            placeholder="搜索图标名称..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          <p className="mt-2 text-xs text-text-secondary">
            共 {filtered.length} 个图标
          </p>
        </div>
        <div className="grid flex-1 grid-cols-6 gap-2 overflow-y-auto p-4 sm:grid-cols-8">
          {isLoading ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary">
              <RefreshCw className="mb-3 h-8 w-8 animate-spin" />
              <p className="text-sm">正在加载图标...</p>
            </div>
          ) : isError ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary">
              <Box className="mb-3 h-12 w-12" />
              <p className="text-sm">加载图标失败</p>
              <p className="mt-1 max-w-md px-4 text-center text-xs text-danger">
                {error?.message || "未知错误"}
              </p>
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="btn btn-primary mt-4 text-xs"
                >
                  重试
                </button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary">
              <Box className="mb-3 h-12 w-12" />
              <p className="text-sm">未找到图标</p>
              <p className="mt-1 text-xs">请检查 sources/icons 目录是否存在</p>
            </div>
          ) : (
            filtered.map((name) => {
              const isSelected = name === selectedValue;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelect(name)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border p-2 transition-colors hover:border-primary hover:bg-bg-hover",
                    isSelected
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border",
                  )}
                  title={name}
                >
                  <img
                    src={getIconPreviewUrl(name, 64)}
                    alt={name}
                    className="h-10 w-10 object-contain"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span className="block max-w-full truncate text-[10px] text-text-secondary">
                    {name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      type="number"
      className="form-input"
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange(null);
        } else {
          const n = Number(raw);
          onChange(Number.isNaN(n) ? null : n);
        }
      }}
    />
  );
}

function BitmaskCheckboxes({
  options,
  value,
  onChange,
}: {
  options: { value: number; label: string }[];
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const mask = value ?? 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-surface px-2 py-1 text-sm text-text-secondary"
          >
            <input
              type="checkbox"
              checked={(mask & opt.value) === opt.value}
              onChange={(e) => {
                const next = e.target.checked ? mask | opt.value : mask & ~opt.value;
                onChange(next === 0 ? null : next);
              }}
            />
            {opt.label}
          </label>
        ))}
      </div>
      <div className="text-xs text-text-tertiary">当前掩码：{value ?? "—"}</div>
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

function getTabData(
  data: { dbc: Record<string, unknown>; db: Record<string, unknown> },
  key: string,
): string {
  const value =
    (data.dbc as Record<string, unknown>)[key] ??
    (data.db as Record<string, unknown>)[key] ??
    {};
  return JSON.stringify(value, null, 2);
}

function normalizeInt(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  return Number.isNaN(n) ? null : n;
}

function normalizeFloat(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isNaN(n) ? null : n;
}

function selectValue(value: unknown): string | number | undefined {
  if (typeof value === "string" || typeof value === "number") return value;
  return undefined;
}
