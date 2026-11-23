"""流程步骤定义的前后端防漂移测试。

前端 apps/web/src/features/resources/lib/patch-flow.ts 持有步骤目录，
后端 app/schemas/flow.py 的 FLOW_STEP_IDS 持有同一份列表。
两侧 id 必须一一对应，否则界面上会显示与后端判定不一致的步骤。
"""

from __future__ import annotations

import re

from app.core.config import settings
from app.schemas.flow import FLOW_STEP_IDS

PATCH_FLOW_TS = settings.project_root / "apps/web/src/features/resources/lib/patch-flow.ts"

_ID_PATTERN = re.compile(r'^\s*id:\s*"([a-z0-9-]+)",\s*$', re.MULTILINE)


def _frontend_step_ids() -> list[str]:
    """从前端 patch-flow.ts 中提取步骤 id。"""
    source = PATCH_FLOW_TS.read_text(encoding="utf-8")
    # 只取 PATCH_FLOW_STEPS 数组内的 id，避免混入其它常量
    start = source.index("export const PATCH_FLOW_STEPS")
    end = source.index("export const FLOW_PHASE_LABELS")
    return _ID_PATTERN.findall(source[start:end])


def test_frontend_flow_file_exists() -> None:
    assert PATCH_FLOW_TS.exists(), f"前端流程目录缺失：{PATCH_FLOW_TS}"


def test_step_ids_match_backend() -> None:
    assert _frontend_step_ids() == FLOW_STEP_IDS


def test_step_ids_are_unique() -> None:
    assert len(set(FLOW_STEP_IDS)) == len(FLOW_STEP_IDS)


def test_wizard_step_ids_exist_in_flow() -> None:
    """向导引用的步骤 id 必须存在于完整流程中。"""
    source = PATCH_FLOW_TS.read_text(encoding="utf-8")
    match = re.search(r"WIZARD_FLOW_STEP_IDS\s*=\s*\[(.*?)\]", source, re.DOTALL)
    assert match is not None
    wizard_ids = re.findall(r'"([a-z0-9-]+)"', match.group(1))
    assert wizard_ids
    for step_id in wizard_ids:
        assert step_id in FLOW_STEP_IDS


def test_document_anchors_match_frontend() -> None:
    """总纲文档里的步骤锚点必须与前端 docAnchor 一致。"""
    doc_path = settings.project_root / "docs/workflows/01坐骑生产流程总纲.md"
    assert doc_path.exists(), f"流程总纲缺失：{doc_path}"

    source = PATCH_FLOW_TS.read_text(encoding="utf-8")
    frontend_anchors = re.findall(r'docAnchor:\s*"([^"]+)"', source)
    doc_text = doc_path.read_text(encoding="utf-8")
    doc_anchors = re.findall(r'<a id="([^"]+)"></a>', doc_text)

    # 每个步骤的文档锚点里应包含该步骤的 id，便于人工核对
    assert len(frontend_anchors) == len(FLOW_STEP_IDS)
    for step_id, anchor in zip(FLOW_STEP_IDS, frontend_anchors, strict=True):
        assert step_id in anchor
    assert sorted(doc_anchors) == sorted(frontend_anchors)
