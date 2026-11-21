/**
 * 坐骑生产流程的步骤目录——前端唯一的流程定义。
 *
 * 后端 app/schemas/flow.py 的 FLOW_STEP_IDS 持有同一份步骤 id 列表，
 * 状态由后端推导（GET /api/resources/{type}/{id}/flow）；
 * 本文件只负责「有哪些步骤、每步叫什么、怎么呈现」。
 *
 * 两侧 id 必须一致，由 backend/tests/unit/test_flow_steps.py 断言防漂移。
 * 文档见 docs/workflows/01坐骑生产流程总纲.md，各步锚点与 docAnchor 对应。
 */

export type FlowPhase = "prepare" | "edit" | "build" | "ship";

export type FlowAutomation = "manual" | "semi" | "auto";

export type FlowStepStatus = "pending" | "active" | "done" | "blocked";

export interface PatchFlowStep {
  /** kebab-case 唯一 id，必须与后端 FLOW_STEP_IDS 一致 */
  id: string;
  /** 1-based 序号 */
  index: number;
  title: string;
  phase: FlowPhase;
  automation: FlowAutomation;
  /** 一句话说明这一步做什么 */
  summary: string;
  /** 进入该步的前置状态 */
  entryCriteria: string;
  /** 完成的机器可判定判据 */
  exitCriteria: string[];
  /** 产出物 */
  outputs: string[];
  /** 对应文档锚点：docs/workflows/01坐骑生产流程总纲.md#<anchor> */
  docAnchor: string;
}

export const PATCH_FLOW_STEPS: PatchFlowStep[] = [
  {
    id: "select-candidates",
    index: 1,
    title: "筛选候选",
    phase: "prepare",
    automation: "manual",
    summary: "决定本次要做哪些坐骑，并为每只建立 YAML 真相源。",
    entryCriteria: "无（流程起点）。",
    exitCriteria: ["候选坐骑 YAML 已存在于 data/resources/mounts/ 且可被加载"],
    outputs: ["data/resources/mounts/{id:04d}_*.yaml"],
    docAnchor: "step-1-select-candidates",
  },
  {
    id: "stage-assets",
    index: 2,
    title: "模型贴图就位",
    phase: "prepare",
    automation: "manual",
    summary: "把 .m2 模型与 .blp 贴图放入 sources/mounts/{model_folder}/。",
    entryCriteria: "步骤 1 完成。",
    exitCriteria: [
      "资源目录存在且含至少 1 个 .m2 模型文件",
      "与贴图变体匹配的 .blp 文件非空",
      "model_folder 为纯 ASCII 且不含空格",
    ],
    outputs: ["sources/mounts/{model_folder}/**"],
    docAnchor: "step-2-stage-assets",
  },
  {
    id: "edit-yaml",
    index: 3,
    title: "编辑 YAML",
    phase: "edit",
    automation: "manual",
    summary: "填写 DBC/DB 字段、坐骑类型与特殊功能。",
    entryCriteria: "步骤 2 完成。",
    exitCriteria: [
      "8 项必填字段全部非空",
      "mount_type 已选择",
      "special_features 取值均在受控词表内",
    ],
    outputs: ["data/resources/mounts/{id:04d}_*.yaml"],
    docAnchor: "step-3-edit-yaml",
  },
  {
    id: "enrich-official",
    index: 4,
    title: "补全官方数据",
    phase: "edit",
    automation: "semi",
    summary: "用 Wowhead 查询补全名称、图标与官方链接。",
    entryCriteria: "步骤 3 完成。",
    exitCriteria: [
      "official_db.name / spell_wowhead_url / item_wowhead_url 三者非空",
      "或显式打上 no_official_data 标签豁免",
    ],
    outputs: ["YAML official_db 块"],
    docAnchor: "step-4-enrich-official",
  },
  {
    id: "preflight",
    index: 5,
    title: "预检",
    phase: "edit",
    automation: "auto",
    summary: "预览将要写入的 DBC/SQL 记录并跑完关联校验。",
    entryCriteria: "步骤 4 完成。",
    exitCriteria: [
      "4 条关联校验全部 ok",
      "DBC/SQL 计划可成功生成",
      "全局唯一 ID 无重复",
      "计划中的 DBC 记录 ID 未被源 DBC 占用",
    ],
    outputs: ["预览结果（不落盘）"],
    docAnchor: "step-5-preflight",
  },
  {
    id: "create-jobs",
    index: 6,
    title: "创建补丁任务",
    phase: "build",
    automation: "auto",
    summary: "为每只候选坐骑创建 workspace/patch-jobs/mount_XXXX/job.json。",
    entryCriteria: "步骤 5 通过。",
    exitCriteria: ["每个候选都有 job.json 且 status 为 requested"],
    outputs: ["workspace/patch-jobs/{job_id}/job.json"],
    docAnchor: "step-6-create-jobs",
  },
  {
    id: "build-patch",
    index: 7,
    title: "构建补丁",
    phase: "build",
    automation: "auto",
    summary: "批量写入 DBC 记录、生成 SQL、打包 MPQ 并产出校验/审计报告。",
    entryCriteria: "步骤 6 完成。",
    exitCriteria: [
      "job.json status 为 generated",
      "artifacts.output 同时含 mpq / sql_files / validation_report / audit",
    ],
    outputs: [
      "data/wow-dbc/src/dbc/*.dbc",
      "data/sql/azerothcore-updates/mounts/{id:04d}_{slug}/*.sql",
      "workspace/mpq/{batch}/patch-mounts.mpq",
      "workspace/reports/{batch}/validation-report.json",
      "workspace/reports/{batch}/audit-report.json",
    ],
    docAnchor: "step-7-build-patch",
  },
  {
    id: "review-artifacts",
    index: 8,
    title: "审查产物",
    phase: "ship",
    automation: "manual",
    summary: "逐条查看校验报告与审计报告，确认将要落库/落客户端的内容。",
    entryCriteria: "步骤 7 完成。",
    exitCriteria: [
      "校验报告中该任务的 error 级检查全部 passed",
      "审计报告含该任务的 DBC 字段级 before/after",
    ],
    outputs: ["人工审查结论"],
    docAnchor: "step-8-review-artifacts",
  },
  {
    id: "publish-deploy",
    index: 9,
    title: "发布部署与验收",
    phase: "ship",
    automation: "manual",
    summary: "发布 MPQ 到 dist，部署 SQL 与客户端补丁，实测后勾选调试通过/已添加。",
    entryCriteria: "步骤 8 通过。",
    exitCriteria: [
      "workspace/dist/{batch}/patch-zhCN-{N}.mpq 存在",
      "job.json status 为 applied",
      "资源 YAML 的 debug_passed 与 added 均为 true",
    ],
    outputs: ["workspace/dist/{batch}/patch-zhCN-{N}.mpq", "资源状态位"],
    docAnchor: "step-9-publish-deploy",
  },
];

