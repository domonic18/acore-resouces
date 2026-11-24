"""补丁预览服务（所见即所得）。

在创建补丁任务之前，纯读地计算「这次构建会往 DBC / SQL 写入什么」，
并把关联一致性、ID 冲突、资源文件缺失等问题一次列清。

与 dry-run 的区别：
- dry-run（patch build --dry-run）需要先有 job.json，会往
  workspace/patch-jobs/*/plans/ 落盘；
- 本预览不落盘、不建任务，只在内存中计算，因此可以放在流程的第 5 步。
"""

from __future__ import annotations

from typing import Any

from app.schemas.flow import DuplicateIssueOut, RelationshipCheckOut, RequiredFieldsReport
from app.schemas.patch import (
    DBCPlan,
    MountPatchPreview,
    PreviewAssets,
    PreviewIssue,
    SQLPlan,
)
from app.schemas.resource import Resource
from app.services.mount_patch_builder import (
    find_existing_dbc_records,
    sanitize_model_folder,
)
from app.services.patch_exporter import (
    build_assets_json,
    build_dbc_plan,
    build_sql_plan,
)
from app.services.resource_store import list_resources
from app.services.resource_validation import (
    check_duplicate_resource_ids,
    check_resource_relationships,
    compute_required_fields,
    duplicate_issues_to_out,
    relationship_checks_to_out,
)


def build_patch_preview(
    resource: Resource,
    id_cache: dict[str, set[int]] | None = None,
    all_resources: list[Resource] | None = None,
) -> MountPatchPreview:
    """构建补丁预览。

    Args:
        resource: 目标资源。
        id_cache: 跨调用复用的「DBC 文件名 → 已占用 ID 集合」缓存。
            批量预览时传入可避免重复加载 DBC 文件。
        all_resources: 全部同类型资源，用于 ID 查重。
            批量预览时传入可避免重复读取全部 YAML。

    Returns:
        包含 DBC 计划、SQL 计划、资源文件、关联校验与问题列表的预览结果。
    """
    issues: list[PreviewIssue] = []

    relationships = relationship_checks_to_out(check_resource_relationships(resource))

    resources = (
        all_resources if all_resources is not None else list_resources(resource.resource_type)
    )
    duplicates: list[DuplicateIssueOut] = duplicate_issues_to_out(
        check_duplicate_resource_ids(resources, focus_resource=resource),
        resources,
    )

    required_fields = compute_required_fields(resource)

    dbc_plan, sql_plan = _build_plans(resource, issues)

    for occupied in find_existing_dbc_records(dbc_plan, id_cache):
        if occupied["exists"]:
            issues.append(
                PreviewIssue(
                    severity="warning",
                    code="dbc_record_exists",
                    message=(
                        f"{occupied['dbc_file']} #{occupied['record_id']} 已存在，"
                        "构建时会被跳过（不覆盖已有记录）"
                    ),
                    actual=occupied["record_id"],
                )
            )

    assets = PreviewAssets(**build_assets_json(resource))
    _check_assets(assets, issues)

    for check in relationships:
        if check.status == "mismatch":
            issues.append(
                PreviewIssue(
                    severity="error",
                    code=f"relationship_{check.rule.key}",
                    message=f"{check.rule.name} 不一致：{check.rule.description}",
                    expected=check.common_value,
                )
            )
        elif check.status == "missing":
            issues.append(
                PreviewIssue(
                    severity="warning",
                    code=f"relationship_{check.rule.key}",
                    message=f"{check.rule.name} 缺少字段：{check.rule.description}",
                )
            )

    for duplicate in duplicates:
        names = ", ".join(f"{r.id:04d}-{r.model_folder}" for r in duplicate.resources)
        issues.append(
            PreviewIssue(
                severity="error",
                code="duplicate_id",
                message=f"{duplicate.field}={duplicate.value} 与其它资源重复：{names}",
                actual=duplicate.value,
            )
        )

    for field in required_fields.missing:
        issues.append(
            PreviewIssue(
                severity="error",
                code="missing_required_field",
                message=f"必填字段未填写：{field.label}（{field.path}）",
            )
        )

    ready = not any(issue.severity == "error" for issue in issues)

    return MountPatchPreview(
        resource_type=resource.resource_type,
        resource_id=resource.id,
        resource_name=resource.official_db.name or resource.model_folder,
        model_folder=resource.model_folder,
        dbc_plan=dbc_plan,
        sql_plan=sql_plan,
        assets=assets,
        relationships=relationships,
        duplicates=duplicates,
        required_fields=required_fields,
        issues=issues,
        ready=ready,
    )


