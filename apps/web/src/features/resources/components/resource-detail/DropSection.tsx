import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { cn } from "@/shared/utils";
import type { FormState } from "../../hooks/useResourceForm";

interface DropSectionProps {
  form: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  compact?: boolean;
}

export function DropSection({ form, updateField, compact }: DropSectionProps) {
  return (
    <SectionCard title="掉落信息" compact={compact}>
      <div className={cn("form-grid", compact && "form-grid-compact")}>
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
  );
}
