import { useEffect } from "react";

/**
 * 锁定状态下让表单切片中的关联字段持续跟随来源值（解锁后停止同步，
 * 重新锁定时自动回填为来源值）。
 */
export function useLinkedFieldValue(
  locked: boolean,
  sourceValue: number | null,
  field: string,
  setValue: React.Dispatch<React.SetStateAction<Record<string, unknown>>>,
) {
  useEffect(() => {
    if (!locked || sourceValue === null) return;
    setValue((prev) =>
      prev[field] === sourceValue
        ? prev
        : { ...prev, [field]: sourceValue },
    );
  }, [locked, sourceValue, field, setValue]);
}
