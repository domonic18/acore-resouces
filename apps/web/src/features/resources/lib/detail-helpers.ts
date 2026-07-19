export function normalizeInt(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  return Number.isNaN(n) ? null : n;
}

export function normalizeFloat(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isNaN(n) ? null : n;
}

export function selectValue(value: unknown): string | number | undefined {
  if (typeof value === "string" || typeof value === "number") return value;
  return undefined;
}

export function getTabData(
  data: { dbc: Record<string, unknown>; db: Record<string, unknown> },
  key: string,
): string {
  const value =
    (data.dbc as Record<string, unknown>)[key] ??
    (data.db as Record<string, unknown>)[key] ??
    {};
  return JSON.stringify(value, null, 2);
}
