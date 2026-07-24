import { Link, useLocation } from "react-router-dom";
import {
  Check,
  Copy,
  Pencil,
  Eye,
  Search,
  Sparkles,
  Package,
} from "lucide-react";
import { useState } from "react";
import { ResourceThumb } from "@/components/ResourceThumb";
import { ResourceTypeBadge } from "@/components/badges/ResourceTypeBadge";
import { ResourceStatusBadge } from "@/components/badges/ResourceStatusBadge";
import { ResourceTagBadge } from "@/components/badges/ResourceTagBadge";
import { SortHeader } from "@/components/table/SortHeader";
import { formatDrop, formatDateTime } from "../lib/resource-list";
import type { Resource } from "@/shared/types";
import type { SortKey, SortOrder } from "../lib/resource-list";

function CopyResourceButton({ resource }: { resource: Resource }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const text = `${String(resource.id).padStart(4, "0")} ${resource.name || resource.model_folder} (${resource.model_folder})`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="btn btn-icon btn-sm btn-ghost shrink-0 text-text-tertiary hover:text-text-primary"
      title="复制资源信息"
      aria-label="复制资源信息"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

interface ResourceTableProps {
  currentItems: Resource[];
  sortKey: SortKey;
  sortOrder: SortOrder;
  setSort: (key: SortKey) => void;
  isLoading: boolean;
  error: Error | null;
  selectedIds?: number[];
  onSelect?: (id: number, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
}

export function ResourceTable({
  currentItems,
  sortKey,
  sortOrder,
  setSort,
  isLoading,
  error,
  selectedIds = [],
  onSelect,
  onSelectAll,
}: ResourceTableProps) {
  const location = useLocation();

  const saveScrollAndNavigate = () => {
    sessionStorage.setItem("resourceListScrollY", String(window.scrollY));
  };

  const listState = { from: location };
  if (isLoading) {
    return (
      <p className="px-5 py-8 text-center text-text-secondary">加载中...</p>
    );
  }

  if (error) {
    return (
      <p className="px-5 py-8 text-center text-danger">
        加载失败：{error instanceof Error ? error.message : String(error)}
      </p>
    );
  }

  const allSelected =
    currentItems.length > 0 &&
    currentItems.every((r) => selectedIds.includes(r.id));
  const someSelected =
    currentItems.some((r) => selectedIds.includes(r.id)) && !allSelected;

  const handleSelectAll = () => {
    onSelectAll?.(!allSelected);
  };

  return (
    <div className="overflow-x-auto">
      <table className="data-table w-full">
        <thead>
          <tr>
            <th style={{ width: 40 }}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={handleSelectAll}
              />
            </th>
            <SortHeader
              label="资源"
              active={sortKey === "resource"}
              order={sortOrder}
              onClick={() => setSort("resource")}
            />
            <SortHeader
              label="ID"
              active={sortKey === "id"}
              order={sortOrder}
              onClick={() => setSort("id")}
            />
            <SortHeader
              label="类型"
              active={sortKey === "resource_type"}
              order={sortOrder}
              onClick={() => setSort("resource_type")}
            />
            <SortHeader
              label="星级/稀有度"
              active={sortKey === "tier"}
              order={sortOrder}
              onClick={() => setSort("tier")}
            />
            <SortHeader
              label="掉落来源"
              active={sortKey === "drop"}
              order={sortOrder}
              onClick={() => setSort("drop")}
            />
            <th>状态</th>
            <th>标签</th>
            <SortHeader
              label="添加时间"
              active={sortKey === "created_at"}
              order={sortOrder}
              onClick={() => setSort("created_at")}
            />
            <SortHeader
              label="修改时间"
              active={sortKey === "updated_at"}
              order={sortOrder}
              onClick={() => setSort("updated_at")}
            />
            <th style={{ textAlign: "right" }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {currentItems.map((resource) => (
            <tr key={`${resource.resource_type}-${resource.id}`}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(resource.id)}
                  onChange={(e) => onSelect?.(resource.id, e.target.checked)}
                />
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/resources/${resource.resource_type}/${resource.id}`}
                    state={listState}
                    onClick={saveScrollAndNavigate}
                    className="name-cell min-w-0 flex-1"
                    title={resource.name || resource.model_folder}
                  >
                    <ResourceThumb resource={resource} />
                    <div className="min-w-0">
                      <div className="resource-name truncate">
                        {resource.name || resource.model_folder}
                      </div>
                      <div className="resource-meta truncate">
                        id: {String(resource.id).padStart(4, "0")} ·{" "}
                        {resource.model_folder}
                      </div>
                    </div>
                  </Link>
                  <CopyResourceButton resource={resource} />
                </div>
              </td>
              <td>{String(resource.id).padStart(4, "0")}</td>
              <td>
                <ResourceTypeBadge resource={resource} />
              </td>
              <td>{resource.star_rating || resource.rarity || "—"}</td>
              <td>{formatDrop(resource.drop)}</td>
              <td>
                <ResourceStatusBadge resource={resource} />
              </td>
              <td>
                <ResourceTagBadge resource={resource} />
              </td>
              <td className="text-text-secondary">
                {formatDateTime(resource.created_at)}
              </td>
              <td className="text-text-secondary">
                {formatDateTime(resource.updated_at)}
              </td>
              <td className="text-right">
                <div className="inline-flex items-center justify-end gap-1.5">
                  <Link
                    to={`/resources/${resource.resource_type}/${resource.id}`}
                    state={listState}
                    onClick={saveScrollAndNavigate}
                    className="btn btn-icon btn-sm"
                    title="编辑资源"
                    aria-label="编辑资源"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    to={`/preview/${resource.resource_type}/${resource.id}`}
                    state={listState}
                    onClick={saveScrollAndNavigate}
                    className="btn btn-icon btn-sm btn-primary"
                    title="预览模型"
                    aria-label="预览模型"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Link>
                  {resource.official_db.spell_wowhead_url && (
                    <a
                      href={resource.official_db.spell_wowhead_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-icon btn-sm btn-ghost text-text-tertiary hover:text-accent"
                      title="查看 Wowhead 法术页"
                      aria-label="查看 Wowhead 法术页"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {resource.official_db.item_wowhead_url && (
                    <a
                      href={resource.official_db.item_wowhead_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-icon btn-sm btn-ghost text-text-tertiary hover:text-accent"
                      title="查看 Wowhead 物品页"
                      aria-label="查看 Wowhead 物品页"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Package className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {currentItems.length === 0 && (
            <tr>
              <td colSpan={11}>
                <div className="empty-state">
                  <Search className="mb-3 h-12 w-12 text-text-tertiary" />
                  <h3>暂无资源</h3>
                  <p>当前筛选条件下没有找到资源，请尝试调整搜索或筛选条件。</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
