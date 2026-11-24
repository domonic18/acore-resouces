import type { ScopeOptionProps } from "./types";

/** 构建范围的单选项：用单选而不是复选，避免两个范围同时生效的歧义。 */
export function ScopeOption({
  checked,
  onChange,
  title,
  description,
  danger,
  disabled,
}: ScopeOptionProps) {
  return (
    <label
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        checked
          ? danger
            ? "border-warning/40 bg-warning/10"
            : "border-accent/40 bg-accent/10"
          : "border-border bg-bg-surface"
      } ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
      />
      <span className="min-w-0">
        <span
          className={
            danger ? "font-medium text-warning" : "font-medium text-text-primary"
          }
        >
          {title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-tertiary">
          {description}
        </span>
      </span>
    </label>
  );
}
