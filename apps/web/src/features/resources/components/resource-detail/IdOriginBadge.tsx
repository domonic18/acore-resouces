import { cn } from "@/shared/utils";

export type IdSegment = "spell" | "item" | "cmd" | "cdi" | "creature";

/** 自定义 ID 区间（docs/references/06 资源 DBC 与 SQL 实现参考 §五） */
const SEGMENT_RANGES: Record<IdSegment, [number, number | null]> = {
  spell: [80000, 90000],
  item: [91000, 100000],
  cmd: [104000, 140000],
  cdi: [140000, null],
  creature: [9140000, null],
};

interface IdOriginBadgeProps {
  value: unknown;
  segment: IdSegment;
}

/** 标识 ID 来自官方数据库还是项目自定义段位；0/未设置时不显示 */
export function IdOriginBadge({ value, segment }: IdOriginBadgeProps) {
  const v = Number(value);
  if (!value || Number.isNaN(v) || v === 0) return null;
  const [min, max] = SEGMENT_RANGES[segment];
  const custom = v >= min && (max === null || v < max);
  return (
    <span
      title={custom ? "项目自定义 ID 段位" : "官方数据库 ID"}
      className={cn(
        "inline-flex shrink-0 items-center rounded px-1 py-px text-[10px] font-medium leading-3",
        custom ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary",
      )}
    >
      {custom ? "自定义" : "官方"}
    </span>
  );
}
