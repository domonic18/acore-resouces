import { cn } from "@/shared/utils";
import {
  computeResourceTags,
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
            : tag;
        return (
          <span
            key={tag}
            className={cn(
              "badge",
              tag === "unofficial" ? "badge-orange" : "badge-gray",
            )}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
