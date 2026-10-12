import { Link } from "react-router-dom";
import { cn } from "@/shared/utils";
import type {
  DbcAnnotation,
  DbcFieldDef,
  DbcRecordRow,
} from "@/shared/types";

interface DbcTableViewerProps {
  fields: DbcFieldDef[];
  visibleColumns: string[];
  items: DbcRecordRow[];
  annotations: DbcAnnotation[];
  selectedRecordId: number | null;
  onSelectRecord: (recordId: number) => void;
  compareMode: boolean;
  compareA: number | null;
  compareB: number | null;
  onCompareRecord: (recordId: number) => void;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

export function DbcTableViewer({
  fields,
  visibleColumns,
  items,
  annotations,
  selectedRecordId,
  onSelectRecord,
  compareMode,
  compareA,
  compareB,
  onCompareRecord,
}: DbcTableViewerProps) {
  const fieldType = (name: string) =>
    fields.find((f) => f.name === name)?.type ?? "";
  const annotationMap = new Map(
    annotations.map((a) => [a.record_id, a.resources]),
  );

  const isHighlighted = (recordId: number) =>
    compareMode
      ? recordId === compareA || recordId === compareB
      : recordId === selectedRecordId;

  return (
    <div className="overflow-x-auto">
      <table className="data-table w-full">
        <thead>
          <tr>
            {compareMode && <th className="w-12">对比</th>}
            {visibleColumns.map((column) => (
              <th key={column}>
                <span title={`${column} (${fieldType(column)})`}>{column}</span>
              </th>
            ))}
            <th>来源资源</th>
          </tr>
        </thead>
        <tbody>
          {items.map((record) => {
            const resources = annotationMap.get(record._record_id);
            return (
              <tr
                key={`${record._record_id}-${record._index}`}
                className={cn(
                  "cursor-pointer",
                  isHighlighted(record._record_id) && "bg-accent-soft",
                )}
                onClick={() =>
                  compareMode
                    ? onCompareRecord(record._record_id)
                    : onSelectRecord(record._record_id)
                }
              >
                {compareMode && (
                  <td>
                    {record._record_id === compareA ? (
                      <span className="badge badge-blue">A</span>
                    ) : record._record_id === compareB ? (
                      <span className="badge badge-blue">B</span>
                    ) : (
                      <span className="text-xs text-text-tertiary">—</span>
                    )}
                  </td>
                )}
                {visibleColumns.map((column) => (
                  <td
                    key={column}
                    className={cn(
                      "max-w-48 truncate text-xs",
                      column === "ID" && "font-mono text-text-primary",
                    )}
                    title={formatCellValue(record[column])}
                  >
                    {formatCellValue(record[column])}
                  </td>
                ))}
                <td>
                  {resources && resources.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {resources.map((resource) => (
                        <Link
                          key={`${resource.type}-${resource.id}`}
                          to={`/resources/${resource.type}/${resource.id}`}
                          className="badge badge-purple"
                          onClick={(e) => e.stopPropagation()}
                          title={`${resource.type} #${resource.id} ${resource.name ?? ""}`}
                        >
                          {String(resource.id).padStart(4, "0")} ·{" "}
                          {resource.name || resource.model_folder} →
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <span className="text-xs text-text-tertiary">—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td
                colSpan={visibleColumns.length + 1 + (compareMode ? 1 : 0)}
                className="py-8 text-center text-text-secondary"
              >
                无匹配记录
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
