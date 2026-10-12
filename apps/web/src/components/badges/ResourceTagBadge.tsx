import { cn } from "@/shared/utils";
import {
  computeResourceTags,
  getResourceTagLabel,
  getUnofficialLabel,
} from "@/features/resources/lib/resource-list";
import type { Resource } from "@/shared/types";

interface ResourceTagBadgeProps {
  resource: Resource;
}

export function ResourceTagBadge({ resource }: ResourceTagBadgeProps) {
  const tags = computeResourceTags(resource);
  if (tags.length === 0) return <span className="text-text-tertiary">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => {
        const label =
          tag === "unofficial"
            ? getUnofficialLabel(resource.resource_type)
            : getResourceTagLabel(tag);
        const colorClass =
          tag === "unofficial"
            ? "badge-orange"
            : tag === "no_official_data"
              ? "badge-danger"
              : "badge-gray";
        return (
          <span key={tag} className={cn("badge", colorClass)}>
            {label}
          </span>
        );
      })}
    </div>
  );
}
