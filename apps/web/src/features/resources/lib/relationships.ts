import { normalizeInt } from "./detail-helpers";

export type RelationshipStatus = "ok" | "mismatch" | "missing";

export interface RelationshipFieldSpec {
  source: "dbc" | "db";
  table: string;
  field: string;
}

export interface RelationshipFieldValue extends RelationshipFieldSpec {
  value: unknown;
}

export interface RelationshipRule {
  key: string;
  name: string;
  description: string;
  fields: RelationshipFieldSpec[];
}

export interface RelationshipResult {
  rule: RelationshipRule;
  status: RelationshipStatus;
  values: RelationshipFieldValue[];
  commonValue: unknown;
}

export interface RelationshipNode {
  id: string;
  source: "dbc" | "db";
  table: string;
  label: string;
  keyValue: { field: string; value: unknown } | null;
  relatedRules: string[];
}

export interface RelationshipEdge {
  id: string;
  from: string;
  to: string;
  fromField: string;
  toField: string;
  status: RelationshipStatus;
  value: unknown;
  ruleKey: string;
}

export const MOUNT_RELATIONSHIPS: RelationshipRule[] = [
  {
    key: "spell_item",
    name: "Spell ↔ Item",
    description: "法术 ID 必须与 item_template.spellid_2 一致",
    fields: [
      { source: "dbc", table: "spell", field: "id" },
      { source: "db", table: "item_template", field: "spellid_2" },
    ],
  },
  {
    key: "model_display",
    name: "Model → Display",
    description: "CreatureModelData.ID 必须与 CreatureDisplayInfo.ModelID 一致",
    fields: [
      { source: "dbc", table: "creature_model_data", field: "id" },
      { source: "dbc", table: "creature_display_info", field: "model_id" },
    ],
  },
  {
    key: "display_template_info",
    name: "Display ↔ Template ↔ ModelInfo",
    description:
      "CreatureDisplayInfo.ID 必须与 creature_template.modelid1 和 creature_model_info.display_id 一致",
    fields: [
      { source: "dbc", table: "creature_display_info", field: "id" },
      { source: "db", table: "creature_template", field: "modelid1" },
      { source: "db", table: "creature_model_info", field: "display_id" },
    ],
  },
  {
    key: "entry_visual",
    name: "Entry ↔ Visual",
    description: "creature_template.entry 必须与 spell.visual_id 一致",
    fields: [
      { source: "db", table: "creature_template", field: "entry" },
      { source: "dbc", table: "spell", field: "visual_id" },
    ],
  },
];

function getFieldValue(
  spec: RelationshipFieldSpec,
  liveDbc: Record<string, unknown>,
  liveDb: Record<string, unknown>,
): unknown {
  const sourceData = spec.source === "dbc" ? liveDbc : liveDb;
  const tableData = sourceData[spec.table] as Record<string, unknown> | undefined;
  return tableData?.[spec.field];
}

export function evaluateRelationship(
  rule: RelationshipRule,
  liveDbc: Record<string, unknown>,
  liveDb: Record<string, unknown>,
): RelationshipResult {
  const values = rule.fields.map((spec) => ({
    ...spec,
    value: getFieldValue(spec, liveDbc, liveDb),
  }));

  const normalizedValues = values.map((v) => normalizeInt(v.value));
  const presentValues = normalizedValues.filter((v) => v !== null);

  let status: RelationshipStatus = "missing";
  let commonValue: unknown = null;

  if (presentValues.length === values.length) {
    const first = presentValues[0];
    const allMatch = presentValues.every((v) => v === first);
    status = allMatch ? "ok" : "mismatch";
    commonValue = allMatch ? first : null;
  } else if (presentValues.length > 1) {
    const first = presentValues[0];
    const allMatch = presentValues.every((v) => v === first);
    status = allMatch ? "missing" : "mismatch";
    commonValue = allMatch ? first : null;
  }

  return { rule, status, values, commonValue };
}

export function evaluateAllRelationships(
  liveDbc: Record<string, unknown>,
  liveDb: Record<string, unknown>,
): RelationshipResult[] {
  return MOUNT_RELATIONSHIPS.map((rule) =>
    evaluateRelationship(rule, liveDbc, liveDb),
  );
}

function nodeId(source: string, table: string): string {
  return `${source}:${table}`;
}

function keyFieldForTable(table: string): string {
  switch (table) {
    case "creature_template":
      return "entry";
    case "creature_model_info":
      return "display_id";
    case "item_template":
      return "entry";
    default:
      return "id";
  }
}

function getKeyValue(
  source: "dbc" | "db",
  table: string,
  liveDbc: Record<string, unknown>,
  liveDb: Record<string, unknown>,
): { field: string; value: unknown } | null {
  const keyField = keyFieldForTable(table);
  const sourceData = source === "dbc" ? liveDbc : liveDb;
  const tableData = sourceData[table] as Record<string, unknown> | undefined;
  if (!tableData) return null;
  return { field: keyField, value: tableData[keyField] };
}

export function buildRelationshipGraph(
  results: RelationshipResult[],
  liveDbc: Record<string, unknown>,
  liveDb: Record<string, unknown>,
): { nodes: RelationshipNode[]; edges: RelationshipEdge[] } {
  const nodeMap = new Map<string, RelationshipNode>();
  const edges: RelationshipEdge[] = [];

  results.forEach((result) => {
    const ruleFields = result.values;
    for (let i = 0; i < ruleFields.length; i++) {
      const field = ruleFields[i];
      const id = nodeId(field.source, field.table);
      if (!nodeMap.has(id)) {
        nodeMap.set(id, {
          id,
          source: field.source,
          table: field.table,
          label: field.table,
          keyValue: getKeyValue(field.source, field.table, liveDbc, liveDb),
          relatedRules: [],
        });
      }
      nodeMap.get(id)!.relatedRules.push(result.rule.key);
    }

    for (let i = 0; i < ruleFields.length - 1; i++) {
      const from = ruleFields[i];
      const to = ruleFields[i + 1];
      edges.push({
        id: `${result.rule.key}-${i}`,
        from: nodeId(from.source, from.table),
        to: nodeId(to.source, to.table),
        fromField: from.field,
        toField: to.field,
        status: result.status,
        value: result.commonValue,
        ruleKey: result.rule.key,
      });
    }
  });

  return { nodes: Array.from(nodeMap.values()), edges };
}
