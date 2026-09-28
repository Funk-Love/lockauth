"""密码哈希与 JWT。

JWT 与 Flask 版（flask-jwt-extended 4.6）签发的格式完全一致：HS256，
载荷含 sub / type / fresh / jti / iat / nbf / exp，外加 user_id / email / name。
LockCloud、LockAI 和用户浏览器里已有的 Token 在迁移后继续有效。
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import bcrypt
import jwt

from config import settings

_BCRYPT_ROUNDS = 12


def _pw_bytes(password: str) -> bytes:
    # bcrypt 只看前 72 字节。旧版 bcrypt 4.x 静默截断，5.x 起超长会报错，这里显式截断保持旧行为
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode("utf-8")


def check_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_pw_bytes(password), password_hash.encode("utf-8"))
    except ValueError:
        return False


# 用户不存在时也跑一次 bcrypt，让"邮箱不存在"和"密码错"的耗时一样
_DUMMY_HASH = hash_password("lockauth-timing-equalizer")


def burn_password_check(password: str) -> None:
    check_password(password, _DUMMY_HASH)


def create_token(user) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "fresh": False,
        "iat": now,
        "jti": str(uuid.uuid4()),
        "type": "access",
        "sub": str(user.id),
        "nbf": now,
        "exp": now + settings.jwt_expires,
        "user_id": user.id,
        "email": user.email,
        "name": user.name,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


class TokenExpired(Exception):
    pass


class TokenInvalid(Exception):
    pass


def decode_token(token: str) -> dict:
    """校验签名、有效期和类型；失败抛 TokenExpired / TokenInvalid。"""
    if not token or not isinstance(token, str):
        raise TokenInvalid("empty token")
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
            leeway=10,
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpired(str(exc)) from exc
    except jwt.PyJWTError as exc:
        raise TokenInvalid(str(exc)) from exc
    if payload.get("type", "access") != "access":
        raise TokenInvalid("not an access token")
    user_id = payload.get("user_id", payload.get("sub"))
    try:
        payload["user_id"] = int(user_id)
    except (TypeError, ValueError) as exc:
        raise TokenInvalid("bad subject") from exc
    return payload


def issued_before_password_change(payload: dict, user) -> bool:
    """改过密码的账号，早于那一刻签发的 Token 作废（按秒比较）。"""
    changed = getattr(user, "password_changed_at", None)
    if not changed:
        return False
    iat = payload.get("iat")
    if not isinstance(iat, (int, float)):
        return False
    return int(iat) < int(changed.replace(tzinfo=timezone.utc).timestamp())
