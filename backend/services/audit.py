"""登录与操作记录（auth_logs 表）。写记录失败不影响主流程。"""

from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime

from sqlalchemy.orm import Session

from deps import RequestMeta
from models import AuthLog

logger = logging.getLogger("lockauth.audit")

# 给用户看的动作；管理员动作以 admin. 开头
USER_ACTIONS = (
    "login", "register", "reset_password", "change_password",
    "update_profile", "sso_authorize", "service_access",
)


def record(
    db: Session,
    action: str,
    meta: RequestMeta | None,
    *,
    user=None,
    email: str | None = None,
    success: bool = True,
    error_code: str | None = None,
    error_message: str | None = None,
    service: str | None = None,
    detail: dict | None = None,
) -> None:
    try:
        entry = AuthLog(
            user_id=getattr(user, "id", None),
            email=getattr(user, "email", None) or email,
            action=action,
            ip_address=meta.ip[:45] if meta else None,
            user_agent=meta.user_agent if meta else None,
            success=success,
            error_code=error_code,
            error_message=error_message,
            service=service,
            detail=json.dumps(detail, ensure_ascii=False) if detail else None,
            created_at=datetime.utcnow(),
        )
        db.add(entry)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("写登录记录失败 action=%s", action)
        return
    status = "OK" if success else f"FAIL {error_code or ''}".strip()
    logger.info("%s | %s | %s | %s%s", action.upper(), entry.email or "-", entry.ip_address or "-", status,
                f" | {service}" if service else "")


_seen: dict[tuple[int, str], float] = {}
_seen_lock = threading.Lock()
_ACCESS_INTERVAL = 3600


def record_service_access(db: Session, user, service: str | None, meta: RequestMeta | None) -> None:
    """服务每次打开都会来验 Token；同一人同一服务一小时只记一条。"""
    if not service or service in ("auth", "local"):
        return
    key = (user.id, service)
    now = time.monotonic()
    with _seen_lock:
        last = _seen.get(key)
        if last is not None and now - last < _ACCESS_INTERVAL:
            return
        _seen[key] = now
        if len(_seen) > 5000:
            cutoff = now - _ACCESS_INTERVAL
            for k in [k for k, v in _seen.items() if v < cutoff]:
                _seen.pop(k, None)
    record(db, "service_access", meta, user=user, service=service)


def reset_access_cache() -> None:
    with _seen_lock:
        _seen.clear()
