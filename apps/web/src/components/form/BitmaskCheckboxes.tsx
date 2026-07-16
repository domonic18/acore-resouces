interface BitmaskCheckboxesProps {
  options: { value: number; label: string }[];
  value: number | null;
  onChange: (value: number | null) => void;
}

export function BitmaskCheckboxes({
  options,
  value,
  onChange,
}: BitmaskCheckboxesProps) {
  const mask = value ?? 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-surface px-2 py-1 text-sm text-text-secondary"
          >
            <input
              type="checkbox"
              checked={(mask & opt.value) === opt.value}
              onChange={(e) => {
                const next = e.target.checked
                  ? mask | opt.value
                  : mask & ~opt.value;
                onChange(next === 0 ? null : next);
              }}
            />
            {opt.label}
          </label>
        ))}
      </div>
      <div className="text-xs text-text-tertiary">当前掩码：{value ?? "—"}</div>
    </div>
  );
}
