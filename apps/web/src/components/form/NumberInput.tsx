interface NumberInputProps {
  value: unknown;
  onChange: (value: number | null) => void;
}

export function NumberInput({ value, onChange }: NumberInputProps) {
  return (
    <input
      type="number"
      className="form-input"
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
    />
  );
}
