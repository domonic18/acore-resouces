import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { NumberInput } from "@/components/form/NumberInput";
import { BitmaskCheckboxes } from "@/components/form/BitmaskCheckboxes";
import { IconEditor } from "./IconEditor";
import { QUALITY_OPTIONS, CLASS_FLAGS, RACE_FLAGS } from "../../constants";
import { selectValue, normalizeInt } from "../../lib/detail-helpers";

interface ItemInfoSectionProps {
  itemIcon: string;
  setItemIcon: (value: string) => void;
  setPickerTarget: (target: "item" | "spell") => void;
  iconNames: string[];
  itemDbc: Record<string, unknown>;
  setItemDbc: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  itemDb: Record<string, unknown>;
  setItemDb: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
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
}: ItemInfoSectionProps) {
  return (
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
                onChange={(v) => setItemDbc((prev) => ({ ...prev, id: v }))}
              />
            </FormGroup>
            <FormGroup label="Class">
              <NumberInput
                value={itemDbc.class}
                onChange={(v) => setItemDbc((prev) => ({ ...prev, class: v }))}
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
                onChange={(v) => setItemDb((prev) => ({ ...prev, entry: v }))}
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
                    Quality:
                      e.target.value === "" ? null : Number(e.target.value),
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
  );
}
