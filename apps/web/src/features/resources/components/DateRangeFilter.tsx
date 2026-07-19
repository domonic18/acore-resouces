import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import {
  DATE_PRESETS,
  formatDateInputValue,
  parseDateInputValue,
} from "../lib/resource-list";
import type { DatePresetKey } from "../lib/resource-list";

interface DateRangeFilterProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}

export function DateRangeFilter({
  start,
  end,
  onChange,
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftStart(start);
    setDraftEnd(end);
  }, [start, end, open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const activePreset: DatePresetKey | null = (() => {
    for (const preset of DATE_PRESETS) {
      const range = preset.getRange();
      if (range.start === start && range.end === end) return preset.value;
    }
    return null;
  })();

  const displayLabel =
    start && end
      ? `${start} ~ ${end}`
      : start
        ? `${start} 起`
        : end
          ? `截止 ${end}`
          : "修改时间";

  const apply = (nextStart: string, nextEnd: string) => {
    const normalizedStart = parseDateInputValue(nextStart)
      ? formatDateInputValue(parseDateInputValue(nextStart)!)
      : "";
    const normalizedEnd = parseDateInputValue(nextEnd)
      ? formatDateInputValue(parseDateInputValue(nextEnd)!)
      : "";
    onChange(normalizedStart, normalizedEnd);
  };

  const handlePresetClick = (preset: (typeof DATE_PRESETS)[number]) => {
    const range = preset.getRange();
    apply(range.start, range.end);
  };

  const handleInputBlur = () => {
    apply(draftStart, draftEnd);
  };

  const clear = () => {
    apply("", "");
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`filter-select inline-flex items-center gap-1.5 ${
          start || end ? "text-text-primary" : "text-text-secondary"
        }`}
      >
        <Calendar className="h-3.5 w-3.5 text-text-tertiary" />
        <span className="truncate max-w-[180px]">{displayLabel}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[280px] rounded-lg border border-border bg-bg-surface p-3 shadow">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handlePresetClick(preset)}
                className={`badge cursor-pointer transition-colors ${
                  activePreset === preset.value
                    ? "badge-blue"
                    : "badge-gray hover:bg-gray-500/25"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="w-10 text-xs text-text-tertiary">开始</label>
              <input
                type="date"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                onBlur={handleInputBlur}
                onKeyDown={(e) => e.key === "Enter" && handleInputBlur()}
                className="filter-select h-8 flex-1 px-2 py-1 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-10 text-xs text-text-tertiary">结束</label>
              <input
                type="date"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
                onBlur={handleInputBlur}
                onKeyDown={(e) => e.key === "Enter" && handleInputBlur()}
                className="filter-select h-8 flex-1 px-2 py-1 text-xs"
              />
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={clear}
              disabled={!start && !end}
              className="btn btn-sm btn-ghost text-xs"
            >
              清除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
