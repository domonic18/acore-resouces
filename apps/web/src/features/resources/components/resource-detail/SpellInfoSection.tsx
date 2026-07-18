import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { NumberInput } from "@/components/form/NumberInput";
import { cn } from "@/shared/utils";
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
  compact?: boolean;
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
  compact,
}: SpellInfoSectionProps) {
  return (
    <SectionCard title="技能信息" compact={compact}>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <IconEditor
            label="Spell 图标"
            value={spellIcon}
            iconNames={iconNames}
            onChange={setSpellIcon}
            onOpenPicker={() => setPickerTarget("spell")}
            compact
          />
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <FormGroup label="DBC ID" compact={compact}>
              <NumberInput
                value={spellDbc.id}
                onChange={(v) => setSpellDbc((prev) => ({ ...prev, id: v }))}
                compact={compact}
              />
            </FormGroup>
            <FormGroup label="DB entry" compact={compact}>
              <NumberInput
                value={spellDb.entry}
                onChange={(v) => setSpellDb((prev) => ({ ...prev, entry: v }))}
                compact={compact}
              />
            </FormGroup>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-border bg-bg-surface/50 p-3">
            <h4 className="mb-2 text-xs font-semibold text-text-secondary">
              Spell DBC
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <FormGroup label="Name" compact={compact}>
                <input
                  type="text"
                  className={cn(compact ? "form-input-compact" : "form-input")}
                  value={String(spellDbc.name ?? "")}
                  onChange={(e) =>
                    setSpellDbc((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                />
              </FormGroup>
              <FormGroup label="Icon ID" compact={compact}>
                <NumberInput
                  value={spellDbc.icon_id}
                  onChange={(v) =>
                    setSpellDbc((prev) => ({ ...prev, icon_id: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup label="Visual ID" compact={compact}>
                <NumberInput
                  value={spellDbc.visual_id}
                  onChange={(v) =>
                    setSpellDbc((prev) => ({ ...prev, visual_id: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
            </div>
          </div>

          <div className="rounded-md border border-border bg-bg-surface/50 p-3">
            <h4 className="mb-2 text-xs font-semibold text-text-secondary">
              Spell 数据库（creature_template）
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <FormGroup label="name" compact={compact}>
                <input
                  type="text"
                  className={cn(compact ? "form-input-compact" : "form-input")}
                  value={String(spellDb.name ?? "")}
                  onChange={(e) =>
                    setSpellDb((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                />
              </FormGroup>
              <FormGroup label="modelid1" compact={compact}>
                <NumberInput
                  value={spellDb.modelid1}
                  onChange={(v) =>
                    setSpellDb((prev) => ({ ...prev, modelid1: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup label="modelid2" compact={compact}>
                <NumberInput
                  value={spellDb.modelid2}
                  onChange={(v) =>
                    setSpellDb((prev) => ({ ...prev, modelid2: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup label="minlevel" compact={compact}>
                <NumberInput
                  value={spellDb.minlevel}
                  onChange={(v) =>
                    setSpellDb((prev) => ({ ...prev, minlevel: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
              <FormGroup label="maxlevel" compact={compact}>
                <NumberInput
                  value={spellDb.maxlevel}
                  onChange={(v) =>
                    setSpellDb((prev) => ({ ...prev, maxlevel: v }))
                  }
                  compact={compact}
                />
              </FormGroup>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
