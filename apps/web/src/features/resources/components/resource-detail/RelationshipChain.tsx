import { Check, AlertTriangle, Minus } from "lucide-react";
import { cn } from "@/shared/utils";
import type { RelationshipResult } from "../../lib/relationships";

interface RelationshipChainProps {
  result: RelationshipResult;
}

const STATUS_CONFIG = {
  ok: {
    icon: Check,
    label: "一致",
    badge: "badge-success",
    valueClass: "text-success",
  },
  mismatch: {
    icon: AlertTriangle,
    label: "不一致",
    badge: "badge-danger",
    valueClass: "text-danger",
  },
  missing: {
    icon: Minus,
    label: "缺失",
    badge: "badge-gray",
    valueClass: "text-text-tertiary",
  },
};

const SOURCE_BADGE_CLASS: Record<"dbc" | "db", string> = {
  dbc: "badge-purple",
  db: "badge-blue",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function RelationshipChain({ result }: RelationshipChainProps) {
  const status = STATUS_CONFIG[result.status];
  const StatusIcon = status.icon;
  const values = result.values;

  return (
    <div className="rounded-md border border-border bg-bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("badge", status.badge)}>
          <StatusIcon className="mr-1 h-3 w-3" />
          {status.label}
        </span>
        <span className="text-sm font-semibold text-text-primary">
          {result.rule.name}
        </span>
        <span className="text-xs text-text-tertiary">
          {result.rule.description}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {values.map((field, index) => {
          const isLast = index === values.length - 1;
          return (
            <div
              key={`${field.source}-${field.table}-${field.field}`}
              className="flex items-center gap-2"
            >
              <div className="flex min-w-[120px] flex-col rounded-md border border-border bg-bg-elevated px-3 py-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <span
                    className={cn("badge", SOURCE_BADGE_CLASS[field.source])}
                  >
                    {field.source.toUpperCase()}
                  </span>
                  <span className="text-xs font-medium text-text-secondary">
                    {field.table}
                  </span>
                </div>
                <div className="text-[11px] text-text-tertiary">
                  {field.field}
                </div>
                <div
                  className={cn(
                    "text-sm font-semibold",
                    result.status === "mismatch" &&
                      field.value !== result.commonValue &&
                      result.commonValue !== null
                      ? "text-danger"
                      : status.valueClass,
                  )}
                >
                  {formatValue(field.value)}
                </div>
              </div>
              {!isLast && <span className="text-text-tertiary">→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
