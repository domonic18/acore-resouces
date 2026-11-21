import { Check } from "lucide-react";
import {
  PATCH_FLOW_STEPS,
  type PatchFlowStep,
} from "@/features/resources/lib/patch-flow";

interface FlowContextBarProps {
  /** 当前所处步骤 id */
  currentStepId: string;
  /** 交互式步骤（向导覆盖的第 6~9 步）的 id 集合 */
  interactiveStepIds: string[];
  /** 点击某个交互式步骤时的回调 */
  onStepSelect?: (stepId: string) => void;
}

/**
 * 全流程上下文条——界面上唯一的步骤指示器。
 *
 * 让用户始终看到完整的 9 步：已经走过的前置步骤（1~5）用灰色勾号带过，
 * 正在进行的向导步骤（6~9）可点击跳转。这样从资源列表跳进来时，
 * 用户能立刻明白「前面 5 步已经完成了，现在要做的是构建」。
 */
export function FlowContextBar({
  currentStepId,
  interactiveStepIds,
  onStepSelect,
}: FlowContextBarProps) {
  const currentIndex = PATCH_FLOW_STEPS.findIndex(
    (step) => step.id === currentStepId,
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="mr-1 shrink-0 text-text-tertiary">坐骑生产流程</span>
      {PATCH_FLOW_STEPS.map((step, index) => {
        const state = resolveState(step, index, currentIndex, interactiveStepIds);
        return (
          <StepChip
            key={step.id}
            step={step}
            state={state}
            onClick={
              state === "interactive" && onStepSelect
                ? () => onStepSelect(step.id)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

type StepState = "prerequisite" | "active" | "interactive" | "todo";

function resolveState(
  step: PatchFlowStep,
  index: number,
  currentIndex: number,
  interactiveStepIds: string[],
): StepState {
  if (interactiveStepIds.includes(step.id)) {
    if (index === currentIndex) return "active";
    return index < currentIndex ? "interactive" : "interactive";
  }
  // 非交互步骤：位于当前步骤之前的视为已完成的前置条件
  return index < currentIndex ? "prerequisite" : "todo";
}

const STATE_CLASS: Record<StepState, string> = {
  prerequisite: "border-border bg-bg-elevated text-text-tertiary",
  active: "border-accent bg-accent text-white",
  interactive: "border-border bg-bg-elevated text-text-secondary hover:border-accent hover:text-accent",
  todo: "border-border bg-bg-elevated text-text-tertiary/60",
};

function StepChip({
  step,
  state,
  onClick,
}: {
  step: PatchFlowStep;
  state: StepState;
  onClick?: () => void;
}) {
  const title =
    state === "prerequisite"
      ? `${step.title}：${step.summary}（已完成）`
      : state === "todo"
        ? `${step.title}：${step.summary}`
        : step.summary;

  const content = (
    <>
      {state === "prerequisite" ? (
        <Check className="h-3 w-3" />
      ) : (
        <span className="font-mono">{step.index}</span>
      )}
      <span className={state === "active" ? "font-medium" : undefined}>
        {step.title}
      </span>
    </>
  );

  const className = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${STATE_CLASS[state]}`;

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        title={`${title}（点击回到这一步）`}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }
  return (
    <span className={className} title={title}>
      {content}
    </span>
  );
}
