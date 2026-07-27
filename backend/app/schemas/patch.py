"""补丁任务相关 Pydantic 模型。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

PatchJobStatus = Literal["requested", "generated", "applied", "failed"]


class PatchResourceRef(BaseModel):
    """补丁任务关联的资源引用。"""

    model_config = ConfigDict(extra="ignore")

    type: Literal["mount", "pet", "npc"]
    id: int
    name: str
    model_folder: str


class PatchArtifacts(BaseModel):
    """补丁任务产物清单。"""

    model_config = ConfigDict(extra="allow")

    input: dict[str, str] = Field(default_factory=dict)
    output: dict[str, str] = Field(default_factory=dict)


class PatchJobManifest(BaseModel):
    """单个补丁任务的 manifest。"""

    model_config = ConfigDict(extra="allow")

    job_id: str
    created_at: str
    created_by: str
    resource_type: str
    resource_id: int
    resource_name: str
    resource_model_folder: str
    status: PatchJobStatus
    input_dir: str
    output_dir: str | None = None
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


class PatchJobUpdateRequest(BaseModel):
    """更新补丁任务状态请求。"""

    status: PatchJobStatus | None = None
    artifacts: dict[str, str] | None = None
    summary: str | None = None
