import { useMemo } from "react";
import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { NumberInput } from "@/components/form/NumberInput";
import { TextureViewer } from "@/components/viewer/TextureViewer";
import { cn, uniqueFiles } from "@/shared/utils";
import type { Resource, ResourceAssets, AssetFile } from "@/shared/types";

interface CreatureDisplayInfoSectionProps {
  resource: Resource;
  creatureDisplayInfoDbc: Record<string, unknown>;
  setCreatureDisplayInfoDbc: React.Dispatch<
    React.SetStateAction<Record<string, unknown>>
  >;
  assets: ResourceAssets | undefined;
  compact?: boolean;
}

interface FieldDef {
  key: string;
  label: string;
  description: string;
  type: "readonly-int" | "int" | "float" | "string" | "texture";
  step?: number;
  min?: number;
  max?: number;
}

const FIELDS: FieldDef[] = [
  {
    key: "id",
    label: "ID",
    description: "显示信息 ID，与 creature_template.modelid1 关联，只读",
    type: "readonly-int",
  },
  {
    key: "model_id",
    label: "ModelID",
    description: "模型数据 ID，与 creature_model_data.id 关联，只读",
    type: "readonly-int",
  },
  {
    key: "sound_id",
    label: "SoundID",
    description: "基础声音 ID，控制坐骑移动/空闲等基础音效",
    type: "int",
  },
  {
    key: "extra_display_information_id",
    label: "ExtendedDisplayInfoID",
    description: "扩展显示信息 ID，引用额外的显示信息记录",
    type: "int",
  },
  {
    key: "scale",
    label: "CreatureModelScale",
    description: "模型缩放，1.0 为原始大小",
    type: "float",
    step: 0.01,
  },
  {
    key: "opacity",
    label: "CreatureModelAlpha",
    description: "模型透明度，0 为完全透明，255 为不透明",
    type: "int",
    min: 0,
    max: 255,
  },
  {
    key: "texture_variation_1",
    label: "TextureVariation_1",
    description: "贴图变体 1，主要身体贴图",
    type: "texture",
  },
  {
    key: "texture_variation_2",
    label: "TextureVariation_2",
    description: "贴图变体 2，第二贴图槽位",
    type: "texture",
  },
  {
    key: "texture_variation_3",
    label: "TextureVariation_3",
    description: "贴图变体 3，第三贴图槽位",
    type: "texture",
  },
  {
    key: "portrait_texture_name",
    label: "PortraitTextureName",
    description: "肖像贴图名，用于头像/肖像展示",
    type: "string",
  },
  {
    key: "size_class",
    label: "SizeClass",
    description: "体型等级，影响选中圈等",
    type: "int",
  },
  {
    key: "blood_id",
    label: "BloodID",
    description: "血液效果 ID，受击时的血液特效",
    type: "int",
  },
  {
    key: "npc_sound_id",
    label: "NPCSoundID",
    description: "NPC 声音 ID，交互/攻击等声音",
    type: "int",
  },
  {
    key: "particle_color_id",
    label: "ParticleColorID",
    description: "粒子颜色 ID，模型粒子颜色索引",
    type: "int",
  },
  {
    key: "creature_geoset_data",
    label: "CreatureGeosetData",
    description: "Geoset 数据，控制模型子部件显示",
    type: "int",
  },
  {
    key: "object_effect_package_id",
    label: "ObjectEffectPackageID",
    description: "对象特效包 ID，环境/光环类特效",
    type: "int",
  },
];

function useTextureCandidates(assets: ResourceAssets | undefined) {
  return useMemo(() => {
    if (!assets) return [];
    return uniqueFiles([
      ...assets.texture_files,
      ...(assets.matched_textures ?? []),
    ]).filter(
      (file) =>
        file.file_type === "blp" ||
        file.relative_path.toLowerCase().endsWith(".blp"),
    );
  }, [assets]);
}

function TextureVariationInput({
  value,
  candidates,
  onChange,
  compact,
}: {
  value: unknown;
  candidates: AssetFile[];
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const current = value === null || value === undefined ? "" : String(value);

  const selectedPath = useMemo(() => {
    if (!current) return null;
    const target = current
      .toLowerCase()
      .replace(/\\/g, "/")
      .replace(/\.blp$/, "");
    return (
      candidates.find((file) => {
        const base = file.name
          .toLowerCase()
          .replace(/\\/g, "/")
          .replace(/\.blp$/, "");
        return base === target;
      })?.relative_path ?? null
    );
  }, [current, candidates]);

  const currentInCandidates = candidates.some((file) => {
    const base = file.name
      .toLowerCase()
      .replace(/\\/g, "/")
      .replace(/\.blp$/, "");
    return (
      base ===
      current
        .toLowerCase()
        .replace(/\\/g, "/")
        .replace(/\.blp$/, "")
    );
  });

  return (
    <div className="flex items-center gap-2">
      <select
        className={cn(
          "flex-1",
          compact ? "form-select-compact" : "form-select",
        )}
        value={current}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">未设置</option>
        {current && !currentInCandidates && (
          <option value={current}>{current}（自定义）</option>
        )}
        {candidates.map((file) => {
          const base = file.name.replace(/\.blp$/i, "");
          return (
            <option key={file.relative_path} value={base}>
              {file.name}
            </option>
          );
        })}
      </select>
      {selectedPath && (
        <TextureViewer path={selectedPath} size={compact ? 40 : 56} />
      )}
    </div>
  );
}

export function CreatureDisplayInfoSection({
  resource,
  creatureDisplayInfoDbc,
  setCreatureDisplayInfoDbc,
  assets,
  compact,
}: CreatureDisplayInfoSectionProps) {
  const textureCandidates = useTextureCandidates(assets);

  function getValue(key: string): unknown {
    if (key in creatureDisplayInfoDbc) {
      return creatureDisplayInfoDbc[key];
    }
    return resource.dbc.creature_display_info[key];
  }

  function setValue(key: string, value: unknown) {
    setCreatureDisplayInfoDbc((prev) => ({ ...prev, [key]: value }));
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
          min={field.min}
          max={field.max}
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

    if (field.type === "texture") {
      return (
        <TextureVariationInput
          value={value}
          candidates={textureCandidates}
          onChange={(v) => setValue(field.key, v || null)}
          compact={compact}
        />
      );
    }

    return (
      <input
        type="text"
        className={cn(compact ? "form-input-compact" : "form-input")}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => setValue(field.key, e.target.value || null)}
        placeholder={field.description}
      />
    );
  }

  return (
    <SectionCard title="显示信息（CreatureDisplayInfo）" compact={compact}>
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
