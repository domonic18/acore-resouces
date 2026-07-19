import { cn } from "@/shared/utils";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  change?: string;
  colorClass: string;
}

export function StatCard({
  icon,
  label,
  value,
  change,
  colorClass,
}: StatCardProps) {
  return (
    <div className="card border-border bg-bg-elevated p-5 transition-all hover:-translate-y-0.5 hover:border-border-hover">
      <div
        className={cn(
          "mb-3.5 flex h-10 w-10 items-center justify-center rounded-md text-lg",
          colorClass,
        )}
      >
        {icon}
      </div>
      <div className="text-[28px] font-extrabold tracking-tight">{value}</div>
      <div className="text-xs font-medium text-text-secondary">{label}</div>
      {change && (
        <div className="mt-2 text-[11px] font-medium text-success">
          {change}
        </div>
      )}
    </div>
  );
}
