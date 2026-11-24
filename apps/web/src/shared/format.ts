/** 通用格式化助手（跨 feature 共用，禁止在组件里重复实现）。 */

/** 字节数 → 可读大小（B/KB/MB/GB，一位小数）。 */
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

/** 构建日志时间戳 → 本地时分秒（无效时间返回空串）。 */
export function formatLogTime(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString();
}

/** ISO 时间 → zh-CN「年/月/日 时:分」；空值返回 empty 占位。 */
export function formatDateTime(iso: string | null, empty = "—"): string {
  if (!iso) return empty;
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
