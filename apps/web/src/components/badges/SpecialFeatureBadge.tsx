import { getFeatureMeta } from "@/features/resources/lib/special-features";
import { Badge, type BadgeTone } from "@/shared/components/ui/Badge";

interface SpecialFeatureBadgeProps {
  feature: string;
  /** 显示完整名称而非短标签 */
  full?: boolean;
  className?: string;
}

/** 坐骑特殊功能徽标：配色与说明文案统一由 special-features.ts 提供。 */
export function SpecialFeatureBadge({
  feature,
  full = false,
  className,
}: SpecialFeatureBadgeProps) {
  const meta = getFeatureMeta(feature);
  if (!meta) {
    return (
      <Badge tone="gray" title={feature} className={className}>
        {feature}
      </Badge>
    );
  }
  return (
    <Badge
      tone={meta.tone as BadgeTone}
      title={`${meta.value}：${meta.description}`}
      className={className}
    >
      {full ? meta.value : meta.label}
    </Badge>
  );
}
