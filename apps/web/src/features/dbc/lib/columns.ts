import type { DbcFieldDef } from "@/shared/types";

export function formatBytes(bytes: number): string {
  let size = bytes;
  for (const unit of ["B", "KB", "MB", "GB"]) {
    if (size < 1024 || unit === "GB") {
      return unit === "B" ? `${size} B` : `${size.toFixed(1)} ${unit}`;
    }
    size /= 1024;
  }
  return `${bytes} B`;
}

/** 默认摘要列：ID + 前 5 个 string 字段（与 CLI 查询一致） */
export function defaultColumns(fields: DbcFieldDef[]): string[] {
  const columns = fields.filter((f) => f.name === "ID").map((f) => f.name);
  const strings = fields.filter((f) => f.type === "string").map((f) => f.name);
  return [...columns, ...strings.slice(0, 5)];
}

const COLUMN_STORAGE_PREFIX = "dbc-cols:";

export function loadColumns(
  file: string,
  fields: DbcFieldDef[],
  storageKey?: string,
): string[] {
  try {
    const raw = localStorage.getItem(storageKey ?? `${COLUMN_STORAGE_PREFIX}${file}`);
    if (raw) {
      const saved = JSON.parse(raw) as string[];
      const valid = saved.filter((name) => fields.some((f) => f.name === name));
      if (valid.length > 0) {
        return valid;
      }
    }
  } catch {
    // 忽略损坏的本地配置，回退默认列
  }
  return defaultColumns(fields);
}

export function saveColumns(
  file: string,
  columns: string[],
  storageKey?: string,
): void {
  try {
    localStorage.setItem(
      storageKey ?? `${COLUMN_STORAGE_PREFIX}${file}`,
      JSON.stringify(columns),
    );
  } catch {
    // localStorage 不可用时静默降级为会话内记忆
  }
}
