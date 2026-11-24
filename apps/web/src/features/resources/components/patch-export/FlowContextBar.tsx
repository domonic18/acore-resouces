import { Check } from "lucide-react";
import {
  PATCH_FLOW_STEPS,
  type PatchFlowStep,
} from "@/features/resources/lib/patch-flow";

interface FlowContextBarProps {
  /** 当前所处步骤 id */
  currentStepId: string;
}

/** 向导从全流程第 ⑥ 步开始（创建补丁任务） */
const WIZARD_START_INDEX = 5;

/**
 * 全流程只读上下文条：前置的资源管理步骤（①~⑤）折叠为一个 chip，
 * 向导覆盖的 ⑥~⑨ 逐个显示状态（当前步高亮）。步骤跳转入口在
 * 向导卡内的 StepIndicator——这里只负责「我在全流程的哪个位置」的定位感。
 */
export function FlowContextBar({ currentStepId }: FlowContextBarProps) {
  const currentIndex = PATCH_FLOW_STEPS.findIndex(
    (step) => step.id === currentStepId,
  );
  // 未匹配到时按第一步处理，避免 indexOf -1 造成状态错乱
  const current = currentIndex < 0 ? 0 : currentIndex;
  const prepared = PATCH_FLOW_STEPS.slice(0, WIZARD_START_INDEX);
  const wizardSteps = PATCH_FLOW_STEPS.slice(WIZARD_START_INDEX);
  const preparedSummary = prepared.map((step) => step.title).join(" → ");

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="mr-1 shrink-0 text-text-tertiary">坐骑生产流程</span>
      <span
        className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-elevated px-2 py-0.5 text-text-tertiary"
        title={`①~⑤：${preparedSummary}（在「资源管理」页完成）`}
      >
        <Check className="h-3 w-3" />
        资源管理 ①~⑤
      </span>
      {wizardSteps.map((step, i) => (
        <StepChip
          key={step.id}
          step={step}
          state={i + WIZARD_START_INDEX === current ? "active" : i + WIZARD_START_INDEX < current ? "done" : "todo"}
        />
      ))}
    </div>
  );
}

type ChipState = "done" | "active" | "todo";

const CHIP_CLASS: Record<ChipState, string> = {
  done: "border-border bg-bg-elevated text-text-tertiary",
  active: "border-accent bg-accent text-[color:var(--gold-btn-text)]",
  todo: "border-border bg-bg-elevated text-text-tertiary/60",
};

function StepChip({ step, state }: { step: PatchFlowStep; state: ChipState }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${CHIP_CLASS[state]}`}
      title={`${step.title}：${step.summary}`}
    >
      {state === "done" ? <Check className="h-3 w-3" /> : (
        <span className="font-mono">{step.index}</span>
      )}
      <span className={state === "active" ? "font-medium" : undefined}>
        {step.title}
      </span>
    </span>
  );
}
