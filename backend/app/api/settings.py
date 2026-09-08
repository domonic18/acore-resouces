"""系统设置 API：AI 服务配置。"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.ai_config import AiConfigResponse, AiConfigTestResponse, AiConfigUpdate
from app.services import ai_config_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/ai-config", response_model=AiConfigResponse)
def read_ai_config(db: Session = Depends(get_db)) -> AiConfigResponse:
    """读取 AI 服务配置（密钥脱敏回显）。"""
    return ai_config_service.to_response(ai_config_service.get_row(db))


@router.put("/ai-config", response_model=AiConfigResponse)
def update_ai_config(
    payload: AiConfigUpdate, db: Session = Depends(get_db)
) -> AiConfigResponse:
    """保存 AI 服务配置；api_key 留空表示保持不变。"""
    row = ai_config_service.upsert(db, payload)
    return ai_config_service.to_response(row)


@router.post("/ai-config/test", response_model=AiConfigTestResponse)
def test_ai_config(db: Session = Depends(get_db)) -> AiConfigTestResponse:
    """用已保存配置做一次连通性测试（max_tokens=1）。"""
    ok, err = ai_config_service.test_connection(db)
    if not ok and err and err.startswith("尚未保存"):
        raise HTTPException(status_code=400, detail=err)
    return AiConfigTestResponse(ok=ok, error=err, tested_at=datetime.now(UTC))
