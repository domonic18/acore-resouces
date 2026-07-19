import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/utils";
import { pageButtons } from "../lib/resource-list";

interface ResourcePaginationProps {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  updateParam: (key: string, value: string) => void;
}

export function ResourcePagination({
  total,
  page,
  pageSize,
  totalPages,
  updateParam,
}: ResourcePaginationProps) {
  return (
    <div className="pagination">
      <div>
        显示 {total > 0 ? (page - 1) * pageSize + 1 : 0}-
        {Math.min(page * pageSize, total)} 条，共 {total} 条
      </div>
      <div className="page-nav">
        <button
          className="page-btn"
          disabled={page <= 1}
          onClick={() => updateParam("page", String(page - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageButtons(totalPages, page).map((p, i) =>
          p === "..." ? (
            <span
              key={`ellipsis-${i}`}
              className="flex h-8 items-center px-1 text-text-tertiary"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              className={cn("page-btn", page === p && "active")}
              onClick={() => updateParam("page", String(p))}
            >
              {p}
            </button>
          ),
        )}
        <button
          className="page-btn"
          disabled={page >= totalPages}
          onClick={() => updateParam("page", String(page + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
