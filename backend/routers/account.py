"""/api/auth/me/*：个人中心自助（新接口）。"""

from __future__ import annotations

from datetime import datetime, timedelta

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from deps import RequestMeta, active_user, current_user, request_meta
from errors import ApiError, ErrorCode, invalid
from models import AuthLog, User
from ratelimit import enforce, limiter
from schemas import AvatarConfirmBody, AvatarUploadBody, ChangePasswordBody, UpdateProfileBody
from security import check_password, create_token, hash_password
from services import audit, avatar
from validation import check_password as check_password_rules, clean_name, is_zju, require

router = APIRouter(prefix="/api/auth/me", tags=["account"])


@router.patch("")
def update_profile(body: UpdateProfileBody, user: User = Depends(active_user), db: Session = Depends(get_db),
                   meta: RequestMeta = Depends(request_meta)):
    name = clean_name(body.name)
    if name != user.name:
        old = user.name
        user.name = name
        db.commit()
        audit.record(db, "update_profile", meta, user=user, detail={"name": {"from": old, "to": name}})
    # 名字写在 Token 里，换一张新的让其他服务拿到新名字
    return {"success": True, "message": "已保存", "user": user.to_dict(), "token": create_token(user)}


# 头像：浏览器直传到 OSS。先要签名地址，传完再确认
@router.post("/avatar/upload-url")
def avatar_upload_url(body: AvatarUploadBody, user: User = Depends(active_user)):
    enforce(f"avatar:{user.id}", 20, 3600, "操作太频繁，请稍后再试")
    if body.content_type not in avatar.CONTENT_TYPES:
        raise invalid("只支持 JPG、PNG、WebP、GIF 图片", "content_type")
    if body.size is not None and body.size > avatar.MAX_BYTES:
        raise invalid("图片不能超过 5 MB", "size")
    return {"success": True, **avatar.upload_url(user.id, body.content_type)}


@router.post("/avatar")
def avatar_confirm(body: AvatarConfirmBody, user: User = Depends(active_user), db: Session = Depends(get_db),
                   meta: RequestMeta = Depends(request_meta)):
    key = require(body.key, "key")
    if not key.startswith(avatar.user_prefix(user.id)) or "/" in key[len(avatar.user_prefix(user.id)):]:
        raise invalid("上传凭据无效，请重试", "key")
    problem = avatar.check_uploaded(key)
    if problem:
        raise invalid(problem, "key")
    old = user.avatar_key
    user.avatar_key = key
    db.commit()
    if old != key:
        avatar.remove(old)
    audit.record(db, "update_profile", meta, user=user, detail={"avatar": "updated"})
    return {"success": True, "message": "头像已更新", "user": user.to_dict()}


@router.delete("/avatar")
def avatar_delete(user: User = Depends(active_user), db: Session = Depends(get_db),
                  meta: RequestMeta = Depends(request_meta)):
    old = user.avatar_key
    if old:
        user.avatar_key = None
        db.commit()
        avatar.remove(old)
        audit.record(db, "update_profile", meta, user=user, detail={"avatar": "removed"})
    return {"success": True, "message": "头像已移除", "user": user.to_dict()}


@router.post("/password")
def change_password(body: ChangePasswordBody, user: User = Depends(active_user), db: Session = Depends(get_db),
                    meta: RequestMeta = Depends(request_meta)):
    enforce(f"change-password:{user.id}", 6, 600, "尝试次数过多，请稍后再试")
    current = require(body.current_password, "current_password")
    new = require(body.new_password, "new_password")
    if not check_password(current, user.password_hash):
        audit.record(db, "change_password", meta, user=user, success=False,
                     error_code=ErrorCode.AUTH_INVALID_CREDENTIALS, error_message="当前密码不正确")
        raise ApiError(ErrorCode.AUTH_INVALID_CREDENTIALS, "当前密码不正确", 400, {"field": "current_password"})
    check_password_rules(new, "new_password")
    if new == current:
        raise invalid("新密码不能与当前密码相同", "new_password")
    user.password_hash = hash_password(new)
    # 精确到秒：这一秒之前签发的 Token（其他设备上的登录）全部作废，下面这张新的不受影响
    user.password_changed_at = datetime.utcnow().replace(microsecond=0)
    db.commit()
    limiter.reset(f"login-fail:{user.email}")
    audit.record(db, "change_password", meta, user=user)
    return {"success": True, "message": "密码已更新，其他设备需要重新登录", "token": create_token(user),
            "user": user.to_dict()}


@router.get("/activity")
def activity(limit: int = Query(default=30, ge=1, le=100), user: User = Depends(current_user),
             db: Session = Depends(get_db)):
    logs = (
        db.query(AuthLog)
        .filter(AuthLog.user_id == user.id, AuthLog.action.in_(audit.USER_ACTIONS))
        .order_by(AuthLog.created_at.desc(), AuthLog.id.desc())
        .limit(limit)
        .all()
    )
    last_seen = dict(
        db.query(AuthLog.service, sa.func.max(AuthLog.created_at))
        .filter(AuthLog.user_id == user.id, AuthLog.success.is_(True), AuthLog.service.isnot(None))
        .group_by(AuthLog.service)
        .all()
    )
    since = datetime.utcnow() - timedelta(days=30)
    logins_30d = (
        db.query(sa.func.count(AuthLog.id))
        .filter(AuthLog.user_id == user.id, AuthLog.success.is_(True),
                AuthLog.action.in_(("login", "sso_authorize")), AuthLog.created_at >= since)
        .scalar()
    )
    return {
        "success": True,
        "logs": [_public_log(entry) for entry in logs],
        "services": {k: v.isoformat() for k, v in last_seen.items() if v},
        "stats": {
            "logins_30d": logins_30d or 0,
            "member_days": max(1, (datetime.utcnow() - user.created_at).days + 1),
            "is_alumni": not is_zju(user.email),
        },
    }


def _public_log(entry: AuthLog) -> dict:
    data = entry.to_dict()
    # 给本人看的记录不需要这些
    for key in ("user_id", "email", "detail"):
        data.pop(key, None)
    return data
