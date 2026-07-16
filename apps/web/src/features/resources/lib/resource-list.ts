import type { Resource } from "@/shared/types";

export const TYPES: { key: "all" | "mount" | "pet" | "npc"; label: string }[] =
  [
    { key: "all", label: "全部" },
    { key: "mount", label: "坐骑" },
    { key: "pet", label: "宠物" },
    { key: "npc", label: "NPC" },
  ];

export const STATUS_OPTIONS = [
  { value: "", label: "所有状态" },
  { value: "passed", label: "调试通过" },
  { value: "pending", label: "待调试" },
  { value: "added", label: "已添加" },
  { value: "not_added", label: "未添加" },
];

export type SortKey =
  | "id"
  | "resource"
  | "resource_type"
  | "tier"
  | "drop"
  | "created_at"
  | "updated_at";
export type SortOrder = "asc" | "desc";

export const DEFAULT_SORT: SortKey = "updated_at";
export const DEFAULT_ORDER: SortOrder = "desc";

export function formatDrop(drop: Resource["drop"]): string {
  const parts: string[] = [];
  if (drop.instance) parts.push(drop.instance);
  if (drop.boss) parts.push(drop.boss);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function sortResources(
  items: Resource[],
  key: SortKey,
  order: SortOrder,
): Resource[] {
  const sorted = [...items].sort((a, b) => {
    let comparison = 0;
    switch (key) {
      case "id":
        comparison = a.id - b.id;
        break;
      case "resource":
        comparison = (a.name || a.model_folder).localeCompare(
          b.name || b.model_folder,
        );
        break;
      case "resource_type":
        comparison = a.resource_type.localeCompare(b.resource_type);
        break;
      case "tier":
        comparison = (a.star_rating || a.rarity || "").localeCompare(
          b.star_rating || b.rarity || "",
        );
        break;
      case "drop":
        comparison = formatDrop(a.drop).localeCompare(formatDrop(b.drop));
        break;
      case "created_at":
        comparison =
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime();
        break;
      case "updated_at":
        comparison =
          new Date(a.updated_at || 0).getTime() -
          new Date(b.updated_at || 0).getTime();
        break;
    }
    return comparison;
  });
  return order === "asc" ? sorted : sorted.reverse();
}

export function pageButtons(
  total: number,
  current: number,
): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, "...", total];
  if (current >= total - 2)
    return [1, "...", total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}
