"""坐骑客户端资源闭包静态审计。

在启动游戏客户端之前，把「YAML → DBC → M2 贴图表 → 模型目录 .blp」这条链路上
会导致**模型发白**或**坐骑不出现**的问题静态查出来。

三层检查：

1. **DBC 闭包**：YAML 声明的 CreatureModelData / CreatureDisplayInfo 行是否真实
   存在于 data/wow-dbc 的 DBC 文件中，且 ModelName / ModelID / TextureVariation
   与 YAML 一致——DBC 是客户端实际读取的内容，YAML 只是真相源。
2. **资源闭包**：模型目录、.m2 模型文件、.skin 文件是否就位。
3. **贴图闭包**：M2 贴图表中两类引用的 .blp 是否都能解析到：
   - type 0：硬编码路径，文件名被清零或文件不在模型目录 → 必白模；
   - type 11/12/13：TextureVariation_1/2/3 替换槽，槽位为空或对应 .blp
     不在模型目录 → 替换槽失效，同样白模。

背景：坐骑验证此前完全依赖用户开 Windows 客户端，客户端才会把贴图解析失败
渲染成白色，仓库内没有任何环节能提前发现。本模块把该环节前移。
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.preview.asset_resolver import resolve_resource_dir
from app.preview.m2_reader import M2Metadata, read_m2_metadata, read_skin_texture_usage
from app.schemas.resource import Mount
from app.services.dbc_reader import DbcFileNotFoundError, DbcUnreadableError, query_records

logger = logging.getLogger(__name__)

# 上线 SQL 目录（AzerothCore updates 目录下的 mounts 子目录）
SQL_MOUNTS_DIR = settings.sql_mounts_dir

SEVERITY_ERROR = "error"
SEVERITY_WARNING = "warning"

# M2 贴图类型 → CreatureDisplayInfo 的 TextureVariation 槽位序号
TEXTURE_VARIATION_SLOTS: dict[int, int] = {11: 1, 12: 2, 13: 3}

# 客户端资源根前缀：MPQ 内模型路径形如 creature\<子目录>\<模型>.m2
MPQ_CREATURE_ROOT = "creature"


@dataclass(frozen=True)
class AuditIssue:
    """单条审计问题。"""

    severity: str
    code: str
    message: str

    @property
    def is_error(self) -> bool:
        """是否为阻断性问题。"""
        return self.severity == SEVERITY_ERROR


@dataclass
class MountAuditResult:
    """单个坐骑的审计结果。"""

    resource_id: int
    model_folder: str
    model_name: str
    texture_variations: tuple[str, ...] = ()
    issues: list[AuditIssue] = field(default_factory=list)

    @property
    def errors(self) -> list[AuditIssue]:
        """阻断性问题列表。"""
        return [issue for issue in self.issues if issue.is_error]

    @property
    def warnings(self) -> list[AuditIssue]:
        """提示性问题列表。"""
        return [issue for issue in self.issues if not issue.is_error]


@dataclass
class MountAuditReport:
    """全部坐骑的审计结果汇总。"""

    results: list[MountAuditResult] = field(default_factory=list)

    @property
    def error_count(self) -> int:
        """阻断性问题总数。"""
        return sum(len(result.errors) for result in self.results)

    @property
    def warning_count(self) -> int:
        """提示性问题总数。"""
        return sum(len(result.warnings) for result in self.results)

    @property
    def failed_mounts(self) -> list[MountAuditResult]:
        """存在阻断性问题的坐骑。"""
        return [result for result in self.results if result.errors]


class DbcLookup:
    """DBC 记录查询缓存。

    CreatureModelData / CreatureDisplayInfo 体积不大，整表载入后按 ID 建索引，
    避免批量审计时反复解析同一文件。
    """

    def __init__(self) -> None:
        self._indexes: dict[str, dict[int, dict[str, Any]]] = {}
        self._unavailable: set[str] = set()

    def get(self, dbc_file: str, record_id: int | None) -> dict[str, Any] | None:
        """按 ID 取记录；DBC 缺失或记录不存在时返回 None。"""
        if not record_id or record_id <= 0:
            return None
        index = self._indexes.get(dbc_file)
        if index is None:
            if dbc_file in self._unavailable:
                return None
            index = self._build_index(dbc_file)
            if index is None:
                self._unavailable.add(dbc_file)
                return None
            self._indexes[dbc_file] = index
        return index.get(record_id)

    def _build_index(self, dbc_file: str) -> dict[int, dict[str, Any]] | None:
        """载入整表并按 ID 建索引；文件缺失时返回 None。"""
        try:
            result = query_records(dbc_file, page_size=1)
        except (DbcFileNotFoundError, DbcUnreadableError) as exc:
            logger.warning("DBC 不可用，跳过相关校验：%s（%s）", dbc_file, exc)
            return None

        index: dict[int, dict[str, Any]] = {}
        page = 1
        total = result["total"]
        while True:
            page_result = query_records(dbc_file, page=page, page_size=1000)
            for item in page_result["items"]:
                record_id = item.get("ID")
                if isinstance(record_id, int):
                    index[record_id] = item
            if page * page_result["page_size"] >= total:
                break
            page += 1
        return index


def _split_mpq_path(path: str) -> tuple[str, str]:
    """把客户端资源路径拆成 (目录, 文件名)，目录统一用反斜杠小写。"""
    normalized = path.replace("/", "\\").strip("\\")
    if "\\" in normalized:
        directory, _, filename = normalized.rpartition("\\")
    else:
        directory, filename = "", normalized
    return directory.lower(), filename


def _build_file_index(directory: Path) -> dict[str, str]:
    """建立目录内文件名（小写）→ 实际文件名的索引。

    客户端按大小写不敏感的方式解析 MPQ 内的文件名，而本地文件系统区分大小写，
    因此校验 .blp 是否存在必须走这个索引，否则 CAMELMOUNT_WHITE 与
    camelmount_white.blp 会被误判成缺失。
    """
    index: dict[str, str] = {}
    try:
        entries = list(directory.iterdir())
    except OSError:
        return index
    for entry in entries:
        if entry.is_file():
            index.setdefault(entry.name.lower(), entry.name)
    return index


def _resolve_model_file(model_dir: Path, model_name: str) -> tuple[Path | None, Path]:
    """定位模型目录内的 .m2 文件。

    Args:
        model_dir: 原始资源目录（sources/mounts/<model_folder>）。
        model_name: YAML 声明的模型路径（creature\\<子目录>\\<模型>.m2）。

    Returns:
        (模型文件路径或 None, 模型文件相对 model_dir 的目录)。文件找不到时
        路径为 None。
    """
    parts = [part for part in model_name.replace("/", "\\").split("\\") if part]
    if not parts:
        return None, model_dir

    relative = Path(*parts[1:]) if parts[0].lower() == MPQ_CREATURE_ROOT else Path(*parts)
    candidate = model_dir / relative
    if candidate.is_file():
        return candidate, candidate.parent.relative_to(model_dir)

    # 回退：模型子目录名与 MPQ 路径不一致时，按文件名在模型目录内查找。
    matches = [path for path in model_dir.rglob(parts[-1]) if path.is_file()]
    if len(matches) == 1:
        return matches[0], matches[0].parent.relative_to(model_dir)
    return None, model_dir


def _audit_dbc(
    mount: Mount,
    lookup: DbcLookup,
    deployed: bool,
    issues: list[AuditIssue],
) -> dict[int, str]:
    """校验 YAML 声明的 DBC 行，返回各替换槽实际生效的 TextureVariation 值。

    Args:
        mount: 坐骑资源。
        lookup: DBC 查询缓存。
        deployed: 该坐骑是否已生成过上线 SQL——已上线却没有 DBC 行是阻断性
            问题，尚未上线则只是提示。
        issues: 问题收集列表。

    Returns:
        {槽位序号: CreatureDisplayInfo 里的 TextureVariation 值}；DBC 不可用时
        返回空字典，交由 YAML 值兜底。
    """
    cmd = mount.dbc.creature_model_data
    cdi = mount.dbc.creature_display_info
    missing_severity = SEVERITY_ERROR if deployed else SEVERITY_WARNING

    cmd_row = lookup.get("CreatureModelData.dbc", cmd.id)
    if cmd.id and cmd_row is None:
        issues.append(
            AuditIssue(
                missing_severity,
                "dbc_cmd_missing",
                f"CreatureModelData.dbc 中不存在 ID={cmd.id}"
                + (
                    "（已上线却没有 DBC 行 → 客户端加载不到该模型）" if deployed else "（尚未上线）"
                ),
            )
        )
    elif cmd_row is not None:
        dbc_model_name = str(cmd_row.get("ModelName") or "")
        if cmd.model_name and dbc_model_name.lower() != cmd.model_name.lower():
            issues.append(
                AuditIssue(
                    SEVERITY_ERROR,
                    "dbc_cmd_model_name_mismatch",
                    f"CreatureModelData#{cmd.id}.ModelName 与 YAML 不一致："
                    f"DBC={dbc_model_name!r} YAML={cmd.model_name!r}",
                )
            )

    cdi_row = lookup.get("CreatureDisplayInfo.dbc", cdi.id)
    if cdi.id and cdi_row is None:
        issues.append(
            AuditIssue(
                missing_severity,
                "dbc_cdi_missing",
                f"CreatureDisplayInfo.dbc 中不存在 ID={cdi.id}"
                + (
                    "（已上线却没有 DBC 行 → 客户端加载不到该外观）" if deployed else "（尚未上线）"
                ),
            )
        )

    if cdi_row is not None:
        dbc_model_id = cdi_row.get("ModelID")
        if isinstance(dbc_model_id, int) and cmd.id and dbc_model_id != cmd.id:
            issues.append(
                AuditIssue(
                    SEVERITY_ERROR,
                    "dbc_cdi_model_id_mismatch",
                    f"CreatureDisplayInfo#{cdi.id}.ModelID={dbc_model_id} "
                    f"与 CreatureModelData.ID={cmd.id} 不一致",
                )
            )
        for slot in (1, 2, 3):
            dbc_value = str(cdi_row.get(f"TextureVariation_{slot}") or "")
            yaml_value = str(getattr(cdi, f"texture_variation_{slot}", "") or "")
            if yaml_value and dbc_value.lower() != yaml_value.lower():
                issues.append(
                    AuditIssue(
                        SEVERITY_ERROR,
                        "dbc_cdi_texture_mismatch",
                        f"CreatureDisplayInfo#{cdi.id}.TextureVariation_{slot} 与 YAML 不一致："
                        f"DBC={dbc_value!r} YAML={yaml_value!r}",
                    )
                )

    variations: dict[int, str] = {}
    for slot in (1, 2, 3):
        if cdi_row is not None:
            value = str(cdi_row.get(f"TextureVariation_{slot}") or "")
        else:
            value = str(getattr(cdi, f"texture_variation_{slot}", "") or "")
        if value:
            variations[slot] = value
    return variations


def _audit_textures(
    metadata: M2Metadata,
    m2_dir: Path,
    mpq_dir: str,
    variations: dict[int, str],
    used_textures: set[int],
    file_index: dict[str, str],
    issues: list[AuditIssue],
) -> None:
    """校验 M2 贴图表引用的 .blp 是否都能解析到。

    Args:
        metadata: M2 元数据。
        m2_dir: 模型文件所在目录。
        mpq_dir: 模型在 MPQ 内的目录（creature\\<子目录>）。
        variations: 各替换槽实际生效的 TextureVariation 值。
        used_textures: 被几何实际引用的贴图下标；空集合表示无法判定。
        file_index: 模型目录内文件名（小写）→ 实际文件名。
        issues: 问题收集列表。
    """
    for index, texture in enumerate(metadata.textures):
        unused = bool(used_textures) and index not in used_textures
        slot = TEXTURE_VARIATION_SLOTS.get(texture.texture_type)
        if slot is not None:
            _audit_texture_variation(
                index,
                slot,
                variations.get(slot, ""),
                texture.filename,
                m2_dir,
                mpq_dir,
                unused,
                file_index,
                issues,
            )
            continue
        if texture.texture_type != 0:
            continue
        _audit_hardcoded_texture(
            index, texture.filename, m2_dir, mpq_dir, unused, file_index, issues
        )


def _audit_hardcoded_texture(
    index: int,
    filename: str,
    m2_dir: Path,
    mpq_dir: str,
    unused: bool,
    file_index: dict[str, str],
    issues: list[AuditIssue],
) -> None:
    """校验 type 0（硬编码路径）贴图。"""
    if not filename.strip():
        severity = SEVERITY_WARNING if unused else SEVERITY_ERROR
        suffix = "（当前几何未引用，不影响外观）" if unused else " → 客户端必然渲染成白色"
        issues.append(
            AuditIssue(
                severity,
                "texture_name_empty",
                f"TEX[{index}] 是 type 0 硬编码贴图但文件名为空{suffix}",
            )
        )
        return

    texture_dir, texture_file = _split_mpq_path(filename)
    if texture_dir in ("", MPQ_CREATURE_ROOT) or texture_dir == mpq_dir:
        if texture_file.lower() not in file_index:
            severity = SEVERITY_WARNING if unused else SEVERITY_ERROR
            suffix = "（当前几何未引用，不影响外观）" if unused else " → 白模"
            issues.append(
                AuditIssue(
                    severity,
                    "texture_file_missing",
                    f"TEX[{index}] 引用 {filename}，模型目录里没有 {texture_file}{suffix}",
                )
            )
        return

    issues.append(
        AuditIssue(
            SEVERITY_WARNING,
            "texture_external_ref",
            f"TEX[{index}] 引用了其它目录的贴图 {filename}，本地无法校验是否存在"
            "（原版客户端资源通常如此）",
        )
    )


def _audit_texture_variation(
    index: int,
    slot: int,
    variation: str,
    m2_filename: str,
    m2_dir: Path,
    mpq_dir: str,
    unused: bool,
    file_index: dict[str, str],
    issues: list[AuditIssue],
) -> None:
    """校验 type 11/12/13（替换槽）贴图。

    客户端优先使用 CreatureDisplayInfo 的 TextureVariation_N；该槽为空时回退到
    M2 自带的文件名。两者都没有可用贴图才会白模。
    """
    if variation.strip():
        texture_file = variation.replace("\\", "/").split("/")[-1]
        if texture_file.lower().endswith(".blp"):
            texture_file = texture_file[:-4]
        if f"{texture_file}.blp".lower() not in file_index:
            severity = SEVERITY_WARNING if unused else SEVERITY_ERROR
            suffix = "（当前几何未引用，不影响外观）" if unused else " → 白模"
            issues.append(
                AuditIssue(
                    severity,
                    "texture_variation_missing",
                    f"TEX[{index}] 的 TextureVariation_{slot}={variation} → "
                    f"模型目录里没有 {texture_file}.blp{suffix}",
                )
            )
        return

    if m2_filename.strip():
        _audit_hardcoded_texture(index, m2_filename, m2_dir, mpq_dir, unused, file_index, issues)
        return

    severity = SEVERITY_WARNING if unused else SEVERITY_ERROR
    suffix = "（当前几何未引用，不影响外观）" if unused else " → 贴图无法解析"
    issues.append(
        AuditIssue(
            severity,
            "texture_variation_unset",
            f"TEX[{index}] 使用 TextureVariation_{slot} 槽，但该槽未设置且 M2 未自带贴图名{suffix}",
        )
    )


def _is_deployed(mount_id: int) -> bool:
    """判断坐骑是否已生成过上线 SQL。

    上线 SQL 落在 AzerothCore 的 updates 目录里，目录名以坐骑 ID 开头。
    已上线却没有 DBC 行属于阻断性问题，尚未上线则只提示。
    """
    if not SQL_MOUNTS_DIR.is_dir():
        return False
    return any(SQL_MOUNTS_DIR.glob(f"{mount_id:04d}_*"))


def _audit_assets(
    mount: Mount,
    lookup: DbcLookup,
    issues: list[AuditIssue],
) -> None:
    """校验 DBC 行、资源文件与贴图闭包。"""
    variations = _audit_dbc(mount, lookup, _is_deployed(mount.id), issues)

    model_dir = resolve_resource_dir("mount", mount.model_folder)
    if not model_dir.is_dir():
        issues.append(
            AuditIssue(
                SEVERITY_ERROR,
                "source_dir_missing",
                f"资源目录不存在：{model_dir}",
            )
        )
        return

    model_name = mount.dbc.creature_model_data.model_name or ""
    if not model_name:
        issues.append(
            AuditIssue(
                SEVERITY_ERROR,
                "model_name_missing",
                "YAML 未声明 creature_model_data.model_name",
            )
        )
        return

    model_file, relative_dir = _resolve_model_file(model_dir, model_name)
    if model_file is None:
        issues.append(
            AuditIssue(
                SEVERITY_ERROR,
                "model_file_missing",
                f"模型目录内找不到 {model_name}",
            )
        )
        return

    if not list(model_file.parent.glob(f"{model_file.stem}*.skin")):
        issues.append(
            AuditIssue(
                SEVERITY_WARNING,
                "skin_missing",
                f"{model_file.name} 没有配套 .skin 文件 → 模型不会渲染出网格",
            )
        )

    try:
        metadata = read_m2_metadata(model_file)
    except (OSError, ValueError) as exc:
        issues.append(
            AuditIssue(
                SEVERITY_ERROR,
                "m2_unreadable",
                f"无法解析模型文件：{exc}",
            )
        )
        return

    if metadata.partial:
        issues.append(
            AuditIssue(
                SEVERITY_WARNING,
                "m2_version_unsupported",
                f"{model_file.name} 的 M2 版本 {metadata.version} 未经验证，贴图表未做校验",
            )
        )
        return

    mpq_subdir = relative_dir.as_posix().replace("/", "\\")
    # 目录比较统一小写：客户端解析 MPQ 路径大小写不敏感，
    # 否则 creature\TravelersYak 与 creature\travelersyak 会被当成不同目录。
    mpq_dir = f"{MPQ_CREATURE_ROOT}\\{mpq_subdir}".lower()
    used_textures = read_skin_texture_usage(model_file, metadata)
    file_index = _build_file_index(model_file.parent)
    _audit_textures(
        metadata, model_file.parent, mpq_dir, variations, used_textures, file_index, issues
    )


def audit_mount(mount: Mount, lookup: DbcLookup) -> MountAuditResult:
    """审计单个坐骑资源。

    Args:
        mount: 坐骑资源。
        lookup: DBC 查询缓存。

    Returns:
        审计结果。
    """
    issues: list[AuditIssue] = []
    _audit_assets(mount, lookup, issues)
    cdi = mount.dbc.creature_display_info
    variations = tuple(
        str(getattr(cdi, f"texture_variation_{slot}", "") or "") for slot in (1, 2, 3)
    )
    return MountAuditResult(
        resource_id=mount.id,
        model_folder=mount.model_folder,
        model_name=mount.dbc.creature_model_data.model_name or "",
        texture_variations=variations,
        issues=issues,
    )


def audit_mounts(mounts: Sequence[Mount]) -> MountAuditReport:
    """批量审计坐骑资源。

    Args:
        mounts: 待审计的坐骑资源列表。

    Returns:
        审计报告。外观完全相同的坐骑（同一模型 + 同一套替换贴图）会以 error
        记在每个相关坐骑上。
    """
    lookup = DbcLookup()
    results = [audit_mount(mount, lookup) for mount in mounts]

    by_look: dict[tuple[str, tuple[str, ...]], list[MountAuditResult]] = {}
    for result in results:
        if not result.model_name:
            continue
        key = (result.model_name.lower(), result.texture_variations)
        by_look.setdefault(key, []).append(result)

    for (model_name, variations), group in by_look.items():
        if len(group) < 2:
            continue
        names = ", ".join(f"{item.resource_id:04d}-{item.model_folder}" for item in group)
        variation_text = "/".join(v for v in variations if v) or "（无替换贴图）"
        for item in group:
            item.issues.append(
                AuditIssue(
                    SEVERITY_ERROR,
                    "model_name_duplicate",
                    f"模型 {model_name} + 替换贴图 {variation_text} 被多个坐骑占用：{names}",
                )
            )

    return MountAuditReport(results=results)


def audit_report_to_dict(report: MountAuditReport) -> dict[str, Any]:
    """把审计报告转为可序列化的字典。

    Args:
        report: 审计报告。

    Returns:
        含 summary 与 results 的字典，供 CLI / API 输出。
    """
    return {
        "summary": {
            "mounts": len(report.results),
            "errors": report.error_count,
            "warnings": report.warning_count,
            "failed_mounts": len(report.failed_mounts),
        },
        "results": [
            {
                "resource_id": result.resource_id,
                "model_folder": result.model_folder,
                "model_name": result.model_name,
                "texture_variations": list(result.texture_variations),
                "issues": [
                    {
                        "severity": issue.severity,
                        "code": issue.code,
                        "message": issue.message,
                    }
                    for issue in result.issues
                ],
            }
            for result in report.results
        ],
    }
