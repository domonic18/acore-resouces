import { cn } from "@/shared/utils";

interface NumberInputProps {
  value: unknown;
  onChange: (value: number | null) => void;
  compact?: boolean;
}

export function NumberInput({ value, onChange, compact }: NumberInputProps) {
  return (
    <input
      type="number"
      className={cn(compact ? "form-input-compact" : "form-input")}
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange(null);
        } else {
          const n = Number(raw);
          onChange(Number.isNaN(n) ? null : n);
        }
      }}
      onWheel={(e) => e.currentTarget.blur()}
    />
  );
}
