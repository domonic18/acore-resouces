import { cn } from "@/shared/utils";

interface FormGroupProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function FormGroup({ label, children, className }: FormGroupProps) {
  return (
    <div className={cn("form-group", className)}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}
