import { cn } from "@/shared/utils";

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}

export function SectionCard({ title, children, compact }: SectionCardProps) {
  return (
    <div className="card">
      <div className={cn("card-header", compact && "px-4 py-3")}>
        <div className="card-title">{title}</div>
      </div>
      <div className={cn("card-body", compact && "p-4")}>{children}</div>
    </div>
  );
}
