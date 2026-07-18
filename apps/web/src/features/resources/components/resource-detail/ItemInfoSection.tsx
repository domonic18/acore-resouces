import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { NumberInput } from "@/components/form/NumberInput";
import { cn } from "@/shared/utils";
import { BitmaskDropdown } from "@/components/form/BitmaskDropdown";
import { OptionSelect } from "@/components/form/OptionSelect";
import { IconEditor } from "./IconEditor";
import { ITEM_CLASS_OPTIONS, ITEM_SUBCLASS_OPTIONS, MATERIAL_OPTIONS, QUALITY_OPTIONS, CLASS_FLAGS, RACE_FLAGS, INVENTORY_TYPE_OPTIONS } from "../../constants";
import { normalizeInt } from "../../lib/detail-helpers";

interface ItemInfoSectionProps {
  itemIcon: string;
  setItemIcon: (value: string) => void;
  setPickerTarget: (target: "item" | "spell") => void;
  iconNames: string[];
  itemDbc: Record<string, unknown>;
  setItemDbc: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  itemDb: Record<string, unknown>;
  setItemDb: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  compact?: boolean;
}

export function ItemInfoSection({
  itemIcon,
  setItemIcon,
  setPickerTarget,
  iconNames,
  itemDbc,
  setItemDbc,
  itemDb,
  setItemDb,
  compact,
}: ItemInfoSectionProps) {
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
            <FormGroup label="DBC ID" compact={compact}>
              <NumberInput
                value={itemDbc.id}
                onChange={(v) => setItemDbc((prev) => ({ ...prev, id: v }))}
                compact={compact}
              />
            </FormGroup>
            <FormGroup label="DB entry" compact={compact}>
              <NumberInput
                value={itemDb.entry}
                onChange={(v) => setItemDb((prev) => ({ ...prev, entry: v }))}
                compact={compact}
              />
            </FormGroup>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-bg-surface/50 p-3">
            <h4 className="mb-2 text-xs font-semibold text-text-secondary">
              Item DBC
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <FormGroup label="Class" compact={compact}>
                <OptionSelect
                  options={ITEM_CLASS_OPTIONS}
                  value={itemDbc.class}
                  onChange={(v) => setItemDbc((prev) => ({ ...prev, class: v }))}
                  compact={compact}
                />
              </FormGroup>
              <FormGroup label="SubClass" compact={compact}>
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
              <FormGroup label="Material" compact={compact}>
                <OptionSelect
                  options={MATERIAL_OPTIONS}
                  value={itemDbc.material}
                  onChange={(v) =>
                    setItemDbc((prev) => ({ ...prev, material: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup label="Display ID" compact={compact}>
                <NumberInput
                  value={itemDbc.display_id}
                  onChange={(v) =>
                    setItemDbc((prev) => ({ ...prev, display_id: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup label="Inventory Type" compact={compact}>
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
              <FormGroup label="name" compact={compact}>
                <input
                  type="text"
                  className={cn(compact ? "form-input-compact" : "form-input")}
                  value={String(itemDb.name ?? "")}
                  onChange={(e) =>
                    setItemDb((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </FormGroup>
              <FormGroup label="displayid（物品图标ID）" compact={compact}>
                <NumberInput
                  value={itemDb.displayid}
                  onChange={(v) =>
                    setItemDb((prev) => ({ ...prev, displayid: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup label="Quality" compact={compact}>
                <OptionSelect
                  options={QUALITY_OPTIONS}
                  value={itemDb.Quality}
                  onChange={(v) =>
                    setItemDb((prev) => ({ ...prev, Quality: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup label="spellid_2" compact={compact}>
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
          <FormGroup label="AllowableClass" compact={compact}>
            <BitmaskDropdown
              options={CLASS_FLAGS}
              value={normalizeInt(itemDb.AllowableClass)}
              onChange={(v) =>
                setItemDb((prev) => ({ ...prev, AllowableClass: v }))
              }
            />
          </FormGroup>
          <FormGroup label="AllowableRace" compact={compact}>
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
