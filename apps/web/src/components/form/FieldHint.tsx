import { useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { HelpCircle, Wand2 } from "lucide-react";
import type { FieldReferenceStat } from "@/features/resources/hooks/useFieldReference";

interface FieldHintProps {
  description: React.ReactNode;
  reference?: FieldReferenceStat | null;
  onApply?: () => void;
}

function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function FieldHint({ description, reference, onApply }: FieldHintProps) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label="字段说明"
          className="inline-flex items-center text-text-tertiary transition-colors hover:text-text-primary"
          onClick={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          align="end"
          collisionPadding={12}
          className="z-50 max-w-xs rounded-md border border-border bg-bg-elevated p-3 text-xs shadow-lg"
          sideOffset={6}
        >
          <div className="space-y-2 text-text-secondary">
            <div className="leading-relaxed">{description}</div>
            {reference && reference.value !== null && (
              <div className="rounded bg-bg-surface/70 px-2 py-1.5">
                <span className="text-text-tertiary">已添加资源常见值：</span>
                <span className="font-mono font-medium text-text-primary">
                  {String(reference.value)}
                </span>
                {reference.ratio !== null && (
                  <span className="text-text-tertiary">
                    {`（${formatRatio(reference.ratio)}，n=${reference.sampleSize}）`}
                  </span>
                )}
              </div>
            )}
            {onApply && reference && reference.value !== null && (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1 rounded-md bg-accent px-2 py-1 font-medium text-white transition-colors hover:bg-accent/85"
                onClick={() => {
                  onApply();
                  setOpen(false);
                }}
              >
                <Wand2 className="h-3 w-3" /> 填入参考值
              </button>
            )}
          </div>
          <Tooltip.Arrow className="fill-border" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
