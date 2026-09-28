"""邮箱验证码：签发、冷却、校验（含猜码次数上限）。"""

from __future__ import annotations

import secrets
from datetime import datetime

from sqlalchemy.orm import Session

from errors import ApiError, ErrorCode
from models import VerificationCode
from ratelimit import limiter, too_many

RESEND_COOLDOWN = 60      # 同一邮箱两次发送至少间隔（秒）
MAX_WRONG_GUESSES = 8     # 15 分钟内猜错这么多次，作废该邮箱所有未用的验证码
WRONG_WINDOW = 15 * 60


def issue(db: Session, email: str) -> VerificationCode:
    latest = (
        db.query(VerificationCode)
        .filter_by(email=email)
        .order_by(VerificationCode.created_at.desc())
        .first()
    )
    if latest is not None:
        elapsed = (datetime.utcnow() - latest.created_at).total_seconds()
        if elapsed < RESEND_COOLDOWN:
            raise too_many(int(RESEND_COOLDOWN - elapsed) + 1, "验证码已发送，请稍后再试")
    record = VerificationCode.issue(email, f"{secrets.randbelow(1_000_000):06d}")
    db.add(record)
    db.commit()
    limiter.reset(f"code-wrong:{email}")
    return record


def consume(db: Session, email: str, code: str) -> None:
    """校验并作废验证码；不通过时抛 AUTH_003。"""
    key = f"code-wrong:{email}"
    if limiter.peek(key, MAX_WRONG_GUESSES) is not None:
        raise ApiError(ErrorCode.AUTH_INVALID_CODE, "验证码错误次数太多，请重新获取", 400)
    record = (
        db.query(VerificationCode)
        .filter_by(email=email, code=code)
        .order_by(VerificationCode.created_at.desc())
        .first()
    )
    if record is None:
        limiter.hit(key, MAX_WRONG_GUESSES, WRONG_WINDOW)
        if limiter.peek(key, MAX_WRONG_GUESSES) is not None:
            db.query(VerificationCode).filter_by(email=email, used=False).update({"used": True})
            db.commit()
            raise ApiError(ErrorCode.AUTH_INVALID_CODE, "验证码错误次数太多，请重新获取", 400)
        raise ApiError(ErrorCode.AUTH_INVALID_CODE, "验证码不存在或已过期", 400)
    if record.used:
        raise ApiError(ErrorCode.AUTH_INVALID_CODE, "验证码已被使用，请重新获取", 400)
    if record.is_expired():
        raise ApiError(ErrorCode.AUTH_INVALID_CODE, "验证码已过期，请重新获取", 400)
    record.used = True
    db.commit()
    limiter.reset(key)
