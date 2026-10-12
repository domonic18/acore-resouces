/** wowhead 链接 ID 提取与官方判定（供 IdOriginBadge 等使用） */

export type WowheadIdType = "spell" | "item";

/** 从 wowhead 页面链接中提取指定类型的记录 ID，如 /spell=171628 → 171628 */
export function extractWowheadId(
  url: string | null | undefined,
  type: WowheadIdType,
): number | null {
  if (!url) return null;
  const match = url.match(/(spell|item)=(\d+)/);
  if (!match || match[1] !== type) return null;
  const id = Number(match[2]);
  return Number.isNaN(id) ? null : id;
}