export const FLOW_PHASE_LABELS: Record<FlowPhase, string> = {
  prepare: "素材准备",
  edit: "编辑与预检",
  build: "构建",
  ship: "审查与发布",
};

export const FLOW_AUTOMATION_LABELS: Record<FlowAutomation, string> = {
  manual: "人工",
  semi: "半自动",
  auto: "自动",
};

/** 导出向导覆盖的子流程：全流程的第 6~9 步 */
export const WIZARD_FLOW_STEP_IDS = [
  "create-jobs",
  "build-patch",
  "review-artifacts",
  "publish-deploy",
] as const;

/** 向导内部步骤下标 ← 全流程步骤 id */
export const WIZARD_STEP_INDEX: Record<string, number> = {
  "create-jobs": 0,
  "build-patch": 1,
  "review-artifacts": 2,
  "publish-deploy": 3,
};

export function getFlowStep(id: string): PatchFlowStep | undefined {
  return PATCH_FLOW_STEPS.find((step) => step.id === id);
}

export function getFlowStepIndex(id: string): number {
  return PATCH_FLOW_STEPS.findIndex((step) => step.id === id);
}

export function getWizardFlowSteps(): PatchFlowStep[] {
  return WIZARD_FLOW_STEP_IDS.map((id) => getFlowStep(id)).filter(
    (step): step is PatchFlowStep => step !== undefined,
  );
}

/** 全流程文档地址，供界面提供「查看完整流程」入口 */
export const FLOW_DOC_URL =
  "docs/workflows/01坐骑生产流程总纲.md";
