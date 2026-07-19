import { useState } from "react";
import { List, GitBranch } from "lucide-react";
import { SectionCard } from "@/components/form/SectionCard";
import { cn } from "@/shared/utils";
import { useResourceRelationships } from "../../hooks/useResourceRelationships";
import { RelationshipChain } from "./RelationshipChain";
import { RelationshipGraph } from "./RelationshipGraph";

interface RelationshipCheckSectionProps {
  liveDbc: Record<string, unknown>;
  liveDb: Record<string, unknown>;
  compact?: boolean;
  onSelectTab?: (tab: string) => void;
}

export function RelationshipCheckSection({
  liveDbc,
  liveDb,
  compact,
  onSelectTab: _onSelectTab,
}: RelationshipCheckSectionProps) {
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const { results, overallStatus } = useResourceRelationships(liveDbc, liveDb);

  const statusBadge =
    overallStatus === "ok"
      ? "badge-success"
      : overallStatus === "mismatch"
        ? "badge-danger"
        : "badge-gray";

  return (
    <SectionCard title="关联校验" compact={compact}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("badge", statusBadge)}>
            {overallStatus === "ok"
              ? "全部一致"
              : overallStatus === "mismatch"
                ? "存在不一致"
                : "存在缺失"}
          </span>
          <span className="text-xs text-text-tertiary">
            {results.length} 组关键关联
          </span>
        </div>
        <div className="flex rounded-md border border-border p-0.5">
          <button
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
              viewMode === "list"
                ? "bg-bg-hover text-text-primary"
                : "text-text-tertiary hover:text-text-primary",
            )}
            onClick={() => setViewMode("list")}
          >
            <List className="h-3 w-3" /> 列表
          </button>
          <button
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
              viewMode === "graph"
                ? "bg-bg-hover text-text-primary"
                : "text-text-tertiary hover:text-text-primary",
            )}
            onClick={() => setViewMode("graph")}
          >
            <GitBranch className="h-3 w-3" /> 拓扑图
          </button>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="space-y-3">
          {results.map((result) => (
            <RelationshipChain key={result.rule.key} result={result} />
          ))}
        </div>
      ) : (
        <RelationshipGraph results={results} onSelectTab={_onSelectTab} />
      )}
    </SectionCard>
  );
}
