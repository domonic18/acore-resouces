import type { ReactNode } from "react";
import { cn } from "@/shared/utils";

export type BadgeTone =
  | "blue"
  | "purple"
  | "green"
  | "orange"
  | "gray"
  | "cyan"
  | "teal"
  | "success"
  | "warning"
  | "danger";

const TONE_CLASS: Record<BadgeTone, string> = {
  blue: "badge-blue",
  purple: "badge-purple",
  green: "badge-success",
  orange: "badge-orange",
  gray: "badge-gray",
  cyan: "badge-cyan",
  teal: "badge-teal",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
};

export interface BadgeProps {
  tone?: BadgeTone;
  title?: string;
  className?: string;
  children: ReactNode;
}

/** 通用徽标。配色语义类定义在 src/index.css 的 .badge-* 系列。 */
export function Badge({
  tone = "gray",
  title,
  className,
  children,
}: BadgeProps) {
  return (
    <span className={cn("badge", TONE_CLASS[tone], className)} title={title}>
      {children}
    </span>
  );
}
