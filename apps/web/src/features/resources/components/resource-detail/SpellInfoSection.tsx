import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { NumberInput } from "@/components/form/NumberInput";
import { IconEditor } from "./IconEditor";

interface SpellInfoSectionProps {
  spellIcon: string;
  setSpellIcon: (value: string) => void;
  setPickerTarget: (target: "item" | "spell") => void;
  iconNames: string[];
  spellDbc: Record<string, unknown>;
  setSpellDbc: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  spellDb: Record<string, unknown>;
  setSpellDb: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}

export function SpellInfoSection({
  spellIcon,
  setSpellIcon,
  setPickerTarget,
  iconNames,
  spellDbc,
  setSpellDbc,
  spellDb,
  setSpellDb,
}: SpellInfoSectionProps) {
  return (
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
                onChange={(v) => setSpellDbc((prev) => ({ ...prev, id: v }))}
              />
            </FormGroup>
            <FormGroup label="Name">
              <input
                type="text"
                className="form-input"
                value={String(spellDbc.name ?? "")}
                onChange={(e) =>
                  setSpellDbc((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
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
                onChange={(v) => setSpellDb((prev) => ({ ...prev, entry: v }))}
              />
            </FormGroup>
            <FormGroup label="name">
              <input
                type="text"
                className="form-input"
                value={String(spellDb.name ?? "")}
                onChange={(e) =>
                  setSpellDb((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
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
  );
}
