"""补丁批次 changelog 生成：素材组装、AI 起草与模板回退。

构建流程在校验报告落盘后调用 write_changelog：AI 配置启用且有效时由
OpenAI 兼容端点起草「玩家公告 + 维护摘要」两段式中文 markdown，任何
失败（未配置/网络/超时/响应异常）回退代码模板，绝不阻塞构建。
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.ai_config_service import (
    EffectiveAiConfig,
    chat_completions,
    load_effective_config,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "你是魔兽世界私服的补丁公告撰写助手。根据用户给出的结构化批次数据（JSON），"
    "用中文撰写补丁变更日志，输出纯 Markdown 文本（不要用代码块包裹），"
    "结构固定为两段：\n"
    "## 玩家公告\n面向玩家的更新介绍：一两句友好综述，然后列出新增坐骑亮点"
    "（名称加粗，附类型/星级与获取方式，有 Wowhead 链接的用 markdown 链接）。\n"
    "## 维护摘要\n面向服务器维护者的技术摘要：批次号、坐骑与文件统计、校验状态、"
    "SQL 应用说明，用列表呈现关键数字。\n"
    "只使用给定数据，禁止编造任何数值或名称。"
)


def build_context(
    contexts: list[Any],
    sql_files: list[Path],
    manifest: dict[str, Any],
    report_path: Path,
) -> dict[str, Any]:
    """组装 changelog 素材：坐骑列表、文件统计、SQL 清单与校验摘要。"""
    report: dict[str, Any] = {}
    if Path(report_path).is_file():
        try:
            loaded = json.loads(Path(report_path).read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                report = loaded
        except (OSError, json.JSONDecodeError):
            logger.warning("校验报告读取失败，changelog 略过校验摘要：%s", report_path)

    mounts: list[dict[str, Any]] = []
    for ctx in contexts:
        res = ctx.resource
        name = res.official_db.name or ctx.job_id
        drop = None
        if res.drop is not None:
            values = {k: v for k, v in res.drop.model_dump().items() if v not in (None, "", 0)}
            if values:
                drop = values
        mounts.append(
            {
                "job_id": ctx.job_id,
                "name": name,
                "mount_type": res.mount_type,
                "subtype": res.subtype,
                "star_rating": res.star_rating,
                "already_in_game": bool(res.added),
                "item_wowhead_url": res.official_db.item_wowhead_url,
                "acquisition": drop,
            }
        )

    by_kind: dict[str, int] = {}
    for entry in manifest.get("files", []):
        kind = str(entry.get("kind", "asset"))
        by_kind[kind] = by_kind.get(kind, 0) + 1

    sql_rel: list[str] = []
    for f in sql_files:
        try:
            sql_rel.append(Path(f).relative_to(settings.project_root).as_posix())
        except ValueError:
            sql_rel.append(str(f))

    return {
        "batch": manifest.get("batch"),
        "generated_at": datetime.now(UTC).isoformat(),
        "mount_count": len(contexts),
        "mounts": mounts,
        "files": {"total": len(manifest.get("files", [])), "by_kind": by_kind},
        "obfuscation": manifest.get("obfuscation"),
        "sql_files": sql_rel,
        "validation": {
            "all_passed": report.get("all_passed"),
            "failed_jobs": [
                job.get("job_id")
                for job in report.get("jobs", [])
                if isinstance(job, dict) and not job.get("passed")
            ],
        },
    }


def _mount_line(mount: dict[str, Any]) -> str:
    parts: list[str] = [f"**{mount['name']}**"]
    tags = [t for t in (mount.get("mount_type"), mount.get("subtype"), mount.get("star_rating")) if t]
    if tags:
        parts.append(f"（{'·'.join(tags)}）")
    acq = mount.get("acquisition")
    if acq:
        bits = [str(acq.get(k)) for k in ("instance", "boss", "rate") if acq.get(k) is not None]
        if "rate" in acq and acq.get("rate") is not None:
            bits = [b for b in bits if b != str(acq["rate"])]
            bits.append(f"{acq['rate']}% 掉落")
        if bits:
            parts.append(f" — 获取：{' · '.join(bits)}")
    if mount.get("already_in_game"):
        parts.append("（已上线，本次更新资源）")
    url = mount.get("item_wowhead_url")
    if url:
        parts.append(f"（[Wowhead]({url})）")
    return "- " + "".join(parts)


def render_template(ctx: dict[str, Any]) -> str:
    """代码模板生成两段式 markdown（AI 不可用时的回退与兜底格式）。"""
    files = ctx.get("files", {})
    by_kind = files.get("by_kind", {})
    kind_bits = " / ".join(f"{k} {v}" for k, v in sorted(by_kind.items())) or "无"
    mounts = ctx.get("mounts", [])
    validation = ctx.get("validation", {})
    all_passed = validation.get("all_passed")
    failed = [j for j in validation.get("failed_jobs", []) if j]

    lines = [
        f"# 补丁变更日志 {ctx.get('batch') or ''}".rstrip(),
        "",
        f"> 生成时间：{ctx.get('generated_at', '')}｜坐骑 {ctx.get('mount_count', 0)} 只"
        f"｜档案文件 {files.get('total', 0)} 个",
        "",
        "## 玩家公告",
        "",
        f"本批次补丁包含 {ctx.get('mount_count', 0)} 只坐骑的内容更新，新增坐骑可在游戏内"
        "通过对应获取方式入手，已有坐骑的资源文件随本批次一并刷新。",
        "",
    ]
    lines.extend(_mount_line(m) for m in mounts)
    lines += [
        "",
        "## 维护摘要",
        "",
        f"- 批次：`{ctx.get('batch', '')}`",
        f"- 文件统计：共 {files.get('total', 0)} 个（{kind_bits}）",
        f"- 混淆等级：{ctx.get('obfuscation') or 'none'}",
        f"- 校验状态：{'全部通过' if all_passed else ('存在失败项' if all_passed is False else '未知')}",
    ]
    if failed:
        lines.append(f"  - 未通过任务：{', '.join(failed)}")
    sql_files = ctx.get("sql_files", [])
    if sql_files:
        lines.append(f"- SQL（{len(sql_files)} 个，需在服务端 acore_world 执行）：")
        lines.extend(f"  - `{p}`" for p in sql_files)
    else:
        lines.append("- SQL：无新增（所有坐骑 SQL 均已存在）")
    lines += [
        "- MPQ 应用：发布后的 `patch-zhCN-*.mpq` 放入客户端 `Data/` 目录即可生效",
        "",
    ]
    return "\n".join(lines)


def generate_ai(ctx: dict[str, Any], cfg: EffectiveAiConfig) -> str:
    """调用 AI 端点起草 changelog，超时与 max_tokens 由 AI 配置决定。"""
    user_message = "批次数据（JSON）：\n" + json.dumps(ctx, ensure_ascii=False, indent=2)
    return chat_completions(
        cfg,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        timeout=float(cfg.timeout_seconds),
        max_tokens=cfg.max_tokens,
    )


def write_changelog(mpq_dir: Path, ctx: dict[str, Any]) -> str:
    """生成 changelog.md 到批次目录，返回来源（"ai" | "template"）。

    AI 任何失败回退模板并在文首注明原因，不抛异常、不阻塞构建。
    """
    source = "template"
    content = render_template(ctx)
    cfg = load_effective_config()
    if cfg is not None:
        try:
            ai_text = generate_ai(ctx, cfg)
            if ai_text.strip():
                content = ai_text.strip()
                source = "ai"
        except Exception as exc:  # noqa: BLE001 - AI 失败必须回退模板，不能阻塞构建
            logger.warning("changelog AI 生成失败，回退模板：%s", exc)
            content = (
                f"> ⚠️ AI 生成失败，已回退模板：{exc}\n\n" + render_template(ctx)
            )
    target = Path(mpq_dir) / "changelog.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return source
