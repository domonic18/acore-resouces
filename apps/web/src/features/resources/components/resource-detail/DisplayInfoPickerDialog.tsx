import { useState } from "react";
import { Box, RefreshCw, Search } from "lucide-react";
import { getIconPreviewUrl } from "@/shared/resources";
import { cn } from "@/shared/utils";
import type { ItemDisplayInfoEntry } from "@/shared/types";
import { useItemDisplayInfoSearch } from "../../hooks/useItemDisplayInfo";

interface DisplayInfoPickerDialogProps {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onClose: () => void;
}

/** ItemDisplayInfo.dbc 显示 ID 选择弹窗：图标缩略图 + ID + 图标名，服务端搜索 */
export function DisplayInfoPickerDialog({
  selectedId,
  onSelect,
  onClose,
}: DisplayInfoPickerDialogProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch, isFetching } =
    useItemDisplayInfoSearch(search);

  const items: ItemDisplayInfoEntry[] = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-lg font-semibold text-text-primary">
            选择 ItemDisplayInfo 显示 ID
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-md p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
              title="刷新列表"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="border-b border-border p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              autoFocus
              className="form-input w-full pl-9"
              placeholder="搜索图标名（如 inv_mount）或输入 ID（如 95357）..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            {total > 0 ? `共 ${total} 条匹配` : "输入关键词搜索 ItemDisplayInfo 记录"}
          </p>
        </div>
        <div className="grid flex-1 grid-cols-6 gap-2 overflow-y-auto p-4 sm:grid-cols-8">
          {isLoading ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary">
              <RefreshCw className="mb-3 h-8 w-8 animate-spin" />
              <p className="text-sm">正在加载 ItemDisplayInfo...</p>
            </div>
          ) : isError ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary">
              <Box className="mb-3 h-12 w-12" />
              <p className="text-sm">加载失败</p>
              <p className="mt-1 max-w-md px-4 text-center text-xs text-danger">
                {error?.message || "未知错误"}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="btn btn-primary mt-4 text-xs"
              >
                重试
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary">
              <Box className="mb-3 h-12 w-12" />
              <p className="text-sm">未找到匹配记录</p>
              <p className="mt-1 text-xs">可尝试其他图标名关键词或 ID 前缀</p>
            </div>
          ) : (
            items.map((entry) => {
              const isSelected = entry.id === selectedId;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelect(entry.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border p-2 transition-colors hover:border-primary hover:bg-bg-hover",
                    isSelected
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-border",
                  )}
                  title={`${entry.id} ${entry.icon_name ?? ""}`}
                >
                  {entry.icon_name && (
                    <img
                      src={getIconPreviewUrl(entry.icon_name, 64)}
                      alt={entry.icon_name}
                      className="h-10 w-10 object-contain"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  )}
                  <span className="block max-w-full text-xs font-medium text-text-primary">
                    {entry.id}
                  </span>
                  <span className="block max-w-full truncate text-[10px] text-text-secondary">
                    {entry.icon_name ?? "（无图标）"}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border p-3">
          <p className="text-xs text-text-tertiary">
            当前选中：{selectedId ?? "未设置"}
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm text-xs"
            onClick={() => onSelect(null)}
            title="将 Display ID 设为 0（未设置）"
          >
            清空（设为 0）
          </button>
        </div>
      </div>
    </div>
  );
}
