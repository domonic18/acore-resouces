import type { Resource } from "@/shared/types";
import { z } from "zod";
import { extractWowheadId } from "./id-origin";

export const TYPES: { key: "all" | "mount" | "pet" | "npc"; label: string }[] =
  [
    { key: "all", label: "全部" },
    { key: "mount", label: "坐骑" },
    { key: "pet", label: "宠物" },
    { key: "npc", label: "NPC" },
  ];

export type StatusTagValue =
  "passed" | "pending" | "added" | "not_added" | "conflict";

export const statusTagValueSchema = z.enum([
  "passed",
  "pending",
  "added",
  "not_added",
  "conflict",
]);

export const STATUS_TAG_OPTIONS: {
  value: StatusTagValue;
  label: string;
  group: "debug" | "added" | "conflict";
}[] = [
  { value: "passed", label: "调试通过", group: "debug" },
  { value: "pending", label: "待调试", group: "debug" },
  { value: "added", label: "已添加", group: "added" },
  { value: "not_added", label: "未添加", group: "added" },
  { value: "conflict", label: "冲突", group: "conflict" },
];

export type ResourceTagValue = "unofficial" | "no_official_data";

export const resourceTagValueSchema = z.enum(["unofficial", "no_official_data"]);

export const RESOURCE_TAG_OPTIONS: {
  value: ResourceTagValue;
  label: string;
}[] = [
  { value: "unofficial", label: "非官方" },
  { value: "no_official_data", label: "无官方数据" },
];

export function getUnofficialLabel(
  type: "all" | "mount" | "pet" | "npc",
): string {
  if (type === "mount") return "非官方坐骑";
  if (type === "pet") return "非官方宠物";
  if (type === "npc") return "非官方NPC";
  return "非官方";
}

export function getResourceTagLabel(tag: ResourceTagValue): string {
  const option = RESOURCE_TAG_OPTIONS.find((o) => o.value === tag);
  return option?.label ?? tag;
}

export type SortKey =
  | "id"
  | "resource"
  | "resource_type"
  | "tier"
  | "drop"
  | "created_at"
  | "updated_at";
export type SortOrder = "asc" | "desc";

export const sortKeySchema = z.enum([
  "id",
  "resource",
  "resource_type",
  "tier",
  "drop",
  "created_at",
  "updated_at",
]);

export const sortOrderSchema = z.enum(["asc", "desc"]);

export const resourceTypeSchema = z.enum(["all", "mount", "pet", "npc"]);

export const DEFAULT_SORT: SortKey = "updated_at";
export const DEFAULT_ORDER: SortOrder = "desc";

export function parseResourceType(
  value: string | null,
): "all" | "mount" | "pet" | "npc" {
  const result = resourceTypeSchema.safeParse(value);
  return result.success ? result.data : "all";
}

export function parseSortKey(value: string | null): SortKey {
  const result = sortKeySchema.safeParse(value);
  return result.success ? result.data : DEFAULT_SORT;
}

export function parseSortOrder(value: string | null): SortOrder {
  const result = sortOrderSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_ORDER;
}

export function parseStatusTagList(value: string | null): StatusTagValue[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v): v is StatusTagValue =>
      statusTagValueSchema.safeParse(v).success,
    );
}

export function parseResourceTagList(value: string | null): ResourceTagValue[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v): v is ResourceTagValue =>
      resourceTagValueSchema.safeParse(v).success,
    );
}

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

export function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInputValue(value: string): Date | null {
  const match = value.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function getStartOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

export function getEndOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

export type DatePresetKey = "yesterday" | "today" | "last7days";

export const DATE_PRESETS: {
  value: DatePresetKey;
  label: string;
  getRange: () => { start: string; end: string };
}[] = [
  {
    value: "yesterday",
    label: "昨日",
    getRange: () => {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      const value = formatDateInputValue(date);
      return { start: value, end: value };
    },
  },
  {
    value: "today",
    label: "今天",
    getRange: () => {
      const value = formatDateInputValue(new Date());
      return { start: value, end: value };
    },
  },
  {
    value: "last7days",
    label: "最近7天",
    getRange: () => {
      const end = formatDateInputValue(new Date());
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 6);
      return { start: formatDateInputValue(startDate), end };
    },
  },
];

