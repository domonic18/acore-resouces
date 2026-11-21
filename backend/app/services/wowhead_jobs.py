"""Wowhead 查询任务登记簿。

Wowhead 查询由 Playwright 驱动真实浏览器，耗时可达数十秒，且每次都要起浏览器
进程。这类工作不能放进同步的 HTTP 端点，否则会占满 FastAPI 的线程池。

本模块用独立 daemon thread 执行查询，用全局 Semaphore 串行化，
避免与补丁构建任务争抢浏览器与 CPU。
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

QueryKind = Literal["mount", "pet", "npc"]
QueryStatus = Literal["pending", "running", "succeeded", "failed"]

# 登记簿最多保留的查询条数，超出后按先入先出淘汰。
_MAX_QUERIES = 50

# Playwright 每次查询都要起浏览器，全局串行以免并发拉爆内存。
_semaphore = threading.Semaphore(1)

_lock = threading.Lock()
_queries: dict[str, WowheadQuery] = {}


@dataclass
class WowheadQuery:
    """一次 Wowhead 异步查询。"""

    query_id: str
    kind: QueryKind
    query: str
    status: QueryStatus = "pending"
    result: dict[str, Any] | None = None
    error: str | None = None
    started_at: str = ""
    finished_at: str | None = None
    elapsed_ms: int | None = None
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def to_dict(self) -> dict[str, Any]:
        """转为可序列化的状态快照。"""
        return {
            "query_id": self.query_id,
            "kind": self.kind,
            "query": self.query,
            "status": self.status,
            "result": self.result,
            "error": self.error,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "elapsed_ms": self.elapsed_ms,
        }


def submit(kind: QueryKind, query: str) -> WowheadQuery:
    """提交一次异步查询，立即返回登记条目。

    Args:
        kind: 查询类型：mount / pet / npc。
        query: 查询关键词（中文或英文名称）。

    Returns:
        登记条目，状态为 pending 或已切换为 running。
    """
    job = WowheadQuery(
        query_id=uuid.uuid4().hex[:16],
        kind=kind,
        query=query,
        started_at=datetime.now(UTC).isoformat(),
    )
    with _lock:
        _queries[job.query_id] = job
        while len(_queries) > _MAX_QUERIES:
            oldest = next(iter(_queries))
            del _queries[oldest]

    threading.Thread(target=_run, args=(job,), daemon=True).start()
    return job


def get(query_id: str) -> WowheadQuery | None:
    """按 query_id 取出查询条目。

    Args:
        query_id: 查询 ID。

    Returns:
        登记条目，不存在或已淘汰时返回 None。
    """
    with _lock:
        return _queries.get(query_id)


def _run(job: WowheadQuery) -> None:
    """在后台线程中执行查询。"""
    from app.services import wowhead

    with _semaphore:
        with job.lock:
            job.status = "running"
        started = time.monotonic()
        try:
            lookup = {
                "mount": wowhead.search_mount,
                "pet": wowhead.search_pet,
                "npc": wowhead.search_npc,
            }[job.kind]
            result = lookup(job.query)
            error = result.get("error") if isinstance(result, dict) else None
            with job.lock:
                job.result = result if isinstance(result, dict) else {"raw": result}
                job.error = str(error) if error else None
                job.status = "failed" if error else "succeeded"
        except Exception as exc:  # noqa: BLE001 - 收敛到任务状态，不让线程静默死掉
            with job.lock:
                job.error = f"查询异常：{exc}"
                job.status = "failed"
        finally:
            with job.lock:
                job.elapsed_ms = int((time.monotonic() - started) * 1000)
                job.finished_at = datetime.now(UTC).isoformat()
