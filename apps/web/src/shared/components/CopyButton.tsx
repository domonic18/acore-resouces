import { Check, Copy } from "lucide-react";
import { useClipboard } from "@/shared/useClipboard";
import { cn } from "@/shared/utils";

interface CopyButtonProps {
  value: string;
  className?: string;
  label?: string;
  title?: string;
}

/** 复制文本到剪贴板，成功后短暂显示「已复制」。 */
export function CopyButton({ value, className, label, title }: CopyButtonProps) {
  const { copied, copy } = useClipboard();

  return (
    <button
      type="button"
      className={cn("btn btn-sm shrink-0", className)}
      onClick={() => copy(value)}
      title={title ?? "复制到剪贴板"}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "已复制" : (label ?? "复制")}
    </button>
  );
}
