import { ResourceThumb } from "@/components/ResourceThumb";
import { ResourceStatusBadge } from "@/components/badges/ResourceStatusBadge";
import { SpecialFeatureBadge } from "@/components/badges/SpecialFeatureBadge";
import type { Resource } from "@/shared/types";

interface MountSelectRowProps {
  resource: Resource;
  selected: boolean;
  onToggle: (id: number) => void;
}

/** 向导坐骑多选的网格单元格：缩略图 + 名称 + 状态/星级/载具/特殊功能徽标 */
export function MountSelectRow({
  resource,
  selected,
  onToggle,
}: MountSelectRowProps) {
  const label = resource.name || resource.model_folder;
  const features = resource.special_features ?? [];
  const visibleFeatures = features.slice(0, 2);
  const restFeatures = features.length - visibleFeatures.length;

  return (
    <label className="flex cursor-pointer items-center gap-2 bg-bg-surface px-3 py-2 text-sm hover:bg-bg-hover">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(resource.id)}
        className="h-4 w-4 shrink-0 accent-blue-500"
      />
      <span className="shrink-0 font-mono text-xs text-text-tertiary">
        #{String(resource.id).padStart(4, "0")}
      </span>
      <ResourceThumb resource={resource} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate" title={label}>
          {label}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1">
          <ResourceStatusBadge resource={resource} />
          {resource.star_rating && (
            <span
              className="shrink-0 text-xs text-text-tertiary"
              title="星级/稀有度"
            >
              {resource.star_rating}
            </span>
          )}
          {resource.vehicle && (
            <span
              className="badge badge-blue shrink-0"
              title="已配置载具：导出时将生成 Vehicle.dbc / npc_spellclick_spells 产物"
            >
              载具
            </span>
          )}
          {visibleFeatures.map((f) => (
            <SpecialFeatureBadge key={f} feature={f} />
          ))}
          {restFeatures > 0 && (
            <span className="badge badge-gray" title={features.slice(2).join("、")}>
              +{restFeatures}
            </span>
          )}
          <span className="shrink-0 text-xs text-text-tertiary">
            {resource.mount_type || ""}
          </span>
        </span>
      </span>
    </label>
  );
}
