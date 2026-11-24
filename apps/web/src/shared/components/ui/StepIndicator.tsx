import { Check } from "lucide-react";
import { cn } from "@/shared/utils";

export interface StepIndicatorStep {
  /** 展示用的步骤序号（如全流程编号 6~9） */
  index: number;
  title: string;
}

interface StepIndicatorProps {
  steps: StepIndicatorStep[];
  /** 当前步骤下标；大于 steps.length - 1 时全部视为已完成 */
  current: number;
  /** 点击已完成步骤回到该步；不传则纯展示 */
  onSelect?: (index: number) => void;
}

type NodeState = "done" | "active" | "todo";

const NODE_CLASS: Record<NodeState, string> = {
  done: "border-accent/50 bg-accent-soft text-accent",
  active: "border-accent bg-accent text-[color:var(--gold-btn-text)]",
  todo: "border-border bg-bg-elevated text-text-tertiary/60",
};

const TITLE_CLASS: Record<NodeState, string> = {
  done: "text-text-secondary",
  active: "font-medium text-text-primary",
  todo: "text-text-tertiary/70",
};

/** 多步流程的步骤指示器：圈号 + 标题 + 连接线，done / active / todo 三态。 */
export function StepIndicator({ steps, current, onSelect }: StepIndicatorProps) {
  return (
    <ol className="flex flex-wrap items-center gap-y-2">
      {steps.map((step, i) => {
        const state: NodeState =
          i < current ? "done" : i === current ? "active" : "todo";
        const clickable = Boolean(onSelect) && state === "done";
        return (
          <li key={step.index} className="flex items-center">
            {clickable ? (
              <button
                type="button"
                className="flex items-center gap-1.5"
                title={`${step.title}（点击回到这一步）`}
                onClick={() => onSelect?.(i)}
              >
                <IndicatorNode step={step} state={state} />
              </button>
            ) : (
              <span className="flex items-center gap-1.5">
                <IndicatorNode step={step} state={state} />
              </span>
            )}
            {i < steps.length - 1 && (
              <span className="mx-2 h-px w-5 shrink-0 bg-border" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function IndicatorNode({
  step,
  state,
}: {
  step: StepIndicatorStep;
  state: NodeState;
}) {
  return (
    <>
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
          NODE_CLASS[state],
        )}
      >
        {state === "done" ? <Check className="h-3.5 w-3.5" /> : step.index}
      </span>
      <span className={cn("text-xs", TITLE_CLASS[state])}>{step.title}</span>
    </>
  );
}
