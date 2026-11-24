import { useCallback, useEffect, useState } from "react";

export type ResourceColumnKey =
  | "resource"
  | "id"
  | "type"
  | "tier"
  | "drop"
  | "item"
  | "status"
  | "patch_status"
  | "tags"
  | "features"
  | "conflicts"
  | "created_at"
  | "updated_at";

export const RESOURCE_COLUMNS: { key: ResourceColumnKey; label: string }[] = [
  { key: "resource", label: "资源" },
  { key: "id", label: "ID" },
  { key: "type", label: "类型" },
  { key: "tier", label: "星级/稀有度" },
  { key: "drop", label: "掉落来源" },
  { key: "item", label: "物品" },
  { key: "status", label: "状态" },
  { key: "patch_status", label: "补丁任务" },
  { key: "tags", label: "标签" },
  { key: "features", label: "功能" },
  { key: "conflicts", label: "冲突" },
  { key: "created_at", label: "添加时间" },
  { key: "updated_at", label: "修改时间" },
];

/** 恒显列（不参与显隐配置） */
const ALWAYS_VISIBLE: ResourceColumnKey[] = ["resource"];

/** 参与配置的列（配置面板展示用） */
export const CONFIGURABLE_COLUMNS = RESOURCE_COLUMNS.filter(
  (c) => !ALWAYS_VISIBLE.includes(c.key),
);

/** 各资源类型默认隐藏的列：页签已按类型过滤，类型列冗余；冷门列默认收起避免横向滚动 */
const DEFAULT_HIDDEN: Record<string, ResourceColumnKey[]> = {
  mount: ["type", "tags", "conflicts", "created_at"],
  pet: ["type", "tags", "conflicts", "created_at"],
  npc: ["type", "tags", "conflicts", "created_at"],
};

export function defaultHiddenColumns(type: string): ResourceColumnKey[] {
  return DEFAULT_HIDDEN[type] ?? [];
}

const STORAGE_PREFIX = "resource-cols:";
const STORAGE_VERSION = "v1";

function storageKey(type: string): string {
  return `${STORAGE_PREFIX}${type}:${STORAGE_VERSION}`;
}

function isKnownKey(key: string): key is ResourceColumnKey {
  return RESOURCE_COLUMNS.some((c) => c.key === key);
}

export function loadHiddenColumns(type: string): ResourceColumnKey[] {
  try {
    const raw = localStorage.getItem(storageKey(type));
    if (raw) {
      const saved = JSON.parse(raw) as string[];
      if (Array.isArray(saved)) {
        // 已有用户配置则完全信任（含显式开启的默认隐藏列）；未知 key 忽略
        return saved.filter(isKnownKey);
      }
    }
  } catch {
    // 忽略损坏的本地配置，回退默认
  }
  return defaultHiddenColumns(type);
}

export function saveHiddenColumns(
  type: string,
  hidden: ResourceColumnKey[],
): void {
  try {
    localStorage.setItem(storageKey(type), JSON.stringify(hidden));
  } catch {
    // localStorage 不可用时静默降级为会话内记忆
  }
}

export function useResourceColumnVisibility(type: string) {
  const [hidden, setHidden] = useState<ResourceColumnKey[]>(() =>
    loadHiddenColumns(type),
  );

  // 页签切换类型时重读该类型的持久化配置
  useEffect(() => {
    setHidden(loadHiddenColumns(type));
  }, [type]);

  const update = useCallback(
    (next: ResourceColumnKey[]) => {
      setHidden(next);
      saveHiddenColumns(type, next);
    },
    [type],
  );

  const toggle = useCallback(
    (key: ResourceColumnKey) => {
      update(
        hidden.includes(key)
          ? hidden.filter((k) => k !== key)
          : [...hidden, key],
      );
    },
    [hidden, update],
  );

  const reset = useCallback(
    () => update(defaultHiddenColumns(type)),
    [type, update],
  );

  const isVisible = useCallback(
    (key: ResourceColumnKey) =>
      ALWAYS_VISIBLE.includes(key) || !hidden.includes(key),
    [hidden],
  );

  return { hidden, toggle, reset, isVisible };
}
