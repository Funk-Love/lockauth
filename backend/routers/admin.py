"""/api/admin：用户、黑白名单（与旧版兼容），以及概览数据、审计日志、管理员授权（新）。"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from deps import RequestMeta, admin_user, request_meta
from errors import ApiError, ErrorCode, invalid
from models import AuthLog, EmailBlacklist, EmailWhitelist, User
from schemas import BlacklistBody, UserRoleBody, UserStatusBody, WhitelistBody, WhitelistUpdateBody
from services import audit
from validation import ZJU_DOMAIN, check_email_format, normalize_email

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _page_args(page: int, per_page: int) -> tuple[int, int]:
    return max(page, 1), per_page if 1 <= per_page <= 100 else 20


def _paginate(query, page: int, per_page: int) -> tuple[list, dict]:
    total = query.order_by(None).count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return items, {"page": page, "per_page": per_page, "total": total, "pages": math.ceil(total / per_page) if total else 0}


def _like(text: str) -> str:
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


# ---------------------------------------------------------------- 用户

@router.get("/users")
def list_users(page: int = 1, per_page: int = 20, search: str = "", status: str = "",
               admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    page, per_page = _page_args(page, per_page)
    query = db.query(User)
    search = search.strip()
    if search:
        pattern = _like(search)
        query = query.filter(sa.or_(User.email.like(pattern, escape="\\"), User.name.like(pattern, escape="\\")))
    if status == "active":
        query = query.filter(User.is_active.is_(True))
    elif status == "disabled":
        query = query.filter(User.is_active.is_(False))
    elif status == "admin":
        query = query.filter(User.is_admin.is_(True))
    elif status == "alumni":
        query = query.filter(~User.email.like(f"%{ZJU_DOMAIN}"))
    elif status == "dormant":
        query = query.filter(User.last_login.is_(None))
    users, pagination = _paginate(query.order_by(User.created_at.desc()), page, per_page)
    return {"success": True, "users": [u.to_dict() for u in users], "pagination": pagination}


@router.put("/users/{user_id}/status")
def set_user_status(user_id: int, body: UserStatusBody, admin: User = Depends(admin_user),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(request_meta)):
    if body.is_active is None:
        raise invalid("请提供 is_active 字段", "is_active")
    user = db.get(User, user_id)
    if not user:
        raise invalid("用户不存在")
    if user.id == admin.id and not body.is_active:
        raise invalid("不能禁用自己的账号")
    if user.is_active != body.is_active:
        user.is_active = body.is_active
        db.commit()
        audit.record(db, "admin.enable_user" if body.is_active else "admin.disable_user", meta, user=admin,
                     detail={"target": user.brief()})
    return {"success": True, "message": "用户状态已更新", "user": user.to_dict()}


@router.put("/users/{user_id}/role")
def set_user_role(user_id: int, body: UserRoleBody, admin: User = Depends(admin_user),
                  db: Session = Depends(get_db), meta: RequestMeta = Depends(request_meta)):
    if body.is_admin is None:
        raise invalid("请提供 is_admin 字段", "is_admin")
    user = db.get(User, user_id)
    if not user:
        raise invalid("用户不存在")
    if user.id == admin.id:
        raise invalid("不能修改自己的管理员身份")
    if user.is_admin != body.is_admin:
        user.is_admin = body.is_admin
        db.commit()
        audit.record(db, "admin.grant_admin" if body.is_admin else "admin.revoke_admin", meta, user=admin,
                     detail={"target": user.brief()})
    return {"success": True, "message": "管理员身份已更新", "user": user.to_dict()}


# ---------------------------------------------------------------- 黑名单

@router.get("/blacklist")
def list_blacklist(page: int = 1, per_page: int = 20, admin: User = Depends(admin_user),
                   db: Session = Depends(get_db)):
    page, per_page = _page_args(page, per_page)
    entries, pagination = _paginate(db.query(EmailBlacklist).order_by(EmailBlacklist.blocked_at.desc()), page, per_page)
    people = {u.id: u for u in db.query(User).filter(User.id.in_({e.blocked_by for e in entries}))}
    items = []
    for entry in entries:
        data = entry.to_dict()
        blocker = people.get(entry.blocked_by)
        data["blocker"] = blocker.brief() if blocker else None
        items.append(data)
    return {"success": True, "blacklist": items, "pagination": pagination}


@router.post("/blacklist", status_code=201)
def add_blacklist(body: BlacklistBody, admin: User = Depends(admin_user), db: Session = Depends(get_db),
                  meta: RequestMeta = Depends(request_meta)):
    email = normalize_email(body.email)
    check_email_format(email)
    if email == admin.email:
        raise invalid("不能封禁自己的邮箱", "email")
    if db.query(EmailBlacklist).filter_by(email=email).first():
        raise invalid("该邮箱已在黑名单中", "email")
    reason = (body.reason or "").strip()[:500]
    entry = EmailBlacklist(email=email, reason=reason, blocked_by=admin.id, blocked_at=datetime.utcnow())
    db.add(entry)
    db.commit()
    audit.record(db, "admin.blacklist_add", meta, user=admin, detail={"email": email, "reason": reason or None})
    return JSONResponse({"success": True, "message": "邮箱已添加到黑名单", "blacklist": entry.to_dict()}, status_code=201)


@router.delete("/blacklist/{email:path}")
def remove_blacklist(email: str, admin: User = Depends(admin_user), db: Session = Depends(get_db),
                     meta: RequestMeta = Depends(request_meta)):
    email = email.strip().lower()
    entry = db.query(EmailBlacklist).filter_by(email=email).first()
    if not entry:
        raise invalid("该邮箱不在黑名单中")
    db.delete(entry)
    db.commit()
    audit.record(db, "admin.blacklist_remove", meta, user=admin, detail={"email": email})
    return {"success": True, "message": "邮箱已从黑名单移除"}


# ---------------------------------------------------------------- 校友白名单

def _whitelist_item(entry: EmailWhitelist, people: dict[int, User], registered: set[str]) -> dict:
    data = entry.to_dict()
    adder = people.get(entry.added_by)
    data["adder"] = adder.brief() if adder else None
    data["registered"] = entry.email in registered
    return data


@router.get("/whitelist")
def list_whitelist(page: int = 1, per_page: int = 20, search: str = "", admin: User = Depends(admin_user),
                   db: Session = Depends(get_db)):
    page, per_page = _page_args(page, per_page)
    query = db.query(EmailWhitelist)
    search = search.strip()
    if search:
        pattern = _like(search)
        query = query.filter(sa.or_(EmailWhitelist.email.like(pattern, escape="\\"),
                                    EmailWhitelist.name.like(pattern, escape="\\")))
    entries, pagination = _paginate(query.order_by(EmailWhitelist.added_at.desc()), page, per_page)
    people = {u.id: u for u in db.query(User).filter(User.id.in_({e.added_by for e in entries}))}
    registered = {row.email for row in db.query(User.email).filter(User.email.in_([e.email for e in entries]))}
    return {"success": True, "whitelist": [_whitelist_item(e, people, registered) for e in entries],
            "pagination": pagination}


@router.post("/whitelist", status_code=201)
def add_whitelist(body: WhitelistBody, admin: User = Depends(admin_user), db: Session = Depends(get_db),
                  meta: RequestMeta = Depends(request_meta)):
    email = normalize_email(body.email)
    check_email_format(email)
    if email.endswith(ZJU_DOMAIN):
        raise invalid("浙大邮箱不需要加白名单", "email")
    if db.query(EmailWhitelist).filter_by(email=email).first():
        raise invalid("该邮箱已在白名单中", "email")
    entry = EmailWhitelist(email=email, name=(body.name or "").strip()[:100] or None,
                           note=(body.note or "").strip()[:500] or None, added_by=admin.id, added_at=datetime.utcnow())
    db.add(entry)
    db.commit()
    audit.record(db, "admin.whitelist_add", meta, user=admin, detail={"email": email, "name": entry.name})
    return JSONResponse({"success": True, "message": "邮箱已添加到白名单", "whitelist": entry.to_dict()}, status_code=201)


@router.put("/whitelist/{whitelist_id}")
def update_whitelist(whitelist_id: int, body: WhitelistUpdateBody, admin: User = Depends(admin_user),
                     db: Session = Depends(get_db), meta: RequestMeta = Depends(request_meta)):
    entry = db.get(EmailWhitelist, whitelist_id)
    if not entry:
        raise invalid("白名单记录不存在")
    fields = body.model_dump(exclude_unset=True)
    if "name" in fields:
        entry.name = (fields["name"] or "").strip()[:100] or None
    if "note" in fields:
        entry.note = (fields["note"] or "").strip()[:500] or None
    db.commit()
    audit.record(db, "admin.whitelist_update", meta, user=admin, detail={"email": entry.email})
    return {"success": True, "message": "白名单已更新", "whitelist": entry.to_dict()}


@router.delete("/whitelist/{whitelist_id}")
def remove_whitelist(whitelist_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db),
                     meta: RequestMeta = Depends(request_meta)):
    entry = db.get(EmailWhitelist, whitelist_id)
    if not entry:
        raise invalid("白名单记录不存在")
    email = entry.email
    db.delete(entry)
    db.commit()
    audit.record(db, "admin.whitelist_remove", meta, user=admin, detail={"email": email})
    return {"success": True, "message": "邮箱已从白名单移除"}


# ---------------------------------------------------------------- 概览（新）

@router.get("/overview")
def overview(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    def count(*conds) -> int:
        return db.query(sa.func.count(User.id)).filter(*conds).scalar() or 0

    users = {
        "total": count(),
        "active": count(User.is_active.is_(True)),
        "disabled": count(User.is_active.is_(False)),
        "admins": count(User.is_admin.is_(True)),
        "alumni": count(~User.email.like(f"%{ZJU_DOMAIN}")),
        "never_logged_in": count(User.last_login.is_(None)),
        "new_30d": count(User.created_at >= now - timedelta(days=30)),
        "active_7d": count(User.last_login >= now - timedelta(days=7)),
        "active_30d": count(User.last_login >= now - timedelta(days=30)),
    }

    whitelist_emails = [row.email for row in db.query(EmailWhitelist.email)]
    whitelist = {
        "total": len(whitelist_emails),
        "registered": count(User.email.in_(whitelist_emails)) if whitelist_emails else 0,
    }

    # 近 12 个月每月注册数
    months: list[str] = []
    cursor = today.replace(day=1)
    for _ in range(12):
        months.append(cursor.strftime("%Y-%m"))
        cursor = (cursor - timedelta(days=1)).replace(day=1)
    months.reverse()
    month_rows = dict(
        db.query(sa.func.strftime("%Y-%m", User.created_at), sa.func.count(User.id))
        .filter(User.created_at >= datetime.strptime(months[0], "%Y-%m"))
        .group_by(sa.func.strftime("%Y-%m", User.created_at))
        .all()
    )
    registrations = [{"month": m, "count": month_rows.get(m, 0)} for m in months]
    cumulative_before = count(User.created_at < datetime.strptime(months[0], "%Y-%m"))

    # 近 30 天每天登录的人数（按北京时间分日）
    start = today - timedelta(days=29)
    rows = (
        db.query(AuthLog.created_at, AuthLog.user_id)
        .filter(AuthLog.action.in_(("login", "sso_authorize", "service_access")), AuthLog.success.is_(True),
                AuthLog.created_at >= start - timedelta(hours=8))
        .all()
    )
    per_day: dict[str, set] = defaultdict(set)
    for created_at, uid in rows:
        per_day[(created_at + timedelta(hours=8)).strftime("%Y-%m-%d")].add(uid)
    bj_today = (now + timedelta(hours=8)).replace(hour=0, minute=0, second=0, microsecond=0)
    days = [(bj_today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(29, -1, -1)]
    daily_active = [{"date": d, "users": len(per_day.get(d, ()))} for d in days]

    service_rows = (
        db.query(AuthLog.service, sa.func.count(sa.distinct(AuthLog.user_id)))
        .filter(AuthLog.service.isnot(None), AuthLog.success.is_(True), AuthLog.created_at >= now - timedelta(days=30))
        .group_by(AuthLog.service)
        .all()
    )
    failed_logins_24h = (
        db.query(sa.func.count(AuthLog.id))
        .filter(AuthLog.action == "login", AuthLog.success.is_(False), AuthLog.created_at >= now - timedelta(days=1))
        .scalar()
    ) or 0
    tracking_since = db.query(sa.func.min(AuthLog.created_at)).scalar()

    return {
        "success": True,
        "users": users,
        "whitelist": whitelist,
        "blacklist": {"total": db.query(sa.func.count(EmailBlacklist.id)).scalar() or 0},
        "registrations": registrations,
        "registrations_before": cumulative_before,
        "daily_active": daily_active,
        "services": {k: v for k, v in service_rows},
        "failed_logins_24h": failed_logins_24h,
        "tracking_since": tracking_since.isoformat() if tracking_since else None,
    }


# ---------------------------------------------------------------- 审计日志（新）

@router.get("/logs")
def list_logs(page: int = 1, per_page: int = 30, action: str = "", search: str = "", result: str = "",
              user_id: int | None = Query(default=None), admin: User = Depends(admin_user),
              db: Session = Depends(get_db)):
    page, per_page = _page_args(page, per_page)
    query = db.query(AuthLog)
    if action == "admin":
        query = query.filter(AuthLog.action.like("admin.%"))
    elif action:
        query = query.filter(AuthLog.action == action)
    if result == "success":
        query = query.filter(AuthLog.success.is_(True))
    elif result == "failed":
        query = query.filter(AuthLog.success.is_(False))
    if user_id is not None:
        query = query.filter(AuthLog.user_id == user_id)
    search = search.strip()
    if search:
        pattern = _like(search)
        query = query.filter(sa.or_(AuthLog.email.like(pattern, escape="\\"),
                                    AuthLog.ip_address.like(pattern, escape="\\")))
    logs, pagination = _paginate(query.order_by(AuthLog.created_at.desc(), AuthLog.id.desc()), page, per_page)
    people = {u.id: u for u in db.query(User).filter(User.id.in_({l.user_id for l in logs if l.user_id}))}
    items = []
    for log in logs:
        data = log.to_dict()
        person = people.get(log.user_id) if log.user_id else None
        data["user_name"] = person.name if person else None
        items.append(data)
    return {"success": True, "logs": items, "pagination": pagination}


@router.get("/users/{user_id}")
def get_user(user_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise ApiError(ErrorCode.NOT_FOUND, "用户不存在", 404)
    recent = (
        db.query(AuthLog).filter(AuthLog.user_id == user.id)
        .order_by(AuthLog.created_at.desc(), AuthLog.id.desc()).limit(20).all()
    )
    blacklisted = db.query(EmailBlacklist).filter_by(email=user.email).first() is not None
    return {"success": True, "user": {**user.to_dict(), "is_blacklisted": blacklisted},
            "recent": [r.to_dict() for r in recent]}
