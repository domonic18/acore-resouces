"""changelog_writer 单元测试：素材组装、模板回退与 AI 起草。"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.core.config import settings
from app.schemas.resource import DropInfo, Mount, OfficialDbInfo
from app.services import changelog_writer
from app.services.ai_config_service import EffectiveAiConfig


def _mount_ctx(
    job_id: str = "mount_0146",
    name: str = "云翼角鹰兽",
    drop: DropInfo | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        job_id=job_id,
        resource=Mount(
            id=146,
            model_folder="Hippogryph2",
            official_db=OfficialDbInfo(
                name=name, item_wowhead_url="https://www.wowhead.com/cn/item=147806"
            ),
            drop=drop or DropInfo(),
        ),
    )


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    monkeypatch.setattr(settings, "project_root", tmp_path)
    return tmp_path


def _report(tmp_path: Path, all_passed: bool = True) -> Path:
    path = tmp_path / "validation-report.json"
    path.write_text(
        json.dumps(
            {
                "all_passed": all_passed,
                "batch_size": 1,
                "jobs": [{"job_id": "mount_0146", "passed": all_passed}],
            }
        ),
        encoding="utf-8",
    )
    return path


def _manifest() -> dict[str, Any]:
    return {
        "batch": "20260908_023938",
        "obfuscation": "none",
        "files": [
            {"path": "DBFilesClient/Spell.dbc", "kind": "dbc"},
            {"path": "creature/Hippogryph2/x.m2", "kind": "asset"},
            {"path": "Interface/Icons/x.blp", "kind": "icon"},
        ],
    }


def test_build_context_collects_materials(env: Path) -> None:
    sql = env / "data/sql/mounts/0146_Hippogryph2/0146_mount_add.sql"
    ctx_obj = _mount_ctx(drop=DropInfo(instance="旋云之巅", boss="阿尔泰鲁斯", rate=0.05))

    ctx = changelog_writer.build_context(
        [ctx_obj], [sql], _manifest(), _report(env)
    )

    assert ctx["batch"] == "20260908_023938"
    assert ctx["mount_count"] == 1
    mount = ctx["mounts"][0]
    assert mount["name"] == "云翼角鹰兽"
    assert mount["acquisition"] is not None
    assert mount["acquisition"]["boss"] == "阿尔泰鲁斯"
    assert ctx["files"] == {"total": 3, "by_kind": {"dbc": 1, "asset": 1, "icon": 1}}
    assert ctx["sql_files"] == ["data/sql/mounts/0146_Hippogryph2/0146_mount_add.sql"]
    assert ctx["validation"]["all_passed"] is True


def test_render_template_two_sections(env: Path) -> None:
    sql = env / "data/sql/mounts/0146_Hippogryph2/0146_mount_add.sql"
    ctx = changelog_writer.build_context([_mount_ctx()], [sql], _manifest(), _report(env))

    text = changelog_writer.render_template(ctx)

    assert "## 玩家公告" in text
    assert "## 维护摘要" in text
    assert "**云翼角鹰兽**" in text
    assert "Wowhead" in text
    assert "20260908_023938" in text
    assert "dbc 1" in text
    assert "全部通过" in text
    assert "0146_mount_add.sql" in text


def test_write_changelog_template_fallback(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(changelog_writer, "load_effective_config", lambda: None)
    ctx = changelog_writer.build_context(
        [_mount_ctx()], [], _manifest(), _report(env, all_passed=False)
    )
    out = env / "batch"

    source = changelog_writer.write_changelog(out, ctx)

    assert source == "template"
    content = (out / "changelog.md").read_text(encoding="utf-8")
    assert "存在失败项" in content
    assert "无新增" in content  # sql_files 为空时的维护摘要


def test_write_changelog_ai_success(env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        changelog_writer,
        "load_effective_config",
        lambda: EffectiveAiConfig(
            base_url="https://x", api_key="sk", model="m", enabled=True
        ),
    )
    monkeypatch.setattr(
        changelog_writer, "generate_ai", lambda ctx, cfg: "# AI 公告\n\n内容"
    )
    ctx = changelog_writer.build_context([_mount_ctx()], [], _manifest(), _report(env))

    source = changelog_writer.write_changelog(env / "batch", ctx)

    assert source == "ai"
    assert (env / "batch" / "changelog.md").read_text(encoding="utf-8") == "# AI 公告\n\n内容"


def test_generate_ai_uses_configured_params(monkeypatch: pytest.MonkeyPatch) -> None:
    """超时与 max_tokens 取自 AI 配置，而非模块常量。"""
    captured: dict[str, Any] = {}

    def _fake_chat(
        cfg: EffectiveAiConfig,
        messages: list[dict[str, str]],
        *,
        timeout: float,
        max_tokens: int,
        temperature: float = 0.3,
    ) -> str:
        captured["timeout"] = timeout
        captured["max_tokens"] = max_tokens
        return "ok"

    monkeypatch.setattr(changelog_writer, "chat_completions", _fake_chat)
    cfg = EffectiveAiConfig(
        base_url="https://x", api_key="sk", model="m",
        timeout_seconds=300, max_tokens=8000, enabled=True,
    )
    changelog_writer.generate_ai({"batch": "b"}, cfg)
    assert captured["timeout"] == 300.0
    assert captured["max_tokens"] == 8000


def test_write_changelog_ai_failure_falls_back(
    env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        changelog_writer,
        "load_effective_config",
        lambda: EffectiveAiConfig(base_url="https://x", api_key="sk", model="m", enabled=True),
    )

    def _boom(ctx: dict[str, Any], cfg: EffectiveAiConfig) -> str:
        raise RuntimeError("endpoint down")

    monkeypatch.setattr(changelog_writer, "generate_ai", _boom)
    ctx = changelog_writer.build_context([_mount_ctx()], [], _manifest(), _report(env))

    source = changelog_writer.write_changelog(env / "batch", ctx)

    assert source == "template"
    content = (env / "batch" / "changelog.md").read_text(encoding="utf-8")
    assert "AI 生成失败" in content and "endpoint down" in content
    assert "## 玩家公告" in content
