"""系统信息只读 API。"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/info")
def system_info() -> dict[str, Any]:
    """返回路径配置、资源统计与健康状态（只读）。"""
    counts: dict[str, int] = {"mounts": 0, "pets": 0, "npcs": 0}
    if settings.registry_file.exists():
        data = json.loads(settings.registry_file.read_text(encoding="utf-8"))
        counts.update(data.get("counts", {}))

    db_file = settings.workspace_dir / "data" / "acore_resource.db"
    return {
        "paths": {
            "project_root": str(settings.project_root),
            "data_dir": str(settings.data_dir),
            "resources_dir": str(settings.resources_dir),
            "sources_dir": str(settings.sources_dir),
            "workspace_dir": str(settings.workspace_dir),
            "patch_jobs_dir": str(settings.patch_jobs_dir),
            "acore_sql_updates_dir": (
                str(settings.acore_sql_updates_dir) if settings.acore_sql_updates_dir else None
            ),
            "logs_dir": str(settings.logs_dir),
            "db_file": str(db_file),
        },
        "counts": counts,
        "health": {
            "registry_exists": settings.registry_file.exists(),
            "db_exists": db_file.exists(),
        },
    }
