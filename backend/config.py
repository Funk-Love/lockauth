"""配置：全部来自环境变量（backend/.env），变量名沿用 Flask 版，线上 .env 不用改。"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")

# 只给本地开发和测试用。代码是公开的，这个值谁都知道，生产环境用它等于谁都能伪造登录
DEV_JWT_SECRET = "dev-jwt-secret-key-change-in-production"


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.split("#", 1)[0].strip().lower() in ("1", "true", "yes", "on")


def _service_keys() -> dict[str, str]:
    """SERVICE_KEYS="lockcloud:<密钥>,lockai:<密钥>" → {服务名: 密钥}。"""
    keys = {}
    for item in _list("SERVICE_KEYS", ""):
        name, _, key = item.partition(":")
        if name.strip() and key.strip():
            keys[name.strip()] = key.strip()
    return keys


def _list(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass
class Settings:
    # 旧版用 FLASK_ENV 区分环境，新名字 APP_ENV 优先
    env: str = field(default_factory=lambda: os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "production")

    database_url: str | None = field(default_factory=lambda: os.getenv("DATABASE_URL") or None)

    # 必须和旧版同一把钥匙，已签发的 Token 才能继续用
    jwt_secret_key: str = field(default_factory=lambda: os.getenv("JWT_SECRET_KEY", DEV_JWT_SECRET))
    jwt_expires: timedelta = timedelta(days=7)

    mail_server: str = field(default_factory=lambda: os.getenv("MAIL_SERVER", "smtp.zju.edu.cn"))
    mail_port: int = field(default_factory=lambda: int(os.getenv("MAIL_PORT", "587").split("#", 1)[0].strip()))
    mail_use_tls: bool = field(default_factory=lambda: _bool("MAIL_USE_TLS", True))
    mail_use_ssl: bool = field(default_factory=lambda: _bool("MAIL_USE_SSL", False))
    mail_username: str = field(default_factory=lambda: os.getenv("MAIL_USERNAME", ""))
    mail_password: str = field(default_factory=lambda: os.getenv("MAIL_PASSWORD", ""))
    mail_default_sender: str = field(default_factory=lambda: os.getenv("MAIL_DEFAULT_SENDER", "noreply@funk-and.love"))
    # 测试和本地调试时不真的发信，验证码打到日志里
    mail_suppress: bool = field(default_factory=lambda: _bool("MAIL_SUPPRESS_SEND", False))

    cors_origins: list[str] = field(default_factory=lambda: _list("CORS_ORIGINS", "http://localhost:3000"))
    allowed_redirect_uris: list[str] = field(default_factory=lambda: _list(
        "ALLOWED_REDIRECT_URIS",
        "http://localhost:3000,http://localhost:3001,http://localhost:3002,https://funk-and.love,https://*.funk-and.love",
    ))

    sso_frontend_url: str | None = field(default_factory=lambda: os.getenv("SSO_FRONTEND_URL") or None)

    # 其他服务的后端调 /api/auth/service/* 用的密钥，每个服务一把
    service_keys: dict[str, str] = field(default_factory=_service_keys)

    # 头像存在阿里云 OSS 的公共资源桶（杭州），见 services/avatar.py
    oss_access_key_id: str = field(default_factory=lambda: os.getenv("OSS_ACCESS_KEY_ID", ""))
    oss_access_key_secret: str = field(default_factory=lambda: os.getenv("OSS_ACCESS_KEY_SECRET", ""))
    oss_region: str = field(default_factory=lambda: os.getenv("OSS_REGION", "cn-hangzhou"))
    oss_public_bucket: str = field(default_factory=lambda: os.getenv("OSS_PUBLIC_BUCKET", "lock-publicfiles"))
    oss_endpoint: str = field(default_factory=lambda: os.getenv("OSS_ENDPOINT", "https://oss-cn-hangzhou.aliyuncs.com"))
    # 服务器在杭州时填内网 endpoint，删旧头像、核对上传不走外网
    oss_internal_endpoint: str | None = field(default_factory=lambda: os.getenv("OSS_INTERNAL_ENDPOINT") or None)
    public_files_url: str = field(default_factory=lambda: os.getenv(
        "PUBLIC_FILES_URL", "https://lock-publicfiles.oss-cn-hangzhou.aliyuncs.com"))

    # 登录记录保留天数，启动时清理更早的
    audit_retention_days: int = field(default_factory=lambda: int(os.getenv("AUDIT_RETENTION_DAYS", "180")))

    def __post_init__(self) -> None:
        if self.is_production and self.jwt_secret_key in ("", DEV_JWT_SECRET):
            raise RuntimeError("生产环境必须在 backend/.env 里配置 JWT_SECRET_KEY")

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def frontend_url(self) -> str:
        if self.sso_frontend_url:
            return self.sso_frontend_url.rstrip("/")
        return "https://auth.funk-and.love" if self.is_production else "http://localhost:3000"


settings = Settings()
