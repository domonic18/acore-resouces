import { useId } from "react";
import { Box } from "lucide-react";
import { cn } from "@/shared/utils";
import { getIconPreviewUrl } from "@/shared/resources";

interface IconEditorProps {
  label: string;
  value: string;
  iconNames: string[];
  onChange: (value: string) => void;
  onOpenPicker: () => void;
  compact?: boolean;
}

export function IconEditor({
  label,
  value,
  iconNames,
  onChange,
  onOpenPicker,
  compact,
}: IconEditorProps) {
  const datalistId = useId();

  return (
    <div className={cn("flex items-center gap-4", compact && "gap-3")}>
      <button
        type="button"
        onClick={onOpenPicker}
        className={cn(
          "flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-bg-surface transition-colors hover:border-primary hover:bg-bg-hover focus:outline-none focus:ring-2 focus:ring-primary",
          compact ? "h-12 w-12" : "h-16 w-16",
        )}
        title="点击选择图标"
      >
        {value ? (
          <img
            src={getIconPreviewUrl(value, 96)}
            alt={value}
            className={cn("object-contain", compact ? "h-8 w-8" : "h-12 w-12")}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Box
            className={cn(
              "text-text-tertiary",
              compact ? "h-6 w-6" : "h-8 w-8",
            )}
          />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <label className={cn("form-label", compact && "form-label-compact")}>
          {label}
        </label>
        <input
          list={datalistId}
          type="text"
          className={cn(compact ? "form-input-compact" : "form-input")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="输入或选择图标"
        />
        <datalist id={datalistId}>
          {iconNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
