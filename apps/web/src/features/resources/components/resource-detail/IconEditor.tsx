import { Box } from "lucide-react";
import { getIconPreviewUrl } from "@/shared/resources";

interface IconEditorProps {
  label: string;
  value: string;
  iconNames: string[];
  onChange: (value: string) => void;
  onOpenPicker: () => void;
}

export function IconEditor({
  label,
  value,
  iconNames,
  onChange,
  onOpenPicker,
}: IconEditorProps) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onOpenPicker}
        className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-bg-surface transition-colors hover:border-primary hover:bg-bg-hover focus:outline-none focus:ring-2 focus:ring-primary"
        title="点击选择图标"
      >
        {value ? (
          <img
            src={getIconPreviewUrl(value, 96)}
            alt={value}
            className="h-12 w-12 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <Box className="h-8 w-8 text-text-tertiary" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <label className="form-label">{label}</label>
        <input
          list="icon-options"
          type="text"
          className="form-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="输入或选择图标"
        />
        <datalist id="icon-options">
          {iconNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
