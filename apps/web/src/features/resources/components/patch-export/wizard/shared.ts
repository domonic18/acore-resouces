/**
 * 向导各步骤共用的纯函数与常量（不含 JSX，组件见各自的 PascalCase 文件）。
 */

/** 把构建起止时间格式化成人类可读的耗时；缺时间戳或区间非法时显示占位符 */
export function formatDuration(
  startedAt: string | null,
  finishedAt: string | null,
): string {
  if (!startedAt || !finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  return ms >= 60_000
    ? `${(ms / 60_000).toFixed(1)} 分钟`
    : `${(ms / 1000).toFixed(1)} 秒`;
}
