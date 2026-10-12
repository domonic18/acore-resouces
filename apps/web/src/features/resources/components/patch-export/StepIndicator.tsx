import { Check } from "lucide-react";

const STEPS = ["选择坐骑", "构建补丁", "发布补丁"];

export function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-0">
      {STEPS.map((label, index) => {
        const state =
          index < current ? "done" : index === current ? "active" : "todo";
        return (
          <li key={label} className="flex items-center">
            {index > 0 && (
              <span
                className={`mx-2 h-px w-10 sm:w-16 ${
                  index <= current ? "bg-accent" : "bg-border"
                }`}
              />
            )}
            <button
              type="button"
              className="flex items-center gap-2"
              aria-current={state === "active" ? "step" : undefined}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                  state === "done"
                    ? "border-accent bg-accent text-white"
                    : state === "active"
                      ? "border-accent text-accent"
                      : "border-border text-text-tertiary"
                }`}
              >
                {state === "done" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`text-sm ${
                  state === "active"
                    ? "font-medium text-text-primary"
                    : state === "done"
                      ? "text-text-secondary"
                      : "text-text-tertiary"
                }`}
              >
                {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
