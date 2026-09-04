import { useMemo, useState } from "react";
import { AlertTriangle, Image as ImageIcon, Search } from "lucide-react";
import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { NumberInput } from "@/components/form/NumberInput";
import { FieldHint } from "@/components/form/FieldHint";
import { useFieldReference } from "@/features/resources/hooks/useFieldReference";
import { useLinkedFieldValue } from "../../hooks/useLinkedFieldValue";
import { useItemDisplayInfo } from "../../hooks/useItemDisplayInfo";
import { getIconPreviewUrl } from "@/shared/resources";
import { cn } from "@/shared/utils";
import { BitmaskDropdown } from "@/components/form/BitmaskDropdown";
import { OptionSelect } from "@/components/form/OptionSelect";
import { IconEditor } from "./IconEditor";
import { LinkedIdField } from "./LinkedIdField";
import { IdOriginBadge } from "./IdOriginBadge";
import type { Resource } from "@/shared/types";
import {
  ITEM_CLASS_OPTIONS,
  ITEM_SUBCLASS_OPTIONS,
  MATERIAL_OPTIONS,
  QUALITY_OPTIONS,
  CLASS_FLAGS,
  RACE_FLAGS,
  INVENTORY_TYPE_OPTIONS,
} from "../../constants";
import { normalizeInt } from "../../lib/detail-helpers";

interface ItemInfoSectionProps {
  itemIcon: string;
  setItemIcon: (value: string) => void;
  itemWowheadUrl: string;
  setItemWowheadUrl: (value: string) => void;
  setPickerTarget: (target: "item" | "spell") => void;
  iconNames: string[];
  itemDbc: Record<string, unknown>;
  setItemDbc: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  itemDb: Record<string, unknown>;
  setItemDb: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  resourceType: Resource["resource_type"];
  /** 实时法术 ID（跟随编辑中的 dbc.spell.id），用于 spellid_2 自动跟随 */
  linkedSpellId: number | null;
  onNavigateToLinkedSection?: () => void;
  onOpenDisplayPicker: () => void;
  compact?: boolean;
}

