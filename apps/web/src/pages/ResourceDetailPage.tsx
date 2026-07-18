import { useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useResourceDetail } from "@/features/resources/hooks/useResourceDetail";
import { useResourceAssets } from "@/features/resources/hooks/useResourceAssets";
import { useResourceIcons } from "@/features/resources/hooks/useResourceIcons";
import { useResourceForm } from "@/features/resources/hooks/useResourceForm";
import { useResourceUpdate } from "@/features/resources/hooks/useResourceUpdate";
import { BasicInfoSection } from "@/features/resources/components/resource-detail/BasicInfoSection";
import { ItemInfoSection } from "@/features/resources/components/resource-detail/ItemInfoSection";
import { SpellInfoSection } from "@/features/resources/components/resource-detail/SpellInfoSection";
import { DropSection } from "@/features/resources/components/resource-detail/DropSection";
import { RawDataSection } from "@/features/resources/components/resource-detail/RawDataSection";
import { RelationshipCheckSection } from "@/features/resources/components/resource-detail/RelationshipCheckSection";
import { ResourceDetailSidebar } from "@/features/resources/components/resource-detail/ResourceDetailSidebar";
import { IconPickerDialog } from "@/features/resources/components/resource-detail/IconPickerDialog";
import { uniqueFiles } from "@/shared/utils";
import type { AssetFile } from "@/shared/types";

const DETAIL_NAV_ITEMS = [
  { id: "section-basic", label: "基础信息" },
  { id: "section-relationships", label: "关联校验" },
  { id: "section-item", label: "物品信息" },
  { id: "section-spell", label: "技能信息" },
  { id: "section-drop", label: "掉落信息" },
  { id: "section-rawdata", label: "明细数据" },
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export function ResourceDetailPage() {
  const { resourceType = "mount", id } = useParams<{
    resourceType: string;
    id: string;
  }>();
  const resourceId = parseInt(id || "0", 10);
  const location = useLocation();
  const listLocation = location.state?.from as
    { pathname: string; search: string } | undefined;
  const backTo = listLocation
    ? { pathname: listLocation.pathname, search: listLocation.search }
    : "/resources";
  const backState = { restoreScroll: true };

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
  } = useResourceDetail(resourceType, resourceId);

  const { data: assets } = useResourceAssets(
    resourceType,
    resourceId,
    !!resource,
  );

  const {
    data: iconNames = [],
    isLoading: iconsLoading,
    isError: iconsError,
    error: iconsErrorObj,
    refetch: refetchIcons,
  } = useResourceIcons(!!resource);

  const formState = useResourceForm(resource);
  const { updateMutation, handleSave } = useResourceUpdate(
    resourceType,
    resourceId,
  );

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
          <Link
            to={backTo}
            state={backState}
            className="btn btn-sm btn-ghost mb-4"
          >
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
    ? uniqueFiles([
        ...assets.m2_files,
        ...assets.texture_files,
        ...assets.image_files,
        ...assets.icon_files,
      ])
    : [];

  const isMount = resource.resource_type === "mount";

  return (
    <div className="content">
      <header className="topbar">
        <div className="flex items-center gap-3">
          <Link to={backTo} state={backState} className="btn btn-sm btn-ghost">
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
            disabled={!formState.hasChanges || updateMutation.isPending}
            onClick={() => handleSave(resource, formState)}
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
        <nav className="detail-nav">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            页面导航
          </p>
          <div className="space-y-0.5">
            {DETAIL_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="detail-nav-item"
                onClick={() => scrollToSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="detail-main space-y-4">
          <div id="section-basic" className="scroll-mt-20">
            <BasicInfoSection
              resource={resource}
              form={formState.form}
              updateField={formState.updateField}
              isMount={isMount}
              compact
            />
          </div>

          <div id="section-relationships" className="scroll-mt-20">
            <RelationshipCheckSection
              liveDbc={formState.liveDbc}
              liveDb={formState.liveDb}
              compact
              onSelectTab={setActiveTab}
            />
          </div>

          <div id="section-item" className="scroll-mt-20">
            <ItemInfoSection
              itemIcon={formState.itemIcon}
              setItemIcon={formState.setItemIcon}
              setPickerTarget={setPickerTarget}
              iconNames={iconNames}
              itemDbc={formState.itemDbc}
              setItemDbc={formState.setItemDbc}
              itemDb={formState.itemDb}
              setItemDb={formState.setItemDb}
              compact
            />
          </div>

          <div id="section-spell" className="scroll-mt-20">
            <SpellInfoSection
              spellIcon={formState.spellIcon}
              setSpellIcon={formState.setSpellIcon}
              setPickerTarget={setPickerTarget}
              iconNames={iconNames}
              spellDbc={formState.spellDbc}
              setSpellDbc={formState.setSpellDbc}
              spellDb={formState.spellDb}
              setSpellDb={formState.setSpellDb}
              compact
            />
          </div>

          <div id="section-drop" className="scroll-mt-20">
            <DropSection
              form={formState.form}
              updateField={formState.updateField}
              compact
            />
          </div>

          <div id="section-rawdata" className="scroll-mt-20">
            <RawDataSection
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              liveDbc={formState.liveDbc}
              liveDb={formState.liveDb}
              compact
            />
          </div>
        </div>

        <ResourceDetailSidebar
          resourceType={resourceType}
          resourceId={resourceId}
          assets={assets}
          selectedImage={selectedImage}
          onSelectImage={setSelectedImage}
          allFiles={allFiles}
        />
      </div>

      {pickerTarget && (
        <IconPickerDialog
          title={pickerTarget === "item" ? "选择 Item 图标" : "选择 Spell 图标"}
          selectedValue={
            pickerTarget === "item" ? formState.itemIcon : formState.spellIcon
          }
          iconNames={iconNames}
          isLoading={iconsLoading}
          isError={iconsError}
          error={iconsErrorObj}
          search={pickerSearch}
          onSearch={setPickerSearch}
          onRefresh={refetchIcons}
          onSelect={(name) => {
            if (pickerTarget === "item") {
              formState.setItemIcon(name);
            } else {
              formState.setSpellIcon(name);
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
