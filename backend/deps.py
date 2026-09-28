"""请求级依赖：客户端 IP、当前用户、管理员。"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from database import get_db
from errors import ApiError, ErrorCode
from models import EmailBlacklist, User
from security import TokenExpired, TokenInvalid, decode_token, issued_before_password_change

_TRUSTED_PROXIES = {"127.0.0.1", "::1", "localhost"}


def client_ip(request: Request) -> str:
    """nginx 在本机反代时，从它加的头里取真实 IP；直连时用对端地址。"""
    peer = request.client.host if request.client else "unknown"
    if peer in _TRUSTED_PROXIES:
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # 最右一段是 nginx 自己追加的，客户端伪造不了
            return forwarded.split(",")[-1].strip()
    return peer


@dataclass
class RequestMeta:
    ip: str
    user_agent: str | None


def request_meta(request: Request) -> RequestMeta:
    ua = request.headers.get("user-agent")
    return RequestMeta(ip=client_ip(request), user_agent=ua[:500] if ua else None)


def bearer_token(request: Request) -> str:
    header = request.headers.get("authorization") or ""
    if not header.startswith("Bearer "):
        raise ApiError(ErrorCode.AUTH_INVALID_TOKEN, "缺少或无效的 Authorization 头", 401)
    return header.split(" ", 1)[1].strip()


def token_payload(request: Request) -> dict:
    try:
        return decode_token(bearer_token(request))
    except (TokenExpired, TokenInvalid):
        raise ApiError(ErrorCode.AUTH_INVALID_TOKEN, "Token 无效或已过期", 401)


def current_user(payload: dict = Depends(token_payload), db: Session = Depends(get_db)) -> User:
    user = db.get(User, payload["user_id"])
    if not user:
        raise ApiError(ErrorCode.AUTH_INVALID_TOKEN, "用户不存在", 401)
    if issued_before_password_change(payload, user):
        raise ApiError(ErrorCode.AUTH_INVALID_TOKEN, "密码已修改，请重新登录", 401)
    return user


def active_user(user: User = Depends(current_user), db: Session = Depends(get_db)) -> User:
    """需要账号仍可用的操作（改资料、改密码等）。"""
    if not user.is_active:
        raise ApiError(ErrorCode.AUTH_ACCOUNT_DISABLED, "账号已被禁用", 403)
    if db.query(EmailBlacklist).filter_by(email=user.email).first():
        raise ApiError(ErrorCode.AUTH_EMAIL_BLACKLISTED, "该邮箱已被封禁", 403)
    return user


def admin_user(payload: dict = Depends(token_payload), db: Session = Depends(get_db)) -> User:
    user = db.get(User, payload["user_id"])
    if not user or issued_before_password_change(payload, user):
        raise ApiError(ErrorCode.AUTH_INVALID_TOKEN, "Token 无效或已过期", 401)
    if not user.is_admin or not user.is_active:
        raise ApiError(ErrorCode.PERMISSION_DENIED, "权限不足，需要管理员权限", 403)
    return user