export function matchesUpdatedAtFilter(
  resource: Resource,
  start: string | null,
  end: string | null,
): boolean {
  if (!resource.updated_at) return false;
  const updatedAt = new Date(resource.updated_at).getTime();
  if (Number.isNaN(updatedAt)) return false;

  if (start) {
    const startDate = parseDateInputValue(start);
    if (startDate && updatedAt < getStartOfDay(startDate).getTime()) {
      return false;
    }
  }
  if (end) {
    const endDate = parseDateInputValue(end);
    if (endDate && updatedAt > getEndOfDay(endDate).getTime()) {
      return false;
    }
  }
  return true;
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

export function computeResourceTags(resource: Resource): ResourceTagValue[] {
  const tags: ResourceTagValue[] = [];
  for (const tag of resource.tags ?? []) {
    if (
      (tag === "unofficial" || tag === "no_official_data") &&
      !tags.includes("unofficial")
    ) {
      tags.push("unofficial");
    }
  }
  return tags;
}

export function matchesStatusFilter(
  resource: Resource,
  selectedStatuses: StatusTagValue[],
): boolean {
  if (selectedStatuses.length === 0) return true;

  const selectedDebug = selectedStatuses.filter((s) =>
    STATUS_TAG_OPTIONS.find((o) => o.value === s && o.group === "debug"),
  );
  const selectedAdded = selectedStatuses.filter((s) =>
    STATUS_TAG_OPTIONS.find((o) => o.value === s && o.group === "added"),
  );
  const selectedConflict = selectedStatuses.filter((s) =>
    STATUS_TAG_OPTIONS.find((o) => o.value === s && o.group === "conflict"),
  );

  // Within a group, selecting both options is equivalent to no filter for that group.
  if (selectedDebug.length === 1) {
    const expected = selectedDebug[0] === "passed";
    if (resource.debug_passed !== expected) return false;
  }
  if (selectedAdded.length === 1) {
    const expected = selectedAdded[0] === "added";
    if (resource.added !== expected) return false;
  }
  if (selectedConflict.length > 0) {
    const hasConflict = (resource.duplicate_issues?.length ?? 0) > 0;
    if (!hasConflict) return false;
  }
  return true;
}

export function matchesTagFilter(
  resource: Resource,
  selectedTags: ResourceTagValue[],
): boolean {
  if (selectedTags.length === 0) return true;
  const tags = computeResourceTags(resource);
  return selectedTags.some((t) => tags.includes(t));
}

export type DataOriginValue = "official" | "custom";

export const dataOriginSchema = z.enum(["official", "custom"]);

export function parseDataOrigin(value: string | null): DataOriginValue | null {
  const result = dataOriginSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * 物品数据是否官方：dbc.item.id 与 official_db.item_wowhead_url 中的 ID 一致。
 * 与编辑页 IdOriginBadge 的物品徽章判定口径一致；法术 ID 按项目约定为
 * 自定义段（80000+N），故以物品 ID 为准区分官方/自定义。
 */
export function hasOfficialItemData(resource: Resource): boolean {
  const itemId = Number(resource.dbc.item?.id);
  if (!itemId || Number.isNaN(itemId)) return false;
  return (
    extractWowheadId(resource.official_db?.item_wowhead_url, "item") === itemId
  );
}

export function matchesOriginFilter(
  resource: Resource,
  origin: DataOriginValue,
): boolean {
  return origin === "official"
    ? hasOfficialItemData(resource)
    : !hasOfficialItemData(resource);
}

/** 可搜索的 DBC / DB 各类 ID（资源 ID 之外的补充检索字段） */
function collectSearchableIds(resource: Resource): string[] {
  const values: unknown[] = [
    resource.dbc.creature_model_data?.id,
    resource.dbc.creature_display_info?.id,
    resource.dbc.spell?.id,
    resource.dbc.spell?.visual_id,
    resource.dbc.item?.id,
    resource.dbc.item?.display_id,
    resource.db.creature_template?.entry,
    resource.db.item_template?.entry,
  ];
  return values
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => String(v));
}

/** 搜索匹配：名称、模型文件夹、资源 ID、各类 DBC/DB ID、M2 模型文件路径 */
export function matchesResourceSearch(
  resource: Resource,
  search: string,
): boolean {
  if (resource.model_folder.toLowerCase().includes(search)) return true;
  if ((resource.name ?? "").toLowerCase().includes(search)) return true;
  if ((resource.official_db.name ?? "").toLowerCase().includes(search))
    return true;
  if (String(resource.id).includes(search)) return true;
  const modelName = resource.dbc.creature_model_data?.model_name;
  if (typeof modelName === "string" && modelName.toLowerCase().includes(search))
    return true;
  return collectSearchableIds(resource).some((v) => v.includes(search));
}
