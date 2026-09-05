import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { FieldHint } from "@/components/form/FieldHint";
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
        <FormGroup
          label="掉落 entry"
          hint={
            <FieldHint description="掉落源的 creature 或 gameobject entry，留空/0 表示该坐骑不可通过掉落获取" />
          }
        >
          <input
            type="number"
            className="form-input"
            value={form.drop_entry}
            onChange={(e) => updateField("drop_entry", e.target.value)}
          />
        </FormGroup>
        <FormGroup
          label="副本"
          hint={<FieldHint description="掉落所在副本或区域名称，便于检索筛选" />}
        >
          <input
            type="text"
            className="form-input"
            value={form.drop_instance}
            onChange={(e) => updateField("drop_instance", e.target.value)}
          />
        </FormGroup>
        <FormGroup
          label="Boss 名称"
          hint={<FieldHint description="掉落该坐骑的 Boss 名称" />}
        >
          <input
            type="text"
            className="form-input"
            value={form.drop_boss}
            onChange={(e) => updateField("drop_boss", e.target.value)}
          />
        </FormGroup>
        <FormGroup
          label="掉率"
          hint={
            <FieldHint description="掉落概率，范围 0~1（如 0.0001 表示万分之一），导出时写入 loot 表 Chance 字段" />
          }
        >
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
