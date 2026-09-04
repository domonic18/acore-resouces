import { BadgeCheck } from "lucide-react";
import { cn } from "@/shared/utils";
import type { WowheadIdType } from "../../lib/id-origin";
import { extractWowheadId } from "../../lib/id-origin";

interface IdOriginBadgeProps {
  value: unknown;
  /** 当前 ID 对应的 wowhead 记录类型 */
  type: WowheadIdType;
  /** 官方 wowhead 页面链接（official_db.*_wowhead_url），官方判定依据 */
  wowheadUrl?: string | null;
}

/**
 * ID 来源徽章：wowhead 链接存在、类型一致且链接中的 ID 与当前 ID
 * 相同 → 官方（绿色实底）；否则 → 项目自定义（黄色描边）。0/未设置不显示。
 */
export function IdOriginBadge({ value, type, wowheadUrl }: IdOriginBadgeProps) {
  const v = Number(value);
  if (!value || Number.isNaN(v) || v === 0) return null;
  const official = extractWowheadId(wowheadUrl, type) === v;
  return (
    <span
      title={
        official
          ? `官方数据：与 wowhead 链接中的 ${type}=${v} 一致`
          : "项目自定义 ID（与官方 wowhead 链接不一致，或未提供官方链接）"
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-px text-[10px] font-semibold leading-3",
        official
          ? "bg-success text-white"
          : "border border-warning/40 bg-warning/10 text-warning",
      )}
    >
      {official && <BadgeCheck className="h-3 w-3" />}
      {official ? "官方" : "自定义"}
    </span>
  );
}
