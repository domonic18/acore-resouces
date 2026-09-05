import { useEffect, useState } from "react";
import { cn } from "@/shared/utils";

interface NumberInputProps {
  value: unknown;
  onChange: (value: number | null) => void;
  compact?: boolean;
  invalid?: boolean;
}

export function NumberInput({
  value,
  onChange,
  compact,
  invalid,
}: NumberInputProps) {
  const [raw, setRaw] = useState<string | null>(null);
  const typeInvalid = raw !== null;

  useEffect(() => {
    if (typeof value === "number") setRaw(null);
  }, [value]);

  return (
    <div className="w-full">
      <input
        type="text"
        inputMode="decimal"
        className={cn(
          compact ? "form-input-compact" : "form-input",
          (invalid || typeInvalid) && "form-input-invalid",
        )}
        aria-invalid={invalid || typeInvalid || undefined}
        value={
          raw ?? (value === null || value === undefined ? "" : String(value))
        }
        onChange={(e) => {
          const text = e.target.value;
          const parsed = Number(text);
          if (text.trim() === "") {
            setRaw(null);
            onChange(null);
          } else if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
            setRaw(text);
            onChange(null);
          } else {
            setRaw(null);
            onChange(parsed);
          }
        }}
        onWheel={(e) => e.currentTarget.blur()}
      />
      {typeInvalid && (
        <p className="form-hint text-danger">
          请输入有效数字，当前内容将按空值处理
        </p>
      )}
    </div>
  );
}
