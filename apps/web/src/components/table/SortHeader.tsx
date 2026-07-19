import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { SortOrder } from "@/features/resources/lib/resource-list";

interface SortHeaderProps {
  label: string;
  active: boolean;
  order: SortOrder;
  onClick: () => void;
}

export function SortHeader({ label, active, order, onClick }: SortHeaderProps) {
  const Icon = active ? (order === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      onClick={onClick}
      className="cursor-pointer select-none whitespace-nowrap"
      title="点击排序"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className="h-3.5 w-3.5 text-text-tertiary" />
      </span>
    </th>
  );
}
