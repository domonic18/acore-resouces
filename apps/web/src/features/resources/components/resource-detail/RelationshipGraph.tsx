import { useMemo, useState } from "react";
import { cn } from "@/shared/utils";
import type { RelationshipResult } from "../../lib/relationships";

interface RelationshipGraphProps {
  results: RelationshipResult[];
  onSelectTab?: (tab: string) => void;
}

const NODE_WIDTH = 140;
const NODE_HEIGHT = 64;
const COLUMN_WIDTH = 200;
const ROW_HEIGHT = 90;

const NODE_LAYOUT: Record<string, { x: number; y: number; tab: string }> = {
  "dbc:creature_model_data": { x: 0, y: 0, tab: "creature_model_data" },
  "dbc:spell": { x: 0, y: 2, tab: "spell" },
  "dbc:item": { x: 1, y: 3, tab: "item" },
  "dbc:creature_display_info": { x: 1, y: 1, tab: "creature_display_info" },
  "db:creature_template": { x: 2, y: 0, tab: "creature_template" },
  "db:creature_model_info": { x: 2, y: 2, tab: "creature_model_info" },
  "db:item_template": { x: 2, y: 3, tab: "item_template" },
};

function getNodePosition(nodeId: string) {
  const layout = NODE_LAYOUT[nodeId];
  if (!layout) return { x: 0, y: 0 };
  return {
    x: 40 + layout.x * COLUMN_WIDTH,
    y: 30 + layout.y * ROW_HEIGHT,
  };
}

const STATUS_STROKE = {
  ok: "#4ade80",
  mismatch: "#f87171",
  missing: "#9ca3af",
};

const STATUS_DASH = {
  ok: "0",
  mismatch: "4 4",
  missing: "4 4",
};

function formatEdgeLabel(
  fromField: string,
  toField: string,
  value: unknown,
): string {
  const valueText = value === null || value === undefined ? "—" : String(value);
  return `${fromField} → ${toField}: ${valueText}`;
}

function getNodeValueLabel(
  node: { id: string; source: "dbc" | "db"; table: string },
  results: RelationshipResult[],
): string {
  for (const ruleResult of results) {
    const field = ruleResult.values.find(
      (valueItem) => `${valueItem.source}:${valueItem.table}` === node.id,
    );
    if (field) {
      const valueText =
        field.value === null || field.value === undefined
          ? "—"
          : String(field.value);
      return `${field.field}: ${valueText}`;
    }
  }
  return "—";
}

