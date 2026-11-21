import { normalizeInt } from "./detail-helpers";
import type {
  RelationshipCheckOut,
  RelationshipFieldOut,
  RelationshipRuleOut,
} from "@/shared/types";

export type RelationshipStatus = "ok" | "mismatch" | "missing";

/**
 * 关联校验的前端求值。
 *
 * 规则定义（哪几个字段要一致）来自后端
 * GET /api/resources/{type}/{id}/relationships，本文件只负责
 * 拿表单里的实时值跑一遍比较——编辑页需要在用户改字段时立刻反馈，
 * 而后端判定的是已保存的 YAML。
 */

function getFieldValue(
  spec: { source: string; table: string; field: string },
  liveDbc: Record<string, unknown>,
  liveDb: Record<string, unknown>,
): unknown {
  const sourceData = spec.source === "dbc" ? liveDbc : liveDb;
  const tableData = sourceData[spec.table] as
    | Record<string, unknown>
    | undefined;
  return tableData?.[spec.field];
}

/** 按规则求值一组字段，得到与后端同构的校验结果。 */
export function evaluateRelationship(
  rule: RelationshipRuleOut,
  liveDbc: Record<string, unknown>,
  liveDb: Record<string, unknown>,
): RelationshipCheckOut {
  const values: RelationshipFieldOut[] = rule.fields.map((spec) => ({
    source: spec.source,
    table: spec.table,
    field: spec.field,
    value: getFieldValue(spec, liveDbc, liveDb),
  }));

  const normalized = values.map((v) => normalizeInt(v.value));
  const present = normalized.filter((v) => v !== null);

  let status: RelationshipStatus = "missing";
  let commonValue: unknown = null;

  if (present.length === values.length) {
    const first = present[0];
    const allMatch = present.every((v) => v === first);
    status = allMatch ? "ok" : "mismatch";
    commonValue = allMatch ? first : null;
  } else if (present.length > 1) {
    const first = present[0];
    const allMatch = present.every((v) => v === first);
    status = allMatch ? "missing" : "mismatch";
    commonValue = allMatch ? first : null;
  }

  return {
    rule,
    status,
    values,
    common_value: commonValue,
  };
}

/** 汇总多个规则的总体状态。 */
export function summarizeRelationshipStatus(
  results: RelationshipCheckOut[],
): RelationshipStatus {
  if (results.length === 0) return "missing";
  if (results.some((r) => r.status === "mismatch")) return "mismatch";
  if (results.some((r) => r.status === "missing")) return "missing";
  return "ok";
}
