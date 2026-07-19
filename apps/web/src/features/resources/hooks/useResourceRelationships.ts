import { useMemo } from "react";
import {
  evaluateAllRelationships,
  buildRelationshipGraph,
} from "../lib/relationships";
import type { RelationshipResult } from "../lib/relationships";

export function useResourceRelationships(
  liveDbc: Record<string, unknown>,
  liveDb: Record<string, unknown>,
) {
  const results = useMemo<RelationshipResult[]>(
    () => evaluateAllRelationships(liveDbc, liveDb),
    [liveDbc, liveDb],
  );

  const graph = useMemo(
    () => buildRelationshipGraph(results, liveDbc, liveDb),
    [results, liveDbc, liveDb],
  );

  const overallStatus = useMemo(() => {
    if (results.length === 0) return "missing" as const;
    if (results.some((r) => r.status === "mismatch"))
      return "mismatch" as const;
    if (results.some((r) => r.status === "missing")) return "missing" as const;
    return "ok" as const;
  }, [results]);

  return { results, graph, overallStatus };
}
