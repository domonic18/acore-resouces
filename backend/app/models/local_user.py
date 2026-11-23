"""本系统账号（账号中心唯一用户表，分发站经 /api/auth/verify 委托使用）。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class LocalUser(Base):
    """独立账号体系的用户；password_hash 为 bcrypt 哈希，绝不存明文。"""

    __tablename__ = "local_user"
    __table_args__ = (UniqueConstraint("username", name="uq_local_user_username"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)  # 'admin' | 'viewer'
    # viewer 的查看权限 JSON 数组（如 '["dist","mount"]'）；admin 隐式全量，忽略此值
    permissions: Mapped[str] = mapped_column(
        String, nullable=False, default="[]", server_default="[]"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
