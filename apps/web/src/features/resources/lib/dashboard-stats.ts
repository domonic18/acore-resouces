import type { Resource } from "@/shared/types";
import {
  hasMissingRequired,
  hasOfficialItemData,
} from "@/features/resources/lib/resource-list";

export interface StatRow {
  label: string;
  value: number;
  to: string;
  colorClass: string;
}

const STAR_ORDER = ["五星", "四星", "三星", "二星", "一星"];

const BAR_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
];

function mountFilterUrl(params: Record<string, string>): string {
  const query = new URLSearchParams({ type: "mount", ...params });
  return `/resources?${query.toString()}`;
}

function groupByField(
  mounts: Resource[],
  getField: (r: Resource) => string | null | undefined,
  urlParam: string,
): StatRow[] {
  const counts = new Map<string, number>();
  let unlabeled = 0;
  for (const r of mounts) {
    const field = getField(r);
    if (!field) {
      unlabeled += 1;
      continue;
    }
    counts.set(field, (counts.get(field) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({
      label,
      value,
      to: mountFilterUrl({ [urlParam]: label }),
      colorClass: BAR_COLORS[i % BAR_COLORS.length],
    }));
  if (unlabeled > 0) {
    rows.push({
      label: "未标注",
      value: unlabeled,
      to: "",
      colorClass: "bg-border",
    });
  }
  return rows;
}

function groupStarRating(mounts: Resource[]): StatRow[] {
  const counts = new Map<string, number>();
  let unlabeled = 0;
  for (const r of mounts) {
    if (!r.star_rating) {
      unlabeled += 1;
      continue;
    }
    counts.set(r.star_rating, (counts.get(r.star_rating) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .sort(
      (a, b) =>
        (STAR_ORDER.indexOf(a[0]) + 1 || STAR_ORDER.length + 1) -
        (STAR_ORDER.indexOf(b[0]) + 1 || STAR_ORDER.length + 1),
    )
    .map(([label, value], i) => ({
      label,
      value,
      to: mountFilterUrl({ tier: label }),
      colorClass: BAR_COLORS[i % BAR_COLORS.length],
    }));
  if (unlabeled > 0) {
    rows.push({
      label: "未标注",
      value: unlabeled,
      to: "",
      colorClass: "bg-border",
    });
  }
  return rows;
}

export function computeMountStats(mounts: Resource[]): {
  byOrigin: StatRow[];
  byMountType: StatRow[];
  byStarRating: StatRow[];
  byAdded: StatRow[];
  byDebug: StatRow[];
  health: StatRow[];
} {
  const officialCount = mounts.filter(hasOfficialItemData).length;

  return {
    byOrigin: [
      {
        label: "官方数据",
        value: officialCount,
        to: mountFilterUrl({ origin: "official" }),
        colorClass: "bg-blue-500",
      },
      {
        label: "自定义数据",
        value: mounts.length - officialCount,
        to: mountFilterUrl({ origin: "custom" }),
        colorClass: "bg-purple-500",
      },
    ],
    byMountType: groupByField(mounts, (r) => r.mount_type, "category"),
    byStarRating: groupStarRating(mounts),
    byAdded: [
      {
        label: "已添加",
        value: mounts.filter((r) => r.added).length,
        to: mountFilterUrl({ status: "added" }),
        colorClass: "bg-green-500",
      },
      {
        label: "未添加",
        value: mounts.filter((r) => !r.added).length,
        to: mountFilterUrl({ status: "not_added" }),
        colorClass: "bg-cyan-500",
      },
    ],
    byDebug: [
      {
        label: "调试通过",
        value: mounts.filter((r) => r.debug_passed).length,
        to: mountFilterUrl({ status: "passed" }),
        colorClass: "bg-green-500",
      },
      {
        label: "待调试",
        value: mounts.filter((r) => !r.debug_passed).length,
        to: mountFilterUrl({ status: "pending" }),
        colorClass: "bg-orange-500",
      },
    ],
    health: [
      {
        label: "必填缺失",
        value: mounts.filter(hasMissingRequired).length,
        to: mountFilterUrl({ required: "missing" }),
        colorClass: "bg-red-500",
      },
      {
        label: "数据冲突",
        value: mounts.filter(
          (r) => (r.duplicate_issues?.length ?? 0) > 0,
        ).length,
        to: mountFilterUrl({ status: "conflict" }),
        colorClass: "bg-amber-500",
      },
    ],
  };
}
