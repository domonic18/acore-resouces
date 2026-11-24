"""补丁任务相关 Pydantic 模型。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

PatchJobStatus = Literal["requested", "generated", "applied", "failed"]


class PatchArtifacts(BaseModel):
    """补丁任务产物清单。"""

    model_config = ConfigDict(extra="allow")

    # builder 裸写 job.json，sql_files 等值为列表，这里只做透传不做结构约束
    output: dict[str, Any] = Field(default_factory=dict)


class PatchJobManifest(BaseModel):
    """单个补丁任务的元数据。

    资源定义的唯一真相源是 data/resources/ 下的 YAML 文件；
    resource_name / resource_model_folder 仅为列表展示用的快照字段。
    """

    model_config = ConfigDict(extra="allow")

    job_id: str
    created_at: str
    created_by: str
    resource_type: str
    resource_id: int
    resource_name: str
    resource_model_folder: str
    status: PatchJobStatus
    updated_at: str | None = None
    artifacts: PatchArtifacts = Field(default_factory=PatchArtifacts)
    completed_at: str | None = None
    summary: str | None = None


class DBCPlanOperation(BaseModel):
    """单个 DBC 文件上的操作。"""

    model_config = ConfigDict(extra="allow")

    action: Literal["add", "edit"]
    record_id: int
    reason: str
    fields: dict[str, Any] = Field(default_factory=dict)


class DBCPlanFile(BaseModel):
    """一个 DBC 文件的修改计划。"""

    model_config = ConfigDict(extra="allow")

    dbc_file: str
    operations: list[DBCPlanOperation] = Field(default_factory=list)


class DBCPlan(BaseModel):
    """DBC 修改计划。"""

    model_config = ConfigDict(extra="allow")

    source_dbc_dir: str
    output_dbc_dir: str
    spell_profile: dict[str, Any] = Field(default_factory=dict)
    plans: list[DBCPlanFile] = Field(default_factory=list)


class SQLPlanTable(BaseModel):
    """SQL 计划中的一张表。"""

    model_config = ConfigDict(extra="allow")

    name: str
    operation: Literal["insert"]
    records: list[dict[str, Any]] = Field(default_factory=list)


class SQLPlan(BaseModel):
    """SQL 生成计划。"""

    model_config = ConfigDict(extra="allow")

    target_database: str
    output_sql_file: str
    tables: list[SQLPlanTable] = Field(default_factory=list)


class PreviewIssue(BaseModel):
    """补丁预览中的一条问题。"""

    severity: Literal["error", "warning"]
    code: str
    message: str
    expected: Any | None = None
    actual: Any | None = None


class PreviewAssetFile(BaseModel):
    """资源目录中的一个文件。"""

    name: str
    relative_path: str
    file_type: str


class PreviewAssets(BaseModel):
    """资源文件就位情况。"""

    model_config = ConfigDict(extra="allow")

    resource_type: str
    resource_id: int
    model_folder: str
    source_dir: str | None = None
    exists: bool = False
    model_name: str | None = None
    texture_variations: list[str | None] = Field(default_factory=list)
    m2_files: list[PreviewAssetFile] = Field(default_factory=list)
    blp_files: list[PreviewAssetFile] = Field(default_factory=list)
    matched_textures: list[PreviewAssetFile] = Field(default_factory=list)
    image_files: list[PreviewAssetFile] = Field(default_factory=list)
    icon_files: list[PreviewAssetFile] = Field(default_factory=list)
    anim_files: list[PreviewAssetFile] = Field(default_factory=list)


class MountPatchPreview(BaseModel):
    """坐骑补丁预览（所见即所得，纯读不落盘）。

    与 dry-run 的区别：本预览在创建补丁任务之前进行，只在内存中计算，
    不写 workspace/patch-jobs/*/plans/。
    """

    model_config = ConfigDict(extra="allow")

    resource_type: str
    resource_id: int
    resource_name: str
    model_folder: str
    dbc_plan: DBCPlan
    sql_plan: SQLPlan
    assets: PreviewAssets
    relationships: list[Any] = Field(default_factory=list)
    duplicates: list[Any] = Field(default_factory=list)
    required_fields: Any = Field(default_factory=dict)
    issues: list[PreviewIssue] = Field(default_factory=list)
    ready: bool = False


class ValidationCheckOut(BaseModel):
    """校验报告中的一项检查。"""

    name: str
    passed: bool
    severity: Literal["error", "warning"]
    expected: Any | None = None
    actual: Any | None = None
    message: str = ""


class ValidationJobOut(BaseModel):
    """校验报告中单个任务的结论。"""

    job_id: str
    mount_name: str = ""
    passed: bool = False
    checks: list[ValidationCheckOut] = Field(default_factory=list)


class ValidationReportOut(BaseModel):
    """校验报告（按批次或按任务切片）。"""

    batch: str | None = None
    generated_at: str | None = None
    batch_size: int = 0
    job_ids: list[str] = Field(default_factory=list)
    all_passed: bool = False
    path: str | None = None
    jobs: list[ValidationJobOut] = Field(default_factory=list)


class JobPlansOut(BaseModel):
    """补丁任务的 DBC/SQL 生成计划。

    source=stored 读 dry-run 落盘的 plans/ 目录；
    source=live  按当前真相源现场重算，不落盘。
    """

    model_config = ConfigDict(extra="allow")

    job_id: str
    source: Literal["stored", "live"]
    dbc_plan: DBCPlan
    sql_plan: SQLPlan
    assets: dict[str, Any] = Field(default_factory=dict)


class ArtifactEntry(BaseModel):
    """一项补丁产物。"""

    kind: str
    label: str
    path: str | None = None
    url: str | None = None
    exists: bool = False
    is_dir: bool = False
    size_bytes: int | None = None


class JobArtifactsOut(BaseModel):
    """补丁任务的产物清单。"""

    job_id: str
    batch: str | None = None
    entries: list[ArtifactEntry] = Field(default_factory=list)


class PatchJobUpdateRequest(BaseModel):
    """更新补丁任务状态请求。"""

    status: PatchJobStatus | None = None
    artifacts: dict[str, Any] | None = None
    summary: str | None = None


class PatchBatchJobAudit(BaseModel):
    """批次内单个任务的审计摘要（文件/表级聚合，不含字段级 before/after）。"""

    model_config = ConfigDict(extra="allow")

    dbc_files: list[dict[str, Any]] = Field(default_factory=list)
    sql_file: str | None = None
    sql_tables: list[dict[str, Any]] = Field(default_factory=list)


class PatchBatchJob(BaseModel):
    """批次内单个任务的精简条目。"""

    model_config = ConfigDict(extra="allow")

    job_id: str
    resource_id: int
    resource_name: str
    status: PatchJobStatus
    completed_at: str | None = None
    summary: str | None = None
    audit: PatchBatchJobAudit | None = None
    has_validation_report: bool = False


class PatchBatch(BaseModel):
    """一次导出构建（MPQ 批次）的聚合视图。

    batch_id 为 MPQ 目录时间戳（YYYYMMDD_HHMMSS）；
    从未构建的任务归入 "pending" 伪批次。
    """

    model_config = ConfigDict(extra="allow")

    batch_id: str
    created_at: str | None = None
    status: PatchJobStatus
    job_count: int
    output: dict[str, Any] = Field(default_factory=dict)
    jobs: list[PatchBatchJob] = Field(default_factory=list)


class BatchCompareFileEntry(BaseModel):
    """两批次 MPQ 中同路径但内容不同的文件差异。"""

    path: str
    sha_base: str | None = None
    sha_against: str | None = None


class BatchCompareJobEntry(BaseModel):
    """两批次坐骑任务对比的单侧条目。"""

    job_id: str
    resource_name: str | None = None


class BatchCompareResult(BaseModel):
    """任选两批次的产物对比结果（基于审计报告的 JSON 归并，不触碰 MPQ）。"""

    base_batch: str
    against_batch: str
    generated_at: str
    files_added: list[str] = Field(default_factory=list)
    files_removed: list[str] = Field(default_factory=list)
    files_replaced: list[BatchCompareFileEntry] = Field(default_factory=list)
    files_unchanged_count: int = 0
    jobs_added: list[BatchCompareJobEntry] = Field(default_factory=list)
    jobs_removed: list[BatchCompareJobEntry] = Field(default_factory=list)
    jobs_common: list[BatchCompareJobEntry] = Field(default_factory=list)
