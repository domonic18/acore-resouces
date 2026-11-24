import { Check, Copy, Image as ImageIcon } from "lucide-react";
import { useClipboard } from "@/shared/useClipboard";
import { getIconPreviewUrl } from "@/shared/resources";
import type { Resource } from "@/shared/types";

/** 坐骑行的物品速览：图标 + 物品名 + 一键复制物品 entry（.additem 用）。 */
export function ItemCell({ resource }: { resource: Resource }) {
  const rawId = resource.dbc.item.id;
  const itemId = typeof rawId === "number" ? rawId : null;
  const rawName = resource.db.item_template.name;
  const itemName = typeof rawName === "string" ? rawName : null;
  const iconName = resource.official_db.icon_name;
  const { copied, copy } = useClipboard();

  if (resource.resource_type !== "mount" || itemId === null || itemId <= 0) {
    return <span className="text-text-secondary">—</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-bg-surface"
        title={iconName ? `物品图标：${iconName}` : "物品图标预览"}
      >
        {iconName ? (
          <img
            src={getIconPreviewUrl(iconName, 36)}
            alt={iconName}
            className="h-5 w-5 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <ImageIcon className="h-3.5 w-3.5 text-text-tertiary" />
        )}
      </span>
      <div className="min-w-0">
        <div
          className="truncate text-xs font-medium text-text-primary"
          title={itemName ?? undefined}
        >
          {itemName ?? "—"}
        </div>
        <div className="font-mono text-[11px] text-text-tertiary">{itemId}</div>
      </div>
      <button
        type="button"
        className="btn btn-icon btn-sm btn-ghost shrink-0 text-text-tertiary hover:text-text-primary"
        title={`复制物品 ID（游戏中 .additem ${itemId} 添加）`}
        aria-label="复制物品 ID"
        onClick={() => copy(String(itemId))}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
