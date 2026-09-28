"""数据模型。表名、列名、类型与线上 auth.db 一一对应（Flask 版建的表）。"""

from __future__ import annotations

from datetime import datetime, timedelta

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from database import Base

CODE_TTL = timedelta(minutes=10)


def iso(value: datetime | None) -> str | None:
    """和 Flask 版一样输出不带时区的 UTC 时间。"""
    return value.isoformat() if value else None


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    name: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime, nullable=False, default=datetime.utcnow)
    last_login: Mapped[datetime | None] = mapped_column(sa.DateTime)
    is_active: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=True)
    is_admin: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)
    # 新增：改密码 / 重置密码的时间，早于它签发的 Token 作废
    password_changed_at: Mapped[datetime | None] = mapped_column(sa.DateTime)
    # 头像在公共资源桶里的 key：avatars/{id}/{uuid}.{ext}
    avatar_key: Mapped[str | None] = mapped_column(sa.String(500))

    def to_dict(self) -> dict:
        from services.avatar import url as avatar_url

        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "created_at": iso(self.created_at),
            "last_login": iso(self.last_login),
            "is_active": self.is_active,
            "is_admin": self.is_admin,
            "avatar_url": avatar_url(self.avatar_key, "avatarlg"),
        }

    def brief(self) -> dict:
        return {"id": self.id, "name": self.name, "email": self.email}


class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(sa.String(255), nullable=False, index=True)
    code: Mapped[str] = mapped_column(sa.String(6), nullable=False)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime, nullable=False, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(sa.DateTime, nullable=False, index=True)
    used: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=False)

    @classmethod
    def issue(cls, email: str, code: str) -> "VerificationCode":
        now = datetime.utcnow()
        return cls(email=email, code=code, created_at=now, expires_at=now + CODE_TTL, used=False)

    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at


class EmailBlacklist(Base):
    __tablename__ = "email_blacklist"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(sa.String(500))
    blocked_by: Mapped[int] = mapped_column(sa.Integer, sa.ForeignKey("users.id"), nullable=False)
    blocked_at: Mapped[datetime] = mapped_column(sa.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "reason": self.reason,
            "blocked_by": self.blocked_by,
            "blocked_at": iso(self.blocked_at),
        }


class EmailWhitelist(Base):
    """校友白名单：非 @zju.edu.cn 邮箱要在这里才能注册。"""

    __tablename__ = "email_whitelist"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True)
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(sa.String(100))
    note: Mapped[str | None] = mapped_column(sa.String(500))
    added_by: Mapped[int] = mapped_column(sa.Integer, sa.ForeignKey("users.id"), nullable=False)
    added_at: Mapped[datetime] = mapped_column(sa.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "note": self.note,
            "added_by": self.added_by,
            "added_at": iso(self.added_at),
        }


class AuthLog(Base):
    """登录与操作记录。表在旧库里早就建好了，这一版才开始写。"""

    __tablename__ = "auth_logs"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(sa.Integer, index=True)
    email: Mapped[str | None] = mapped_column(sa.String(255), index=True)
    action: Mapped[str] = mapped_column(sa.String(50), nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(sa.String(45))
    user_agent: Mapped[str | None] = mapped_column(sa.Text)
    success: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, default=True)
    error_code: Mapped[str | None] = mapped_column(sa.String(50))
    error_message: Mapped[str | None] = mapped_column(sa.Text)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime, nullable=False, default=datetime.utcnow, index=True)
    # 新增：经由哪个服务（cloud / ai / ...），以及操作对象等补充信息（JSON）
    service: Mapped[str | None] = mapped_column(sa.String(50))
    detail: Mapped[str | None] = mapped_column(sa.Text)

    def to_dict(self) -> dict:
        import json

        return {
            "id": self.id,
            "user_id": self.user_id,
            "email": self.email,
            "action": self.action,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "success": self.success,
            "error_code": self.error_code,
            "error_message": self.error_message,
            "service": self.service,
            "detail": json.loads(self.detail) if self.detail else None,
            "created_at": iso(self.created_at),
        }
