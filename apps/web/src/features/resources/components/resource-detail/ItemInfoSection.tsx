import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { NumberInput } from "@/components/form/NumberInput";
import { FieldHint } from "@/components/form/FieldHint";
import { useFieldReference } from "@/features/resources/hooks/useFieldReference";
import { cn } from "@/shared/utils";
import { BitmaskDropdown } from "@/components/form/BitmaskDropdown";
import { OptionSelect } from "@/components/form/OptionSelect";
import { IconEditor } from "./IconEditor";
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
  compact,
}: ItemInfoSectionProps) {
  const getReference = useFieldReference(resourceType);

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
              label="DBC ID"
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
              label="DB entry"
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
                label="Display ID"
                compact={compact}
                hint={
                  <FieldHint
                    description="物品外观显示 ID（ItemDisplayInfo），坐骑物品一般为 0"
                    reference={getReference("dbc.item.display_id")}
                  />
                }
              >
                <NumberInput
                  value={itemDbc.display_id}
                  onChange={(v) =>
                    setItemDbc((prev) => ({ ...prev, display_id: v }))
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
                label="displayid（物品图标ID）"
                compact={compact}
                hint={
                  <FieldHint description="数据库侧物品外观显示 ID，与 DBC display_id 对应；坐骑物品多为 0" />
                }
              >
                <NumberInput
                  value={itemDb.displayid}
                  onChange={(v) =>
                    setItemDb((prev) => ({ ...prev, displayid: v }))
                  }
                  compact={compact}
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
                label="spellid_2"
                compact={compact}
                hint={
                  <FieldHint description="右键使用物品时触发的法术 ID，指向坐骑学习法术（80000+资源ID 段）" />
                }
              >
                <NumberInput
                  value={itemDb.spellid_2}
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
