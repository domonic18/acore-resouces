import { Link2, Lock, LockOpen } from "lucide-react";
import { NumberInput } from "@/components/form/NumberInput";
import { cn } from "@/shared/utils";

interface LinkedModelIdFieldProps {
  value: unknown;
  /** 关联字段说明，如「模型数据 → CreatureModelData.id」 */
  linkedLabel: string;
  locked: boolean;
  onToggleLock: () => void;
  onNavigate?: () => void;
  onChange: (value: number | null) => void;
  compact?: boolean;
}

export function LinkedModelIdField({
  value,
  linkedLabel,
  locked,
  onToggleLock,
  onNavigate,
  onChange,
  compact,
}: LinkedModelIdFieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {locked ? (
          <input
            type="number"
            disabled
            className={cn(
              "flex-1",
              compact ? "form-input-compact" : "form-input",
            )}
            value={value === null || value === undefined ? "" : String(value)}
          />
        ) : (
          <NumberInput
            value={value}
            onChange={onChange}
            compact={compact}
          />
        )}
        <button
          type="button"
          onClick={onToggleLock}
          title={
            locked
              ? "已自动跟随关联字段，点击解锁手动编辑"
              : "点击恢复自动跟随关联字段"
          }
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
            locked
              ? "border-border text-text-tertiary hover:bg-bg-surface hover:text-text-primary"
              : "border-warning/40 bg-warning/10 text-warning",
          )}
        >
          {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
        </button>
      </div>
      <button
        type="button"
        onClick={onNavigate}
        disabled={!onNavigate}
        title={onNavigate ? "跳转到关联字段" : undefined}
        className={cn(
          "inline-flex items-center gap-1 text-[11px]",
          onNavigate
            ? "text-text-tertiary transition-colors hover:text-primary"
            : "cursor-default text-text-tertiary",
        )}
      >
        <Link2 className="h-3 w-3" />
        关联字段：{linkedLabel}
        {locked && "（自动跟随）"}
      </button>
    </div>
  );
}
