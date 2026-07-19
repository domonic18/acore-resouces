import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/utils";

interface BitmaskDropdownProps {
  options: { value: number; label: string }[];
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
}

export function BitmaskDropdown({
  options,
  value,
  onChange,
  placeholder = "未选择",
}: BitmaskDropdownProps) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -1 与满掩码在服务端按位与校验下等价（均表示“全部”），统一按“全选”展示；
  // 勾选满时保存为 -1（AzerothCore wiki 推荐写法）
  const allMask = options.reduce((acc, opt) => acc | opt.value, 0);
  const isAll =
    value === -1 || (value !== null && (value & allMask) === allMask);
  const displayMask = isAll ? allMask : (value ?? 0);

  const selectedCount = options.filter(
    (opt) => (displayMask & opt.value) === opt.value,
  ).length;
  const summaryText = isAll
    ? "全部已选"
    : selectedCount > 0
      ? `${selectedCount} 项已选（${displayMask}）`
      : placeholder;

  const toggle = (optValue: number) => {
    const checked = (displayMask & optValue) === optValue;
    let next: number;
    if (checked) {
      next = (value === -1 ? allMask : (value ?? 0)) & ~optValue;
    } else {
      next = (value === -1 ? allMask : (value ?? 0)) | optValue;
    }
    if (next === 0) {
      onChange(null);
    } else if ((next & allMask) === allMask) {
      onChange(-1);
    } else {
      onChange(next);
    }
  };

  const toggleAll = () => {
    onChange(isAll ? null : -1);
  };

  // 面板为 absolute 定位，会被 .card 的 overflow-hidden 裁剪；
  // 下方空间不足时改为向上展开
  const PANEL_HEIGHT = 240;
  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      let boundary = window.innerHeight;
      const card = ref.current.closest(".card");
      if (card) {
        boundary = Math.min(boundary, card.getBoundingClientRect().bottom);
      }
      setOpenUp(boundary - rect.bottom < PANEL_HEIGHT);
    }
    setOpen((prev) => !prev);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={cn(
          "form-select-compact flex w-full items-center justify-between text-left",
          selectedCount === 0 && "text-text-tertiary",
        )}
        onClick={handleToggle}
      >
        <span className="truncate">{summaryText}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div
          className={cn(
            "absolute z-20 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-bg-elevated p-2 shadow-lg",
            openUp ? "bottom-full mb-1" : "mt-1",
          )}
        >
          <div className="mb-1 px-2 text-[10px] text-text-tertiary">
            当前掩码：{value ?? "—"}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs font-semibold text-text-primary hover:bg-bg-hover">
            <input type="checkbox" checked={isAll} onChange={toggleAll} />
            <span>全部（存为 -1）</span>
          </label>
          <div className="my-1 border-t border-border" />
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover"
            >
              <input
                type="checkbox"
                checked={(displayMask & opt.value) === opt.value}
                onChange={() => toggle(opt.value)}
              />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
