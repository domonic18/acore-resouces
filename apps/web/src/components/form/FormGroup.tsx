import { cn } from "@/shared/utils";

interface FormGroupProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function FormGroup({
  label,
  hint,
  error,
  children,
  className,
  compact,
}: FormGroupProps) {
  return (
    <div className={cn("form-group", compact && "space-y-0", className)}>
      <label className={cn("form-label", compact && "form-label-compact")}>
        <span className="flex items-center gap-1">
          {label}
          {hint}
        </span>
      </label>
      {children}
      {error && <p className="form-hint text-danger">{error}</p>}
    </div>
  );
}
