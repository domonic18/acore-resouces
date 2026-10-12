import { useMemo, useState } from "react";
import { Columns3, Search } from "lucide-react";
import { cn } from "@/shared/utils";
import type { DbcFieldDef } from "@/shared/types";

interface DbcColumnConfigProps {
  fields: DbcFieldDef[];
  visibleColumns: string[];
  onToggle: (column: string) => void;
}

/** 摘要列配置弹层：搜索 + 复选框，选择持久化由父组件负责 */
export function DbcColumnConfig({
  fields,
  visibleColumns,
  onToggle,
}: DbcColumnConfigProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const keyword = search.trim().toLowerCase();
  const filtered = useMemo(
    () => fields.filter((f) => f.name.toLowerCase().includes(keyword)),
    [fields, keyword],
  );

  return (
    <div className="relative">
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setOpen((v) => !v)}
      >
        <Columns3 className="h-3.5 w-3.5" /> 列显示 {visibleColumns.length} /{" "}
        {fields.length}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-border bg-bg-surface p-3 shadow-xl">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                className="form-input-compact w-full pl-8"
                placeholder="搜索字段名..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
              {filtered.map((field) => {
                const checked = visibleColumns.includes(field.name);
                return (
                  <label
                    key={field.name}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 hover:bg-bg-hover"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(field.name)}
                        className="h-3.5 w-3.5 accent-[#6366f1]"
                      />
                      <span
                        className={cn(
                          "truncate font-mono text-xs",
                          checked ? "text-text-primary" : "text-text-secondary",
                        )}
                      >
                        {field.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-text-tertiary">
                      {field.type}
                    </span>
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-4 text-center text-xs text-text-tertiary">
                  无匹配字段
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
