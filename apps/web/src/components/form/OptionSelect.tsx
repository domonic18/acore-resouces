import { cn } from "@/shared/utils";

interface OptionSelectProps {
  options: { value: number; label: string }[];
  value: unknown;
  onChange: (value: number | null) => void;
  placeholder?: string;
  compact?: boolean;
}

export function OptionSelect({
  options,
  value,
  onChange,
  placeholder = "未设置",
  compact,
}: OptionSelectProps) {
  const numValue =
    value === null || value === undefined || value === ""
      ? null
      : Number(value);
  const currentInList = numValue !== null && options.some((o) => o.value === numValue);

  return (
    <select
      className={cn(compact ? "form-select-compact" : "form-select")}
      value={numValue === null ? "" : String(numValue)}
      onChange={(e) =>
        onChange(e.target.value === "" ? null : Number(e.target.value))
      }
    >
      <option value="">{placeholder}</option>
      {!currentInList && numValue !== null && (
        <option value={String(numValue)}>{numValue}（未知）</option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
