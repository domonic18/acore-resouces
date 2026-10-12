import { Link } from "react-router-dom";
import { cn } from "@/shared/utils";
import type { StatRow } from "@/features/resources/lib/dashboard-stats";

interface DistributionCardProps {
  title: string;
  subtitle?: string;
  rows: StatRow[];
  total: number;
  isLoading?: boolean;
}

export function DistributionCard({
  title,
  subtitle,
  rows,
  total,
  isLoading,
}: DistributionCardProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">{title}</div>
          {subtitle && <div className="card-subtitle">{subtitle}</div>}
        </div>
      </div>
      <div className="card-body space-y-3.5">
        {isLoading
          ? [0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm text-text-tertiary">
                  <span>—</span>
                  <span>—</span>
                </div>
                <div className="h-1.5 rounded-full bg-border" />
              </div>
            ))
          : rows.map((row) => {
              const pct =
                total > 0 ? Math.round((row.value / total) * 100) : 0;
              const content = (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{row.label}</span>
                    <span className="text-sm">
                      <span className="font-semibold">{row.value}</span>
                      <span className="ml-1.5 text-xs text-text-tertiary">
                        {pct}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-border">
                    <div
                      className={cn("h-1.5 rounded-full", row.colorClass)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </>
              );
              return row.to ? (
                <Link
                  key={row.label}
                  to={row.to}
                  className="block rounded-md p-1 transition-colors hover:bg-bg-hover"
                >
                  {content}
                </Link>
              ) : (
                <div key={row.label} className="p-1">
                  {content}
                </div>
              );
            })}
      </div>
    </div>
  );
}
