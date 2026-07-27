import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/utils";

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
  defaultExpanded?: boolean;
}

export function SectionCard({
  title,
  children,
  compact,
  defaultExpanded = true,
}: SectionCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "card-header w-full cursor-pointer text-left",
          compact && "px-4 py-3",
        )}
      >
        <div className="card-title">{title}</div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div className={cn("card-body", compact && "p-4")}>{children}</div>
      )}
    </div>
  );
}
