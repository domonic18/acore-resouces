"""Wowhead 官方数据查询 REST API 路由。

Wowhead 查询由 Playwright 驱动真实浏览器，耗时可达数十秒，
因此采用「提交任务 → 轮询状态」的异步模式，而不是同步阻塞端点。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import wowhead_jobs

router = APIRouter(prefix="/api/wowhead", tags=["wowhead"])


class WowheadSearchRequest(BaseModel):
    """Wowhead 查询请求。"""

    query: str = Field(..., min_length=1, max_length=100, description="中文或英文名称")
    kind: wowhead_jobs.QueryKind = "mount"


class WowheadSearchAccepted(BaseModel):
    """已受理的查询任务。"""

    query_id: str
    status: wowhead_jobs.QueryStatus
    started_at: str


class WowheadSearchStatus(BaseModel):
    """查询任务状态与结果。"""

    query_id: str
    kind: str
    query: str
    status: wowhead_jobs.QueryStatus
    result: dict | None = None
    error: str | None = None
    started_at: str
    finished_at: str | None = None
    elapsed_ms: int | None = None


@router.post("/search", status_code=202, response_model=WowheadSearchAccepted)
def submit_search(body: WowheadSearchRequest) -> WowheadSearchAccepted:
    """提交 Wowhead 查询，立即返回任务 ID。

    查询在后台线程执行，用 GET /api/wowhead/search/{query_id} 轮询结果。
    """
    job = wowhead_jobs.submit(body.kind, body.query)
    return WowheadSearchAccepted(
        query_id=job.query_id,
        status=job.status,
        started_at=job.started_at,
    )


@router.get("/search/{query_id}", response_model=WowheadSearchStatus)
def get_search(query_id: str) -> WowheadSearchStatus:
    """查询 Wowhead 异步任务的状态与结果。"""
    job = wowhead_jobs.get(query_id)
    if job is None:
        raise HTTPException(404, f"查询任务 {query_id} 不存在或已过期")
    return WowheadSearchStatus(**job.to_dict())
