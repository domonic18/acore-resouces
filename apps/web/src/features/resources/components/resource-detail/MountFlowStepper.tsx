import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import {
  FLOW_AUTOMATION_LABELS,
  FLOW_PHASE_LABELS,
  PATCH_FLOW_STEPS,
  getFlowStep,
  type FlowStepStatus,
} from "@/features/resources/lib/patch-flow";
import type { ResourceFlowState } from "@/shared/types";

interface MountFlowStepperProps {
  flow: ResourceFlowState;
}

const STATUS_ICON: Record<FlowStepStatus, typeof Circle> = {
  done: CheckCircle2,
  active: CircleDot,
  pending: Circle,
  blocked: Circle,
};

const STATUS_CLASS: Record<FlowStepStatus, string> = {
  done: "text-success",
  active: "text-accent",
  pending: "text-text-tertiary",
  blocked: "text-danger",
};

/**
 * 坐骑在 9 步生产流程中的位置。
 *
 * 步骤目录来自 patch-flow.ts，各步状态由后端推导
 * （GET /api/resources/{type}/{id}/flow），前端不做任何判定。
 */
export function MountFlowStepper({ flow }: MountFlowStepperProps) {
  const currentStep = getFlowStep(flow.current_step_id);
  const phaseLabel = currentStep
    ? FLOW_PHASE_LABELS[currentStep.phase]
    : "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text-primary">
          生产流程
        </span>
        <span className="text-xs text-text-tertiary">
          第 {flow.current_step_index} / {PATCH_FLOW_STEPS.length} 步
          {phaseLabel ? ` · ${phaseLabel}` : ""}
        </span>
      </div>

      <ol className="space-y-1">
        {PATCH_FLOW_STEPS.map((step) => {
          const state = flow.steps.find((s) => s.step_id === step.id);
          const status: FlowStepStatus = state?.status ?? "pending";
          const Icon = STATUS_ICON[status];
          return (
            <li key={step.id} className="flex items-start gap-2 text-sm">
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_CLASS[status]}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      status === "done"
                        ? "text-text-secondary"
                        : status === "active"
                          ? "font-medium text-text-primary"
                          : "text-text-tertiary"
                    }
                  >
                    {step.index}. {step.title}
                  </span>
                  <span className="badge badge-gray">
                    {FLOW_AUTOMATION_LABELS[step.automation]}
                  </span>
                </div>
                {state?.message && (
                  <div className="text-xs text-text-tertiary">
                    {state.message}
                  </div>
                )}
                {status === "active" && (
                  <div className="text-xs text-text-secondary">
                    {step.summary}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {flow.completed && (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          该坐骑已走完全部流程并通过验收。
        </div>
      )}
    </div>
  );
}