def _build_plans(
    resource: Resource,
    issues: list[PreviewIssue],
) -> tuple[DBCPlan, SQLPlan]:
    """生成 DBC/SQL 计划；生成失败时降级为空计划并记录问题。

    计划生成可能因特性冲突抛 ValueError（例如同时标注「水面行走」与
    「水下骑乘」，两者争用法术第三效果槽位）。这属于预检不通过而非
    请求错误，因此降级处理而不是向上抛。
    """
    try:
        return build_dbc_plan(resource), build_sql_plan(resource)
    except ValueError as exc:
        issues.append(
            PreviewIssue(
                severity="error",
                code="plan_generation_failed",
                message=f"DBC/SQL 计划生成失败：{exc}",
            )
        )
        return (
            DBCPlan(source_dbc_dir="", output_dbc_dir="", plans=[]),
            SQLPlan(target_database="", output_sql_file="", tables=[]),
        )


def _check_assets(assets: PreviewAssets, issues: list[PreviewIssue]) -> None:
    """检查资源文件是否就位。"""
    if not assets.exists:
        issues.append(
            PreviewIssue(
                severity="error",
                code="assets_missing",
                message=f"资源目录不存在：{assets.source_dir or assets.model_folder}",
            )
        )
        return

    if not assets.m2_files:
        issues.append(
            PreviewIssue(
                severity="error",
                code="m2_missing",
                message=f"资源目录内未找到 .m2 模型文件：{assets.source_dir}",
            )
        )

    if not assets.matched_textures:
        issues.append(
            PreviewIssue(
                severity="warning",
                code="textures_unmatched",
                message="未找到与贴图变体匹配的 .blp 文件，资源将使用默认贴图",
            )
        )

    sanitized = sanitize_model_folder(assets.model_folder)
    if sanitized != assets.model_folder:
        issues.append(
            PreviewIssue(
                severity="warning",
                code="model_folder_not_sanitized",
                message=(f"model_folder 含中文或空格，构建时会自动清理为 {sanitized}"),
                expected=sanitized,
                actual=assets.model_folder,
            )
        )


def build_patch_previews(resources: list[Resource]) -> list[MountPatchPreview]:
    """批量构建补丁预览。

    与逐个调用 :func:`build_patch_preview` 等价，但共享 DBC 占用 ID 缓存——
    每个 DBC 文件只加载一次，批量场景下快一个数量级。

    Args:
        resources: 目标资源列表（同一类型）。

    Returns:
        与入参顺序一致的预览结果列表。
    """
    id_cache: dict[str, set[int]] = {}
    all_resources = list_resources(resources[0].resource_type) if resources else []
    return [build_patch_preview(resource, id_cache, all_resources) for resource in resources]


def preview_relationship_report(resource: Resource) -> dict[str, Any]:
    """返回资源的关联校验摘要（不含 DBC/SQL 计划）。

    Args:
        resource: 目标资源。

    Returns:
        关联校验结果与重复 ID 列表。
    """
    relationships: list[RelationshipCheckOut] = relationship_checks_to_out(
        check_resource_relationships(resource)
    )
    all_resources = list_resources(resource.resource_type)
    duplicates = duplicate_issues_to_out(
        check_duplicate_resource_ids(all_resources, focus_resource=resource),
        all_resources,
    )
    required_fields: RequiredFieldsReport = compute_required_fields(resource)
    return {
        "relationships": relationships,
        "duplicates": duplicates,
        "required_fields": required_fields,
    }