export function ItemInfoSection({
  itemIcon,
  setItemIcon,
  itemWowheadUrl,
  setItemWowheadUrl,
  setPickerTarget,
  iconNames,
  itemDbc,
  setItemDbc,
  itemDb,
  setItemDb,
  resourceType,
  linkedSpellId,
  onNavigateToLinkedSection,
  onOpenDisplayPicker,
  compact,
}: ItemInfoSectionProps) {
  const getReference = useFieldReference(resourceType);

  const [spellIdLocked, setSpellIdLocked] = useState(true);
  const [displayIdLocked, setDisplayIdLocked] = useState(true);

  useLinkedFieldValue(spellIdLocked, linkedSpellId, "spellid_2", setItemDb);

  const liveDisplayId = useMemo(() => {
    const n = Number(itemDbc.display_id);
    return itemDbc.display_id !== null &&
      itemDbc.display_id !== undefined &&
      itemDbc.display_id !== "" &&
      !Number.isNaN(n)
      ? n
      : null;
  }, [itemDbc.display_id]);

  useLinkedFieldValue(
    displayIdLocked,
    liveDisplayId !== null && liveDisplayId > 0 ? liveDisplayId : null,
    "displayid",
    setItemDb,
  );

  const { data: displayInfo } = useItemDisplayInfo(liveDisplayId);
  const displayIconName = displayInfo?.icon_name ?? null;
  const iconMismatch =
    displayIconName !== null &&
    itemIcon.trim() !== "" &&
    displayIconName.toLowerCase() !== itemIcon.trim().toLowerCase();

  return (
    <SectionCard title="物品信息" compact={compact}>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <IconEditor
            label="Item 图标"
            value={itemIcon}
            iconNames={iconNames}
            onChange={setItemIcon}
            onOpenPicker={() => setPickerTarget("item")}
            compact
          />
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <FormGroup
              label={
                <>
                  DBC ID <IdOriginBadge value={itemDbc.id} segment="item" />
                </>
              }
              compact={compact}
              hint={
                <FieldHint description="物品 entry（item_template.entry）。官方坐骑用官方物品 ID，自定义坐骑走自定义段位" />
              }
            >
              <NumberInput
                value={itemDbc.id}
                onChange={(v) => setItemDbc((prev) => ({ ...prev, id: v }))}
                compact={compact}
              />
            </FormGroup>
            <FormGroup
              label={
                <>
                  DB entry <IdOriginBadge value={itemDb.entry} segment="item" />
                </>
              }
              compact={compact}
              hint={
                <FieldHint description="数据库侧引用的物品 entry，一般与 DBC ID 保持一致" />
              }
            >
              <NumberInput
                value={itemDb.entry}
                onChange={(v) => setItemDb((prev) => ({ ...prev, entry: v }))}
                compact={compact}
              />
            </FormGroup>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-bg-surface"
            title="物品图标预览（跟随上方 Item 图标）"
          >
            {itemIcon ? (
              <img
                src={getIconPreviewUrl(itemIcon, 96)}
                alt={itemIcon}
                className="h-8 w-8 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-text-tertiary" />
            )}
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <FormGroup
              label="DBC Display ID"
              compact={compact}
              hint={
                <FieldHint
                  description="物品外观显示 ID，对应 ItemDisplayInfo.dbc 记录（决定游戏内图标）；点「选择」可按图标可视化挑选，清空为 0（未设置）"
                  reference={getReference("dbc.item.display_id")}
                />
              }
            >
              <div className="flex items-center gap-1.5">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-bg-surface"
                  title={
                    displayIconName
                      ? `该显示 ID 的图标：${displayIconName}`
                      : "未设置或未收录（灰色为无图标）"
                  }
                >
                  {displayIconName ? (
                    <img
                      src={getIconPreviewUrl(displayIconName, 64)}
                      alt={displayIconName}
                      className="h-6 w-6 object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-text-tertiary" />
                  )}
                </div>
                {iconMismatch && (
                  <span
                    className="shrink-0"
                    title={`显示 ID 的图标（${displayIconName}）与 Item 图标（${itemIcon}）不一致，请核对`}
                  >
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <NumberInput
                    value={itemDbc.display_id}
                    onChange={(v) =>
                      setItemDbc((prev) => ({ ...prev, display_id: v }))
                    }
                    compact={compact}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm shrink-0 px-2 text-xs"
                  onClick={onOpenDisplayPicker}
                  title="从 ItemDisplayInfo.dbc 按图标选择显示 ID"
                >
                  <Search className="h-3.5 w-3.5" />
                  选择
                </button>
              </div>
            </FormGroup>
            <FormGroup
              label="DB displayid"
              compact={compact}
              hint={
                <FieldHint description="数据库侧物品外观显示 ID（item_template.displayid），默认锁定跟随 DBC Display ID，解锁后可手动覆盖" />
              }
            >
              <LinkedIdField
                value={
                  displayIdLocked
                    ? liveDisplayId
                    : itemDb.displayid
                }
                linkedLabel="显示 ID → dbc.item.display_id"
                locked={displayIdLocked}
                onToggleLock={() =>
                  setDisplayIdLocked((prev) => !prev)
                }
                onChange={(v) =>
                  setItemDb((prev) => ({ ...prev, displayid: v }))
                }
                compact={compact}
              />
            </FormGroup>
          </div>
        </div>

        <FormGroup
          label="Wowhead 物品页 URL"
          compact={compact}
          hint={
            <FieldHint description="官方物品页链接（wowhead.com/item=ID），用于数据核对与官方信息补全" />
          }
        >
          <input
            type="text"
            className={cn(compact ? "form-input-compact" : "form-input")}
            value={itemWowheadUrl}
            onChange={(e) => setItemWowheadUrl(e.target.value)}
            placeholder="https://www.wowhead.com/item=..."
          />
        </FormGroup>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-bg-surface/50 p-3">
            <h4 className="mb-2 text-xs font-semibold text-text-secondary">
              Item DBC
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <FormGroup
                label="Class"
                compact={compact}
                hint={
                  <FieldHint
                    description="物品大类，坐骑固定为 15（杂项 Miscellaneous）"
                    reference={getReference("dbc.item.class")}
                    onApply={() =>
                      setItemDbc((prev) => ({ ...prev, class: 15 }))
                    }
                  />
                }
              >
                <OptionSelect
                  options={ITEM_CLASS_OPTIONS}
                  value={itemDbc.class}
                  onChange={(v) =>
                    setItemDbc((prev) => ({ ...prev, class: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup
                label="SubClass"
                compact={compact}
                hint={
                  <FieldHint
                    description="物品子类，坐骑为 5（Mount），需与 Class 联动选择"
                    reference={getReference("dbc.item.subclass")}
                    onApply={() =>
                      setItemDbc((prev) => ({ ...prev, subclass: 5 }))
                    }
                  />
                }
              >
                <OptionSelect
                  options={
                    ITEM_SUBCLASS_OPTIONS[normalizeInt(itemDbc.class) ?? -1] ??
                    []
                  }
                  value={itemDbc.subclass}
                  onChange={(v) =>
                    setItemDbc((prev) => ({ ...prev, subclass: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup
                label="Material"
                compact={compact}
                hint={
                  <FieldHint
                    description="物品材质分类标记，坐骑默认 4，无需修改"
                    reference={getReference("dbc.item.material")}
                    onApply={() =>
                      setItemDbc((prev) => ({ ...prev, material: 4 }))
                    }
                  />
                }
              >
                <OptionSelect
                  options={MATERIAL_OPTIONS}
                  value={itemDbc.material}
                  onChange={(v) =>
                    setItemDbc((prev) => ({ ...prev, material: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup
                label="Inventory Type"
                compact={compact}
                hint={
                  <FieldHint
                    description="装备槽位类型，坐骑非装备物品固定为 0（Non-equippable）"
                    reference={getReference("dbc.item.inventory_type")}
                    onApply={() =>
                      setItemDbc((prev) => ({ ...prev, inventory_type: 0 }))
                    }
                  />
                }
              >
                <OptionSelect
                  options={INVENTORY_TYPE_OPTIONS}
                  value={itemDbc.inventory_type}
                  onChange={(v) =>
                    setItemDbc((prev) => ({ ...prev, inventory_type: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
            </div>
          </div>

          <div className="rounded-md border border-border bg-bg-surface/50 p-3">
            <h4 className="mb-2 text-xs font-semibold text-text-secondary">
              Item 数据库（item_template）
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <FormGroup
                label="name"
                compact={compact}
                hint={
                  <FieldHint description="数据库侧物品名称，建议与官方译名一致" />
                }
              >
                <input
                  type="text"
                  className={cn(compact ? "form-input-compact" : "form-input")}
                  value={String(itemDb.name ?? "")}
                  onChange={(e) =>
                    setItemDb((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </FormGroup>
              <FormGroup
                label="Quality"
                compact={compact}
                hint={
                  <FieldHint description="品质等级：0 普通 1 优秀 2 精良 3 稀有 4 史诗 5 传说" />
                }
              >
                <OptionSelect
                  options={QUALITY_OPTIONS}
                  value={itemDb.Quality}
                  onChange={(v) =>
                    setItemDb((prev) => ({ ...prev, Quality: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup
                label={
                  <>
                    spellid_2{" "}
                    <IdOriginBadge value={linkedSpellId} segment="spell" />
                  </>
                }
                compact={compact}
                hint={
                  <FieldHint description="右键使用物品时触发的法术 ID，默认自动跟随技能信息中的法术 ID（DBC ID），解锁后可手动覆盖" />
                }
              >
                <LinkedIdField
                  value={spellIdLocked ? linkedSpellId : itemDb.spellid_2}
                  linkedLabel="技能 ID → dbc.spell.id"
                  locked={spellIdLocked}
                  onToggleLock={() => setSpellIdLocked((prev) => !prev)}
                  onNavigate={onNavigateToLinkedSection}
                  onChange={(v) =>
                    setItemDb((prev) => ({ ...prev, spellid_2: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <FormGroup
            label="AllowableClass"
            compact={compact}
            hint={
              <FieldHint description="可使用职业位掩码，-1 表示不限制（全职业）" />
            }
          >
            <BitmaskDropdown
              options={CLASS_FLAGS}
              value={normalizeInt(itemDb.AllowableClass)}
              onChange={(v) =>
                setItemDb((prev) => ({ ...prev, AllowableClass: v }))
              }
            />
          </FormGroup>
          <FormGroup
            label="AllowableRace"
            compact={compact}
            hint={
              <FieldHint description="可使用种族位掩码，2047 表示全部种族可用" />
            }
          >
            <BitmaskDropdown
              options={RACE_FLAGS}
              value={normalizeInt(itemDb.AllowableRace)}
              onChange={(v) =>
                setItemDb((prev) => ({ ...prev, AllowableRace: v }))
              }
            />
          </FormGroup>
        </div>
      </div>
    </SectionCard>
  );
}
