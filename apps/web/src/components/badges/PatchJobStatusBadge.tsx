import { Badge } from "@/shared/components/ui/Badge";
import type { PatchJob } from "@/shared/types";

interface PatchJobStatusBadgeProps {
  job?: PatchJob;
}

const STATUS_META: Record<
  PatchJob["status"],
  { label: string; tone: "blue" | "green" | "success" | "danger" }
> = {
  requested: { label: "待构建", tone: "blue" },
  generated: { label: "已构建", tone: "green" },
  applied: { label: "已发布", tone: "success" },
  failed: { label: "构建失败", tone: "danger" },
};

/**
 * 补丁任务状态徽标。
 *
 * 显示这只坐骑在补丁流水线上走到哪一步：
 * 待构建（第 6 步）→ 已构建（第 7 步）→ 已发布（第 9 步）。
 */
export function PatchJobStatusBadge({ job }: PatchJobStatusBadgeProps) {
  if (!job) {
    return (
      <span className="text-text-tertiary" title="尚未创建补丁任务">
        —
      </span>
    );
  }
  const meta = STATUS_META[job.status];
  const updated = job.updated_at
    ? new Date(job.updated_at).toLocaleString("zh-CN")
    : null;
  return (
    <Badge
      tone={meta.tone}
      title={[
        `任务 ${job.job_id}`,
        `状态：${meta.label}`,
        updated ? `更新于 ${updated}` : null,
        job.summary,
      ]
        .filter(Boolean)
        .join("\n")}
    >
      {meta.label}
    </Badge>
  );
}
