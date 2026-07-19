import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { cn } from "@/shared/utils";
import { ExternalLink } from "lucide-react";
import type { Resource } from "@/shared/types";
import type { FormState } from "../../hooks/useResourceForm";

interface BasicInfoSectionProps {
  resource: Resource;
  form: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  isMount: boolean;
  compact?: boolean;
}

export function BasicInfoSection({
  resource,
  form,
  updateField,
  isMount,
  compact,
}: BasicInfoSectionProps) {
  const inputCls = cn(compact ? "form-input-compact" : "form-input");
  const selectCls = cn(compact ? "form-select-compact" : "form-select");

  return (
    <SectionCard title="基础信息" compact={compact}>
      <div className={cn("form-grid", compact && "form-grid-compact")}>
        <FormGroup label="资源 ID" compact={compact}>
          <input
            type="text"
            className={inputCls}
            value={resource.id}
            readOnly
          />
        </FormGroup>
        <FormGroup label="模型文件夹" compact={compact}>
          <input
            type="text"
            className={inputCls}
            value={resource.model_folder}
            readOnly
          />
        </FormGroup>
        <FormGroup label="官方名称" compact={compact}>
          <input
            type="text"
            className={inputCls}
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
          />
          {(resource.official_db.spell_wowhead_url ||
            resource.official_db.item_wowhead_url) && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {resource.official_db.spell_wowhead_url && (
                <a
                  href={resource.official_db.spell_wowhead_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover"
                >
                  <ExternalLink className="h-3 w-3" /> Wowhead 法术页
                </a>
              )}
              {resource.official_db.item_wowhead_url && (
                <a
                  href={resource.official_db.item_wowhead_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover"
                >
                  <ExternalLink className="h-3 w-3" /> Wowhead 物品页
                </a>
              )}
            </div>
          )}
        </FormGroup>
        {isMount && (
          <>
            <FormGroup label="坐骑类型" compact={compact}>
              <select
                className={selectCls}
                value={form.mount_type}
                onChange={(e) => updateField("mount_type", e.target.value)}
              >
                <option value="">未设置</option>
                <option>飞行坐骑</option>
                <option>陆地坐骑</option>
                <option>水域坐骑</option>
              </select>
            </FormGroup>
            <FormGroup label="星级" compact={compact}>
              <select
                className={selectCls}
                value={form.star_rating}
                onChange={(e) => updateField("star_rating", e.target.value)}
              >
                <option value="">未设置</option>
                <option>一星</option>
                <option>二星</option>
                <option>三星</option>
                <option>四星</option>
                <option>五星</option>
              </select>
            </FormGroup>
            <FormGroup label="子类型" compact={compact}>
              <input
                type="text"
                className={inputCls}
                value={form.subtype}
                onChange={(e) => updateField("subtype", e.target.value)}
              />
            </FormGroup>
          </>
        )}
        {!isMount && (
          <FormGroup label="稀有度" compact={compact}>
            <input
              type="text"
              className={inputCls}
              value={form.rarity}
              onChange={(e) => updateField("rarity", e.target.value)}
            />
          </FormGroup>
        )}
        <FormGroup label="状态" compact={compact}>
          <div className="flex h-[34px] items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={form.debug_passed}
                onChange={(e) => updateField("debug_passed", e.target.checked)}
              />{" "}
              调试通过
            </label>
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
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
  );
}
