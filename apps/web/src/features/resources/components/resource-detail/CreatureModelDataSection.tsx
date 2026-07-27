import { useMemo } from "react";
import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { NumberInput } from "@/components/form/NumberInput";
import { cn } from "@/shared/utils";
import type { Resource, ResourceAssets, AssetFile } from "@/shared/types";

interface CreatureModelDataSectionProps {
  resource: Resource;
  creatureModelDataDbc: Record<string, unknown>;
  setCreatureModelDataDbc: React.Dispatch<
    React.SetStateAction<Record<string, unknown>>
  >;
  assets: ResourceAssets | undefined;
  compact?: boolean;
}

interface FieldDef {
  key: string;
  label: string;
  description: string;
  type: "readonly-int" | "int" | "float" | "model";
  step?: number;
}

const FIELDS: FieldDef[] = [
  {
    key: "id",
    label: "ID",
    description: "模型数据 ID，与 CreatureDisplayInfo.ModelID 关联，只读",
    type: "readonly-int",
  },
  {
    key: "flags",
    label: "Flags",
    description: "模型标志位",
    type: "int",
  },
  {
    key: "model_name",
    label: "ModelName",
    description: "M2 模型文件路径，用于客户端加载模型",
    type: "model",
  },
  {
    key: "model_scale",
    label: "ModelScale",
    description: "模型基础缩放",
    type: "float",
    step: 0.01,
  },
  {
    key: "collision_width",
    label: "CollisionWidth",
    description: "碰撞盒宽度",
    type: "float",
    step: 0.01,
  },
  {
    key: "collision_height",
    label: "CollisionHeight",
    description: "碰撞盒高度",
    type: "float",
    step: 0.01,
  },
  {
    key: "mount_height",
    label: "MountHeight",
    description: "骑乘高度",
    type: "float",
    step: 0.01,
  },
];

function assetPathToModelName(
  relativePath: string,
  modelFolder: string,
): string {
  const prefix = `sources/mounts/${modelFolder}/`;
  let normalized = relativePath;
  if (normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
    normalized = normalized.slice(prefix.length);
  }
  normalized = normalized.replace(/\//g, "\\").replace(/\.M2$/i, ".m2");
  return `creature\\${normalized}`;
}

function useM2Candidates(
  assets: ResourceAssets | undefined,
  modelFolder: string,
) {
  return useMemo(() => {
    if (!assets) return [];
    return assets.m2_files.map((file) => ({
      ...file,
      modelName: assetPathToModelName(file.relative_path, modelFolder),
    }));
  }, [assets, modelFolder]);
}

function ModelNameInput({
  value,
  candidates,
  onChange,
  compact,
}: {
  value: unknown;
  candidates: (AssetFile & { modelName: string })[];
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const current = value === null || value === undefined ? "" : String(value);

  const currentCandidate = useMemo(() => {
    const target = current.toLowerCase().replace(/\\/g, "/");
    return candidates.find(
      (c) => c.modelName.toLowerCase().replace(/\\/g, "/") === target,
    );
  }, [current, candidates]);

  return (
    <div className="space-y-2">
      <select
        className={cn(compact ? "form-select-compact" : "form-select")}
        value={currentCandidate?.relative_path || current}
        onChange={(e) => {
          const selected = candidates.find(
            (c) => c.relative_path === e.target.value,
          );
          onChange(selected?.modelName || e.target.value || "");
        }}
      >
        <option value="">未设置</option>
        {current && !currentCandidate && (
          <option value={current}>{current}（自定义）</option>
        )}
        {candidates.map((file) => (
          <option key={file.relative_path} value={file.relative_path}>
            {file.name} → {file.modelName}
          </option>
        ))}
      </select>
      {current && (
        <p className="text-[11px] text-text-tertiary">当前值：{current}</p>
      )}
    </div>
  );
}

export function CreatureModelDataSection({
  resource,
  creatureModelDataDbc,
  setCreatureModelDataDbc,
  assets,
  compact,
}: CreatureModelDataSectionProps) {
  const m2Candidates = useM2Candidates(assets, resource.model_folder);

  function getValue(key: string): unknown {
    if (key in creatureModelDataDbc) {
      return creatureModelDataDbc[key];
    }
    return resource.dbc.creature_model_data[key];
  }

  function setValue(key: string, value: unknown) {
    setCreatureModelDataDbc((prev) => ({ ...prev, [key]: value }));
  }

  function renderField(field: FieldDef) {
    const value = getValue(field.key);

    if (field.type === "readonly-int") {
      return (
        <input
          type="number"
          disabled
          className={cn(compact ? "form-input-compact" : "form-input")}
          value={value === null || value === undefined ? "" : String(value)}
        />
      );
    }

    if (field.type === "int") {
      return (
        <NumberInput
          value={value}
          onChange={(v) => setValue(field.key, v)}
          compact={compact}
        />
      );
    }

    if (field.type === "float") {
      return (
        <input
          type="number"
          step={field.step ?? 0.01}
          className={cn(compact ? "form-input-compact" : "form-input")}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              setValue(field.key, null);
            } else {
              const n = Number(raw);
              setValue(field.key, Number.isNaN(n) ? null : n);
            }
          }}
          onWheel={(e) => e.currentTarget.blur()}
        />
      );
    }

    return (
      <ModelNameInput
        value={value}
        candidates={m2Candidates}
        onChange={(v) => setValue(field.key, v || null)}
        compact={compact}
      />
    );
  }

  return (
    <SectionCard title="模型数据（CreatureModelData）" compact={compact}>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((field) => (
          <FormGroup
            key={field.key}
            label={`${field.label}`}
            compact={compact}
            className="group"
          >
            {renderField(field)}
            <p className="mt-1 text-[11px] text-text-tertiary">
              {field.description}
            </p>
          </FormGroup>
        ))}
      </div>
    </SectionCard>
  );
}
