import { Box, RefreshCw } from "lucide-react";
import { getIconPreviewUrl } from "@/shared/resources";
import { cn } from "@/shared/utils";
import { Dialog } from "@/shared/components/ui/Dialog";

interface IconPickerDialogProps {
  title: string;
  selectedValue: string;
  iconNames: string[];
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (name: string) => void;
  onClose: () => void;
  onRefresh?: () => void;
}

export function IconPickerDialog({
  title,
  selectedValue,
  iconNames,
  isLoading,
  isError,
  error,
  search,
  onSearch,
  onSelect,
  onClose,
  onRefresh,
}: IconPickerDialogProps) {
  const searchLower = search.trim().toLowerCase();
  const filtered = searchLower
    ? iconNames.filter((name) => name.toLowerCase().includes(searchLower))
    : iconNames;

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      subtitle={
        onRefresh ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-md p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
              title="刷新图标列表"
              aria-label="刷新图标列表"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        ) : undefined
      }
      size="md"
    >
      <div className="mb-4">
        <input
          type="text"
          autoFocus
          className="form-input w-full"
          placeholder="搜索图标名称..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <p className="mt-2 text-xs text-text-secondary">
          共 {filtered.length} 个图标
        </p>
      </div>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {isLoading ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary">
            <RefreshCw className="mb-3 h-8 w-8 animate-spin" />
            <p className="text-sm">正在加载图标...</p>
          </div>
        ) : isError ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary">
            <Box className="mb-3 h-12 w-12" />
            <p className="text-sm">加载图标失败</p>
            <p className="mt-1 max-w-md px-4 text-center text-xs text-danger">
              {error?.message || "未知错误"}
            </p>
            {error?.message?.includes("<!doctype") && (
              <p className="mt-2 max-w-md px-4 text-center text-xs text-text-secondary">
                后端 /api/preview/icons 接口返回了网页而非 JSON，
                通常是后端代码未更新或未重启导致。
              </p>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="btn btn-primary mt-4 text-xs"
              >
                重试
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary">
            <Box className="mb-3 h-12 w-12" />
            <p className="text-sm">未找到图标</p>
            <p className="mt-1 text-xs">请检查 sources/icons 目录是否存在</p>
          </div>
        ) : (
          filtered.map((name) => {
            const isSelected = name === selectedValue;
            return (
              <button
                key={name}
                type="button"
                onClick={() => onSelect(name)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md border p-2 transition-colors hover:border-primary hover:bg-bg-hover",
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border",
                )}
                title={name}
              >
                <img
                  src={getIconPreviewUrl(name, 64)}
                  alt={name}
                  className="h-10 w-10 object-contain"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display =
                      "none";
                  }}
                />
                <span className="block max-w-full truncate text-[10px] text-text-secondary">
                  {name}
                </span>
              </button>
            );
          })
        )}
      </div>
    </Dialog>
  );
}
