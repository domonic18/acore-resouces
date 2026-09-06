import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useResourceListData } from "@/features/resources/hooks/useResourceListData";

interface MountMultiSelectProps {
  selected: number[];
  onChange: (ids: number[]) => void;
}

export function MountMultiSelect({ selected, onChange }: MountMultiSelectProps) {
  const { allItems: mounts, isLoading } = useResourceListData("mount");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!mounts) return [];
    const q = search.trim().toLowerCase();
    if (!q) return mounts;
    return mounts.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(q) ||
        m.model_folder.toLowerCase().includes(q) ||
        String(m.id).includes(q),
    );
  }, [mounts, search]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (id: number) => {
    const next = new Set(selectedSet);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange([...next].sort((a, b) => a - b));
  };

  const selectFiltered = () => {
    const next = new Set(selectedSet);
    for (const m of filtered) next.add(m.id);
    onChange([...next].sort((a, b) => a - b));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="search-box relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索名称 / 模型 / ID..."
          />
        </div>
        <button type="button" className="btn btn-sm" onClick={selectFiltered}>
          全选筛选结果
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange([])}
          disabled={selected.length === 0}
        >
          清空
        </button>
        <span className="text-xs text-text-secondary">
          已选 <span className="font-semibold text-text-primary">{selected.length}</span> 个
        </span>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        {isLoading && (
          <div className="py-8 text-center text-sm text-text-tertiary">
            加载中...
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-text-tertiary">
            无匹配坐骑
          </div>
        )}
        {filtered.map((m) => (
          <label
            key={m.id}
            className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-bg-hover"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(m.id)}
              onChange={() => toggle(m.id)}
              className="h-4 w-4 accent-blue-500"
            />
            <span className="font-mono text-xs text-text-tertiary">
              #{String(m.id).padStart(4, "0")}
            </span>
            <span className="flex-1 truncate">
              {m.name || m.model_folder}
            </span>
            <span className="text-xs text-text-tertiary">
              {m.mount_type || "—"}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
