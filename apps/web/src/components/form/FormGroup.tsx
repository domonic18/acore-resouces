import { cn } from "@/shared/utils";

interface FormGroupProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function FormGroup({
  label,
  children,
  className,
  compact,
}: FormGroupProps) {
  return (
    <div className={cn("form-group", compact && "space-y-0", className)}>
      <label className={cn("form-label", compact && "form-label-compact")}>
        {label}
      </label>
      {children}
    </div>
  );
}
