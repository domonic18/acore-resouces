import { Link } from "react-router-dom";
import { cn } from "@/shared/utils";

interface QuickActionCardProps {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: "blue" | "purple" | "green";
}

export function QuickActionCard({
  to,
  icon,
  title,
  desc,
  color,
}: QuickActionCardProps) {
  const colorClass = {
    blue: "bg-blue-500/15 text-blue-400",
    purple: "bg-purple-500/15 text-purple-400",
    green: "bg-green-500/15 text-green-400",
  }[color];

  return (
    <Link
      to={to}
      className="flex items-center gap-4 rounded-lg border border-border bg-bg-surface p-4 transition-all hover:border-border-hover hover:bg-bg-hover"
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg",
          colorClass,
        )}
      >
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary">{desc}</div>
      </div>
    </Link>
  );
}
