"""坐骑生产流程状态推导服务。

流程的 9 个步骤定义在 app/schemas/flow.py 的 FLOW_STEP_IDS，
前端 apps/web/src/features/resources/lib/patch-flow.ts 持有同一份目录。

本服务是「这只坐骑现在走到哪一步」的唯一判定方：判据依赖 job.json、
源 DBC 与校验报告等后端状态，前端无法可靠推导。
"""

from __future__ import annotations

from typing import Any

from app.schemas.flow import (
    FLOW_STEP_IDS,
    FlowStepState,
    ResourceFlowState,
)
from app.schemas.resource import Mount
from app.services.mount_preview import build_patch_preview
from app.services.patch_exporter import get_patch_job
from app.services.patch_reports import load_validation_report_by_job
from app.services.resource_validation import compute_required_fields

# 「无官方数据」的豁免标签：补全步骤可显式跳过。
NO_OFFICIAL_DATA_TAG = "no_official_data"


def get_mount_flow_state(resource: Mount) -> ResourceFlowState:
    """推导坐骑在 9 步生产流程中的位置与各步状态。

    Args:
        resource: 目标坐骑资源。

    Returns:
        流程状态，包含每一步的完成情况与当前所处步骤。
    """
    job_id = f"{resource.resource_type}_{resource.id:04d}"
    job = get_patch_job(job_id)
    job_status = job.status if job is not None else None

    steps: list[dict[str, Any]] = []

    # 1 筛选候选：能取到资源即已入册。
    steps.append({"completed": True, "message": "已入册"})

    # 2 模型贴图就位
    assets = build_patch_preview(resource).assets
    assets_ready = bool(assets.exists and assets.m2_files and assets.matched_textures)
    steps.append(
        {
            "completed": assets_ready,
            "message": (
                f"{len(assets.m2_files)} 个模型文件 / {len(assets.matched_textures)} 张匹配贴图"
                if assets.exists
                else f"资源目录不存在：{assets.source_dir or assets.model_folder}"
            ),
        }
    )

    # 3 编辑 YAML
    required_fields = compute_required_fields(resource)
    yaml_ready = required_fields.ok and bool(resource.mount_type)
    steps.append(
        {
            "completed": yaml_ready,
            "message": (
                "必填字段齐全"
                if required_fields.ok
                else f"缺 {len(required_fields.missing)} 个必填字段"
            ),
        }
    )

    # 4 补全官方数据
    official = resource.official_db
    official_ready = (
        bool(official.name and official.spell_wowhead_url and official.item_wowhead_url)
        or NO_OFFICIAL_DATA_TAG in resource.tags
    )
    steps.append(
        {
            "completed": official_ready,
            "message": (
                "已补全"
                if official.name and official.spell_wowhead_url and official.item_wowhead_url
                else (
                    "已标记无官方数据"
                    if NO_OFFICIAL_DATA_TAG in resource.tags
                    else "缺少名称或 Wowhead 链接"
                )
            ),
        }
    )

    # 5 预检
    preview = build_patch_preview(resource)
    steps.append(
        {
            "completed": preview.ready,
            "message": (
                "预检通过"
                if preview.ready
                else f"{sum(1 for i in preview.issues if i.severity == 'error')} 个错误"
            ),
        }
    )

    # 6 创建补丁任务
    job_created = job is not None
    steps.append(
        {
            "completed": job_created,
            "message": f"任务 {job_id}" if job_created else "尚未创建补丁任务",
        }
    )

    # 7 构建补丁
    built = job_status in ("generated", "applied")
    steps.append(
        {
            "completed": built,
            "message": f"任务状态：{job_status}" if job_status else "尚未构建",
        }
    )

    # 8 审查产物
    validation_passed: bool | None = None
    review_message = "尚未构建，暂无校验报告"
    if built and job is not None:
        try:
            report = load_validation_report_by_job(job_id)
        except FileNotFoundError as exc:
            review_message = str(exc)
        else:
            failed = [
                check
                for job_report in report.jobs
                for check in job_report.checks
                if check.severity == "error" and not check.passed
            ]
            validation_passed = not failed
            review_message = (
                "校验全部通过" if validation_passed else f"{len(failed)} 项错误级校验未通过"
            )
    steps.append({"completed": bool(validation_passed), "message": review_message})

    # 9 发布部署与验收
    published = job_status == "applied"
    accepted = resource.debug_passed and resource.added
    deploy_ready = published and accepted
    deploy_message_parts = []
    if not published:
        deploy_message_parts.append("尚未发布")
    if not resource.debug_passed:
        deploy_message_parts.append("未标记调试通过")
    if not resource.added:
        deploy_message_parts.append("未标记已添加")
    steps.append(
        {
            "completed": deploy_ready,
            "message": "已上线" if deploy_ready else "、".join(deploy_message_parts),
        }
    )

    states: list[FlowStepState] = []
    # 全部完成时停留在最后一步；否则停在第一个未完成的步骤。
    current_index = len(FLOW_STEP_IDS) - 1
    current_found = False
    for index, (step_id, step) in enumerate(zip(FLOW_STEP_IDS, steps, strict=True)):
        completed = bool(step["completed"])
        if not completed and not current_found:
            current_index = index
            current_found = True
        states.append(
            FlowStepState(
                step_id=step_id,
                index=index + 1,
                status=(
                    "done" if completed else ("active" if index == current_index else "pending")
                ),
                completed=completed,
                message=step.get("message"),
            )
        )

    return ResourceFlowState(
        resource_type=resource.resource_type,
        resource_id=resource.id,
        current_step_id=FLOW_STEP_IDS[current_index],
        current_step_index=current_index + 1,
        completed=all(state.completed for state in states),
        steps=states,
        job=job.model_dump() if job is not None else None,
        validation_passed=validation_passed,
    )
