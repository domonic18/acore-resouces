import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import type { Resource } from "@/shared/types";
import type { FormState } from "../../hooks/useResourceForm";

interface BasicInfoSectionProps {
  resource: Resource;
  form: FormState;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  isMount: boolean;
}

export function BasicInfoSection({
  resource,
  form,
  updateField,
  isMount,
}: BasicInfoSectionProps) {
  return (
    <SectionCard title="基础信息">
      <div className="form-grid">
        <FormGroup label="资源 ID">
          <input
            type="text"
            className="form-input"
            value={resource.id}
            readOnly
          />
          <p className="form-hint">由系统生成，不可修改</p>
        </FormGroup>
        <FormGroup label="模型文件夹">
          <input
            type="text"
            className="form-input"
            value={resource.model_folder}
            readOnly
          />
        </FormGroup>
        <FormGroup label="官方名称">
          <input
            type="text"
            className="form-input"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
          />
        </FormGroup>
        {isMount && (
          <>
            <FormGroup label="坐骑类型">
              <select
                className="form-select"
                value={form.mount_type}
                onChange={(e) => updateField("mount_type", e.target.value)}
              >
                <option value="">未设置</option>
                <option>飞行坐骑</option>
                <option>陆地坐骑</option>
                <option>水域坐骑</option>
              </select>
            </FormGroup>
            <FormGroup label="星级">
              <select
                className="form-select"
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
            <FormGroup label="子类型">
              <input
                type="text"
                className="form-input"
                value={form.subtype}
                onChange={(e) => updateField("subtype", e.target.value)}
              />
            </FormGroup>
          </>
        )}
        {!isMount && (
          <FormGroup label="稀有度">
            <input
              type="text"
              className="form-input"
              value={form.rarity}
              onChange={(e) => updateField("rarity", e.target.value)}
            />
          </FormGroup>
        )}
        <FormGroup label="状态" className="full-width">
          <div className="flex gap-5">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={form.debug_passed}
                onChange={(e) => updateField("debug_passed", e.target.checked)}
              />{" "}
              调试通过
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
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
