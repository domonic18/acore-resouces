export const REQUIRED_FIELD_HINT = "必填：导出时不会自动补默认值";

export function isRequiredEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return value === 0;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}
