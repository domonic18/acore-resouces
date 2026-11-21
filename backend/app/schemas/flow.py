"""生产流程状态与资源关联校验的 Pydantic 模型。

本模块定义「坐骑生产流程」9 步的步骤目录（FLOW_STEP_IDS）以及流程状态推导
所需的响应模型。前端 apps/web/src/features/resources/lib/patch-flow.ts 持有同一份
步骤目录，两侧 id 必须一致（由 tests/unit/test_flow_steps.py 断言防漂移）。
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# 坐骑生产流程的步骤 id。顺序即流程顺序，不可随意调整。
#
#   1 select-candidates  筛选候选
#   2 stage-assets       模型贴图就位
#   3 edit-yaml          编辑 YAML
#   4 enrich-official    补全官方数据
#   5 preflight          预检（所见即所得）
#   6 create-jobs        创建补丁任务
#   7 build-patch        构建补丁
#   8 review-artifacts   审查产物
#   9 publish-deploy     发布部署与验收
FLOW_STEP_IDS: list[str] = [
    "select-candidates",
    "stage-assets",
    "edit-yaml",
    "enrich-official",
    "preflight",
    "create-jobs",
    "build-patch",
    "review-artifacts",
    "publish-deploy",
]

# 坐骑导出时不会自动补默认值的必填字段。
# 与前端 apps/web/src/features/resources/requiredFields.ts 的 REQUIRED_FIELD_DEFS 对齐。
REQUIRED_FIELD_DEFS: list[dict[str, str]] = [
    {"path": "dbc.spell.id", "label": "法术 ID"},
    {"path": "dbc.creature_model_data.id", "label": "模型数据 ID"},
    {"path": "dbc.creature_model_data.model_name", "label": "模型路径"},
    {"path": "dbc.item.id", "label": "DBC 物品 ID"},
    {"path": "db.creature_template.entry", "label": "生物 entry"},
    {"path": "db.creature_template.name", "label": "生物名称"},
    {"path": "db.item_template.entry", "label": "物品 entry"},
    {"path": "db.item_template.name", "label": "物品名称"},
]


class MissingRequiredField(BaseModel):
    """一个未填写的必填字段。"""

    path: str
    label: str


class RequiredFieldsReport(BaseModel):
    """必填字段填写情况。"""

    missing: list[MissingRequiredField] = Field(default_factory=list)
    ok: bool = True


class RelationshipFieldOut(BaseModel):
    """关联校验涉及的单个字段值。"""

    source: Literal["dbc", "db"]
    table: str
    field: str
    value: Any | None = None


class RelationshipRuleOut(BaseModel):
    """一条关联规则的定义。"""

    key: str
    name: str
    description: str
    fields: list[RelationshipFieldOut] = Field(default_factory=list)


class RelationshipCheckOut(BaseModel):
    """一条关联规则的校验结果。"""

    rule: RelationshipRuleOut
    status: Literal["ok", "mismatch", "missing"]
    values: list[RelationshipFieldOut] = Field(default_factory=list)
    common_value: Any | None = None


class DuplicateResourceOut(BaseModel):
    """参与 ID 冲突的一个资源。"""

    id: int
    resource_type: str
    model_folder: str
    name: str | None = None


class DuplicateIssueOut(BaseModel):
    """一组重复的全局唯一 ID。"""

    field: str
    value: int
    resources: list[DuplicateResourceOut] = Field(default_factory=list)


class ResourceRelationshipReport(BaseModel):
    """资源的跨数据源关联校验报告。

    overall_status 只反映 relationships；duplicates 单独呈现，
    与既有 CLI / 前端实现的判定口径保持一致。
    """

    resource_type: str
    resource_id: int
    overall_status: Literal["ok", "mismatch", "missing"]
    relationships: list[RelationshipCheckOut] = Field(default_factory=list)
    duplicates: list[DuplicateIssueOut] = Field(default_factory=list)
    required_fields: RequiredFieldsReport = Field(default_factory=RequiredFieldsReport)


class FlowStepState(BaseModel):
    """单个流程步骤的状态。"""

    model_config = ConfigDict(extra="allow")

    step_id: str
    index: int
    status: Literal["pending", "active", "done", "blocked"]
    completed: bool = False
    message: str | None = None
    details: dict[str, Any] | None = None


class ResourceFlowState(BaseModel):
    """一个资源在生产流程中的位置与各步状态。"""

    model_config = ConfigDict(extra="allow")

    resource_type: str
    resource_id: int
    current_step_id: str
    current_step_index: int
    completed: bool = False
    steps: list[FlowStepState] = Field(default_factory=list)
    job: dict[str, Any] | None = None
    validation_passed: bool | None = None
