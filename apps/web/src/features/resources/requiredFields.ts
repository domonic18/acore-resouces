import type { Resource } from "@/shared/types";

export const REQUIRED_FIELD_HINT = "必填：导出时不会自动补默认值";

export const REQUIRED_FIELD_DEFS: { path: string; label: string }[] = [
  { path: "dbc.spell.id", label: "法术 ID" },
  { path: "dbc.creature_model_data.id", label: "模型数据 ID" },
  { path: "dbc.creature_model_data.model_name", label: "模型路径" },
  { path: "dbc.item.id", label: "DBC 物品 ID" },
  { path: "db.creature_template.entry", label: "生物 entry" },
  { path: "db.creature_template.name", label: "生物名称" },
  { path: "db.item_template.entry", label: "物品 entry" },
  { path: "db.item_template.name", label: "物品名称" },
];

export function isRequiredEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return value === 0;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

function getValueAtPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function getMissingRequiredFields(resource: Resource): string[] {
  if (resource.resource_type !== "mount") return [];
  return REQUIRED_FIELD_DEFS.filter((def) =>
    isRequiredEmpty(getValueAtPath(resource, def.path)),
  ).map((def) => def.label);
}
