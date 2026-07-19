import { cn } from "@/shared/utils";
import type { Resource } from "@/shared/types";

interface ResourceStatusBadgeProps {
  resource: Resource;
  verbose?: boolean;
}

export function ResourceStatusBadge({
  resource,
  verbose = false,
}: ResourceStatusBadgeProps) {
  const addedText = resource.added ? "已通过 · 已添加" : "已通过 · 未添加";
  const pendingText = resource.added ? "待调试 · 已添加" : "待调试 · 未添加";

  if (verbose) {
    if (resource.debug_passed && resource.added) {
      return (
        <span className="text-sm text-text-secondary">
          <span className="status-dot bg-success" />
          {addedText}
        </span>
      );
    }
    if (resource.debug_passed) {
      return (
        <span className="text-sm text-text-secondary">
          <span className="status-dot bg-success" />
          已通过
        </span>
      );
    }
    return (
      <span className="text-sm text-text-secondary">
        <span className="status-dot bg-warning" />
        {pendingText}
      </span>
    );
  }

  if (resource.debug_passed) {
    return (
      <span className={cn("badge badge-success")} title={addedText}>
        <span className="status-dot bg-success" />
        已通过
      </span>
    );
  }
  return (
    <span className={cn("badge badge-warning")} title={pendingText}>
      <span className="status-dot bg-warning" />
      待调试
    </span>
  );
}
