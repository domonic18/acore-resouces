import { cn } from "@/shared/utils";
import type { Resource } from "@/shared/types";

interface ResourceTypeBadgeProps {
  resource: Resource;
}

export function ResourceTypeBadge({ resource }: ResourceTypeBadgeProps) {
  const config: Record<string, { label: string; className: string }> = {
    mount: { label: resource.mount_type || "坐骑", className: "badge-blue" },
    pet: { label: "宠物", className: "badge-orange" },
    npc: { label: "NPC", className: "badge-green" },
  };
  const { label, className } = config[resource.resource_type] || {
    label: resource.resource_type,
    className: "badge-gray",
  };
  return (
    <span className={cn("badge", className)} title={label}>
      {label}
    </span>
  );
}
