import type { DbcRecordDetail } from "@/shared/types";

export interface DbcDiffRow {
  name: string;
  type: string;
  a: unknown;
  b: unknown;
  same: boolean;
}

export function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

/** 按字段名配对两条记录的全字段值，同 schema 顺序一致；防御性用 name 索引 */
export function computeRecordDiff(
  a: DbcRecordDetail,
  b: DbcRecordDetail,
): DbcDiffRow[] {
  const bByName = new Map(b.fields.map((f) => [f.name, f]));
  return a.fields.map((fieldA) => {
    const fieldB = bByName.get(fieldA.name);
    const valueB = fieldB ? fieldB.value : undefined;
    return {
      name: fieldA.name,
      type: fieldA.type,
      a: fieldA.value,
      b: valueB,
      same: fieldA.value === valueB,
    };
  });
}

export interface DiffTextParams {
  file: string;
  recordAId: number;
  recordBId: number;
  labelA: string | null;
  labelB: string | null;
  totalFields: number;
  diffCount: number;
  visibleRows: DbcDiffRow[];
  scopeLabel: string;
}

/** 生成供外部 AI 分析的纯文本对比内容（跟随当前过滤/搜索范围） */
export function formatDiffText(params: DiffTextParams): string {
  const {
    file,
    recordAId,
    recordBId,
    labelA,
    labelB,
    totalFields,
    diffCount,
    visibleRows,
    scopeLabel,
  } = params;

  const header = [
    `# DBC 记录对比：${file}`,
    `A：#${recordAId}${labelA ? ` ${labelA}` : ""}`,
    `B：#${recordBId}${labelB ? ` ${labelB}` : ""}`,
    `全字段 ${totalFields} · 不同 ${diffCount} · 相同 ${totalFields - diffCount}`,
    `导出内容：${scopeLabel}，共 ${visibleRows.length} 个字段`,
  ];

  const diffRows = visibleRows.filter((r) => !r.same);
  const sameRows = visibleRows.filter((r) => r.same);

  const sections: string[] = [];
  if (diffRows.length > 0) {
    sections.push(
      ["## 不同字段", ...diffRows.map(
        (r) => `- ${r.name} (${r.type})：A=${formatDiffValue(r.a)} / B=${formatDiffValue(r.b)}`,
      )].join("\n"),
    );
  }
  if (sameRows.length > 0) {
    sections.push(
      ["## 相同字段", ...sameRows.map(
        (r) => `- ${r.name} (${r.type})：${formatDiffValue(r.a)}`,
      )].join("\n"),
    );
  }

  return [...header, "", ...sections.join("\n\n")].join("\n").trim() + "\n";
}
