import { useCallback, useState } from "react";

/**
 * 剪贴板复制 + 短暂「已复制」状态。
 * 非安全上下文（无 navigator.clipboard）时静默失败。
 */
export function useClipboard(timeoutMs = 1500) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    (value: string) => {
      navigator.clipboard
        .writeText(value)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), timeoutMs);
        })
        .catch(() => {
          // 剪贴板不可用时静默失败
        });
    },
    [timeoutMs],
  );
  return { copied, copy };
}
