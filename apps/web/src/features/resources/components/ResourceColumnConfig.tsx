import { useMemo, useState } from "react";
import { Columns3, RotateCcw, Search } from "lucide-react";
import { cn } from "@/shared/utils";
import { CONFIGURABLE_COLUMNS } from "../lib/tableColumns";
import type { ResourceColumnKey } from "../lib/tableColumns";

interface ResourceColumnConfigProps {
  /** 当前页可配置的列 key（按资源类型/权限过滤） */
  availableKeys: ResourceColumnKey[];
  hidden: ResourceColumnKey[];
  onToggle: (key: ResourceColumnKey) => void;
  onReset: () => void;
}

/** 资源表列设置弹层：checkbox 列表 + 恢复默认，持久化由父组件负责（仿 DbcColumnConfig） */
export function ResourceColumnConfig({
  availableKeys,
  hidden,
  onToggle,
  onReset,
}: ResourceColumnConfigProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const keyword = search.trim().toLowerCase();
  const columns = useMemo(
    () =>
      CONFIGURABLE_COLUMNS.filter(
        (c) =>
          availableKeys.includes(c.key) &&
          c.label.toLowerCase().includes(keyword),
      ),
    [availableKeys, keyword],
  );
  const configurable = availableKeys.length;
  const visibleCount = configurable - availableKeys.filter((k) => hidden.includes(k)).length;

  return (
    <div className="relative">
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setOpen((v) => !v)}
      >
        <Columns3 className="h-3.5 w-3.5" /> 列设置 {visibleCount} /{" "}
        {configurable}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-1 w-60 rounded-lg border border-border bg-bg-surface p-3 shadow-xl">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                className="form-input-compact w-full pl-8"
                placeholder="搜索列名..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
              {columns.map((col) => {
                const checked = !hidden.includes(col.key);
                return (
                  <label
                    key={col.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-bg-hover"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(col.key)}
                      className="h-3.5 w-3.5 accent-[#eab53c]"
                    />
                    <span
                      className={cn(
                        "truncate text-xs",
                        checked ? "text-text-primary" : "text-text-secondary",
                      )}
                    >
                      {col.label}
                    </span>
                  </label>
                );
              })}
              {columns.length === 0 && (
                <div className="py-4 text-center text-xs text-text-tertiary">
                  无匹配列
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-sm mt-2 w-full"
              onClick={onReset}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              恢复默认列
            </button>
          </div>
        </>
      )}
    </div>
  );
}
