import { useMemo } from "react";
import { useResourceRelationships as useRelationshipReport } from "../hooks/usePatchFlow";
import {
  evaluateRelationship,
  summarizeRelationshipStatus,
} from "../lib/relationships";
import type { RelationshipCheckOut } from "@/shared/types";

/**
 * 关联校验结果。
 *
 * 规则来自后端（唯一真相源）；当传入表单实时值时，用实时值重新求值，
 * 让编辑页在用户改字段时立即反馈。没有实时值时直接用后端对已保存 YAML 的判定。
 */
export function useResourceRelationships(
  resourceType: string,
  resourceId: number | null,
  liveDbc?: Record<string, unknown>,
  liveDb?: Record<string, unknown>,
) {
  const query = useRelationshipReport(resourceType, resourceId);

  const results = useMemo<RelationshipCheckOut[]>(() => {
    const saved = query.data?.relationships ?? [];
    if (!liveDbc || !liveDb) return saved;
    return saved.map((check) => evaluateRelationship(check.rule, liveDbc, liveDb));
  }, [query.data?.relationships, liveDbc, liveDb]);

  const overallStatus = useMemo(
    () => summarizeRelationshipStatus(results),
    [results],
  );

  return { results, overallStatus, isLoading: query.isLoading };
}