export function RelationshipGraph({
  results,
  onSelectTab,
}: RelationshipGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  const { nodes, edges, width, height } = useMemo(() => {
    const nodeIds = new Set<string>();
    const edgesData: {
      id: string;
      from: string;
      to: string;
      fromField: string;
      toField: string;
      status: "ok" | "mismatch" | "missing";
      value: unknown;
      label: string;
    }[] = [];

    results.forEach((result) => {
      result.values.forEach((field) =>
        nodeIds.add(`${field.source}:${field.table}`),
      );
      for (let i = 0; i < result.values.length - 1; i++) {
        const from = result.values[i];
        const to = result.values[i + 1];
        edgesData.push({
          id: `${result.rule.key}-${i}`,
          from: `${from.source}:${from.table}`,
          to: `${to.source}:${to.table}`,
          fromField: from.field,
          toField: to.field,
          status: result.status,
          value: result.commonValue,
          label: formatEdgeLabel(from.field, to.field, result.commonValue),
        });
      }
    });

    const nodesData = Array.from(nodeIds).map((id) => {
      const layout = NODE_LAYOUT[id];
      const pos = getNodePosition(id);
      const [source, table] = id.split(":");
      return {
        id,
        source: source as "dbc" | "db",
        table,
        pos,
        tab: layout?.tab ?? "",
      };
    });

    const maxX = Math.max(...nodesData.map((n) => n.pos.x));
    const maxY = Math.max(...nodesData.map((n) => n.pos.y));

    return {
      nodes: nodesData,
      edges: edgesData,
      width: maxX + NODE_WIDTH + 40,
      height: maxY + NODE_HEIGHT + 40,
    };
  }, [results]);

  const getEdgePath = (from: string, to: string) => {
    const fromPos = getNodePosition(from);
    const toPos = getNodePosition(to);
    const x1 = fromPos.x + NODE_WIDTH;
    const y1 = fromPos.y + NODE_HEIGHT / 2;
    const x2 = toPos.x;
    const y2 = toPos.y + NODE_HEIGHT / 2;
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  };

  const isEdgeHighlighted = (edge: { from: string; to: string }) =>
    hoveredEdge === `${edge.from}-${edge.to}` ||
    (hoveredNode !== null &&
      (edge.from === hoveredNode || edge.to === hoveredNode));

  return (
    <div className="relative overflow-x-auto rounded-md border border-border bg-bg-surface">
      <svg width={width} height={height} className="min-w-full">
        <defs>
          <marker
            id="arrowhead-ok"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={STATUS_STROKE.ok} />
          </marker>
          <marker
            id="arrowhead-mismatch"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={STATUS_STROKE.mismatch} />
          </marker>
          <marker
            id="arrowhead-missing"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={STATUS_STROKE.missing} />
          </marker>
        </defs>

        {edges.map((edge) => {
          const highlighted = isEdgeHighlighted(edge);
          return (
            <g key={edge.id}>
              <path
                d={getEdgePath(edge.from, edge.to)}
                fill="none"
                stroke={STATUS_STROKE[edge.status]}
                strokeWidth={highlighted ? 3 : 2}
                strokeDasharray={STATUS_DASH[edge.status]}
                markerEnd={`url(#arrowhead-${edge.status})`}
                opacity={hoveredEdge && !highlighted ? 0.3 : 1}
                onMouseEnter={() => setHoveredEdge(`${edge.from}-${edge.to}`)}
                onMouseLeave={() => setHoveredEdge(null)}
                className="cursor-pointer transition-all"
              />
              {hoveredEdge === `${edge.from}-${edge.to}` && (
                <g>
                  {(() => {
                    const fromPos = getNodePosition(edge.from);
                    const toPos = getNodePosition(edge.to);
                    const midX = (fromPos.x + NODE_WIDTH + toPos.x) / 2;
                    const midY =
                      (fromPos.y +
                        NODE_HEIGHT / 2 +
                        toPos.y +
                        NODE_HEIGHT / 2) /
                      2;
                    return (
                      <>
                        <rect
                          x={midX - 60}
                          y={midY - 22}
                          width={120}
                          height={24}
                          rx={4}
                          fill="var(--bg-elevated)"
                          stroke="var(--border)"
                        />
                        <text
                          x={midX}
                          y={midY - 6}
                          textAnchor="middle"
                          className="fill-text-secondary text-[10px]"
                        >
                          {edge.label}
                        </text>
                      </>
                    );
                  })()}
                </g>
              )}
            </g>
          );
        })}

        {nodes.map((node) => {
          const isHighlighted =
            hoveredNode === node.id ||
            (hoveredNode !== null &&
              edges.some(
                (e) =>
                  (e.from === hoveredNode && e.to === node.id) ||
                  (e.to === hoveredNode && e.from === node.id),
              ));
          const status = (() => {
            const relatedEdges = edges.filter(
              (e) => e.from === node.id || e.to === node.id,
            );
            if (relatedEdges.some((e) => e.status === "mismatch"))
              return "mismatch";
            if (relatedEdges.some((e) => e.status === "missing"))
              return "missing";
            if (relatedEdges.every((e) => e.status === "ok")) return "ok";
            return "missing";
          })();

          return (
            <g
              key={node.id}
              transform={`translate(${node.pos.x}, ${node.pos.y})`}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => {
                if (node.tab && onSelectTab) onSelectTab(node.tab);
              }}
              className="cursor-pointer"
            >
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={6}
                fill="var(--bg-elevated)"
                stroke={STATUS_STROKE[status]}
                strokeWidth={isHighlighted ? 3 : 2}
                opacity={hoveredNode && !isHighlighted ? 0.4 : 1}
                className="transition-all"
              />
              <g transform="translate(10, 10)">
                <rect
                  width={node.source === "dbc" ? 32 : 28}
                  height={16}
                  rx={8}
                  fill={
                    node.source === "dbc"
                      ? "rgba(168,85,247,0.15)"
                      : "rgba(59,130,246,0.15)"
                  }
                />
                <text
                  x={node.source === "dbc" ? 16 : 14}
                  y={12}
                  textAnchor="middle"
                  className={cn(
                    "text-[9px] font-semibold",
                    node.source === "dbc" ? "fill-purple-400" : "fill-blue-400",
                  )}
                >
                  {node.source.toUpperCase()}
                </text>
              </g>
              <text
                x={NODE_WIDTH / 2}
                y={32}
                textAnchor="middle"
                className="fill-text-primary text-[11px] font-semibold"
              >
                {node.table}
              </text>
              <text
                x={NODE_WIDTH / 2}
                y={50}
                textAnchor="middle"
                className="fill-text-secondary text-[10px]"
              >
                {getNodeValueLabel(node, results)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
