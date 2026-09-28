"""/api/auth：登录、注册、验证码、Token，以及给其他服务用的校验与头像接口。

路径、请求体、返回结构都与 Flask 版一致；新接口在文件后半部分。
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from deps import RequestMeta, admin_user, current_user, request_meta, token_payload
from errors import ApiError, ErrorCode, invalid
from models import EmailBlacklist, EmailWhitelist, User
from ratelimit import enforce, limiter, too_many
from schemas import (
    AuthorizeBody,
    AvatarsBody,
    EmailBody,
    LoginBody,
    RegisterBody,
    ResetPasswordBody,
    SendCodeBody,
    TokenBody,
)
from security import (
    TokenExpired,
    TokenInvalid,
    burn_password_check,
    check_password,
    create_token,
    decode_token,
    hash_password,
    issued_before_password_change,
)
from services import audit, avatar, codes, mailer
from services.catalog import service_for_url
from services.redirects import build_redirect_url, is_allowed_redirect_uri
from validation import (
    check_email_allowed,
    check_email_format,
    check_password as check_password_rules,
    clean_code,
    clean_name,
    is_zju,
    normalize_email,
    require,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

LOGIN_FAIL_LIMIT = 8
LOGIN_FAIL_WINDOW = 15 * 60


def _blacklisted(db: Session, email: str) -> bool:
    return db.query(EmailBlacklist).filter_by(email=email).first() is not None


def _redirect_for(redirect_uri: str | None, token: str, user: User) -> tuple[str | None, str | None, bool]:
    """(redirect_url, service, 是否给了但不合法)"""
    redirect_uri = (redirect_uri or "").strip()
    if not redirect_uri:
        return None, None, False
    if not is_allowed_redirect_uri(redirect_uri):
        return None, None, True
    return build_redirect_url(redirect_uri, token, user), service_for_url(redirect_uri), False


# ---------------------------------------------------------------- 公开配置

@router.get("/sso/config")
def sso_config():
    base = settings.frontend_url
    return {"success": True, "sso_login_url": f"{base}/login", "sso_frontend_url": base}


# ---------------------------------------------------------------- 验证码

@router.post("/send-code")
def send_code(body: SendCodeBody, db: Session = Depends(get_db), meta: RequestMeta = Depends(request_meta)):
    enforce(f"send-code:{meta.ip}", 10, 60)
    enforce(f"send-code-h:{meta.ip}", 40, 3600)
    email = normalize_email(body.email)
    purpose = body.purpose or "register"
    is_whitelisted = check_email_allowed(db, email)

    if purpose == "reset_password" and not db.query(User).filter_by(email=email).first():
        raise invalid("该邮箱未注册", "email")
    if purpose == "register" and db.query(User).filter_by(email=email).first():
        raise ApiError(ErrorCode.AUTH_EMAIL_EXISTS, "该邮箱已被注册", 400, {"field": "email"})
    if _blacklisted(db, email):
        raise ApiError(ErrorCode.AUTH_EMAIL_BLACKLISTED, "该邮箱已被封禁", 400, {"field": "email"})

    record = codes.issue(db, email)
    mailer.send_code_email(email, record.code, purpose, record.expires_at)
    expires_in = max(0, int((record.expires_at - datetime.utcnow()).total_seconds()))
    return {
        "success": True,
        "message": "验证码已发送",
        "expires_in": expires_in,
        "resend_after": codes.RESEND_COOLDOWN,
        "is_whitelisted": is_whitelisted,
    }


@router.post("/check-whitelist")
def check_whitelist(body: EmailBody, db: Session = Depends(get_db)):
    email = normalize_email(body.email)
    check_email_format(email)
    if is_zju(email):
        return {"success": True, "is_whitelisted": False, "is_zju_email": True, "message": "浙大邮箱无需白名单验证"}
    entry = db.query(EmailWhitelist).filter_by(email=email).first()
    if entry:
        return {"success": True, "is_whitelisted": True, "whitelist_info": {"name": entry.name, "note": entry.note}}
    return {"success": True, "is_whitelisted": False, "message": "该邮箱不在校友白名单中"}


# ---------------------------------------------------------------- 注册 / 登录

@router.post("/register", status_code=201)
def register(body: RegisterBody, db: Session = Depends(get_db), meta: RequestMeta = Depends(request_meta)):
    enforce(f"register:{meta.ip}", 10, 60)
    email = normalize_email(body.email)
    password = require(body.password, "password")
    name = clean_name(body.name)
    code_raw = require(body.code, "code")
    try:
        check_email_allowed(db, email)
    except ApiError as exc:
        if exc.message.startswith("请使用"):
            exc.code = ErrorCode.AUTH_INVALID_DOMAIN
        raise
    check_password_rules(password)
    code = clean_code(code_raw)

    if db.query(User).filter_by(email=email).first():
        raise ApiError(ErrorCode.AUTH_EMAIL_EXISTS, "该邮箱已被注册", 400)
    if _blacklisted(db, email):
        raise ApiError(ErrorCode.AUTH_EMAIL_BLACKLISTED, "该邮箱已被封禁，无法注册", 400)
    try:
        codes.consume(db, email, code)
    except ApiError as exc:
        audit.record(db, "register", meta, email=email, success=False, error_code=exc.code, error_message=exc.message)
        raise

    user = User(email=email, name=name, password_hash=hash_password(password), created_at=datetime.utcnow(),
                is_active=True, is_admin=False)
    db.add(user)
    db.commit()

    data: dict = {"success": True, "message": "注册成功", "user": user.to_dict()}
    token = create_token(user)
    redirect_url, service, rejected = _redirect_for(body.redirect_uri, token, user)
    if redirect_url:
        data["redirect_url"] = redirect_url
    audit.record(db, "register", meta, user=user, service=service,
                 detail={"invalid_redirect_uri": body.redirect_uri} if rejected else None)
    return JSONResponse(data, status_code=201)


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db), meta: RequestMeta = Depends(request_meta)):
    enforce(f"login:{meta.ip}", 20, 60)
    email = normalize_email(body.email)
    password = require(body.password, "password")
    fail_key = f"login-fail:{email}"
    wait = limiter.peek(fail_key, LOGIN_FAIL_LIMIT)
    if wait is not None:
        raise too_many(wait, "尝试次数过多，请稍后再试")

    def fail(code: str, message: str, user: User | None = None) -> ApiError:
        audit.record(db, "login", meta, user=user, email=email, success=False, error_code=code, error_message=message,
                     service=service_for_url(body.redirect_uri))
        return ApiError(code, message, 401)

    user = db.query(User).filter_by(email=email).first()
    if user is None:
        burn_password_check(password)
        limiter.hit(fail_key, LOGIN_FAIL_LIMIT, LOGIN_FAIL_WINDOW)
        raise fail(ErrorCode.AUTH_INVALID_CREDENTIALS, "邮箱或密码错误")
    if not check_password(password, user.password_hash):
        limiter.hit(fail_key, LOGIN_FAIL_LIMIT, LOGIN_FAIL_WINDOW)
        raise fail(ErrorCode.AUTH_INVALID_CREDENTIALS, "邮箱或密码错误", user)
    if not user.is_active:
        raise fail(ErrorCode.AUTH_ACCOUNT_DISABLED, "账号已被禁用", user)
    if _blacklisted(db, email):
        raise fail(ErrorCode.AUTH_EMAIL_BLACKLISTED, "该邮箱已被封禁", user)

    limiter.reset(fail_key)
    user.last_login = datetime.utcnow()
    db.commit()
    token = create_token(user)
    data: dict = {"success": True, "message": "登录成功", "token": token, "user": user.to_dict()}
    redirect_url, service, rejected = _redirect_for(body.redirect_uri, token, user)
    if redirect_url:
        data["redirect_url"] = redirect_url
    audit.record(db, "login", meta, user=user, service=service,
                 detail={"invalid_redirect_uri": body.redirect_uri} if rejected else None)
    return data


def _eligible_user(db: Session, payload: dict) -> User:
    """refresh / authorize 共用：Token 对应的账号必须仍然可用。"""
    user = db.get(User, payload["user_id"])
    if not user:
        raise ApiError(ErrorCode.AUTH_INVALID_TOKEN, "用户不存在", 401)
    if issued_before_password_change(payload, user):
        raise ApiError(ErrorCode.AUTH_INVALID_TOKEN, "密码已修改，请重新登录", 401)
    if not user.is_active:
        raise ApiError(ErrorCode.AUTH_ACCOUNT_DISABLED, "账号已被禁用", 401)
    if _blacklisted(db, user.email):
        raise ApiError(ErrorCode.AUTH_EMAIL_BLACKLISTED, "该邮箱已被封禁", 401)
    return user


@router.post("/refresh")
def refresh(payload: dict = Depends(token_payload), db: Session = Depends(get_db)):
    user = _eligible_user(db, payload)
    return {"success": True, "message": "Token 刷新成功", "token": create_token(user), "user": user.to_dict()}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"success": True, "user": user.to_dict()}


@router.post("/verify-token")
def verify_token(body: TokenBody, request: Request, db: Session = Depends(get_db),
                 meta: RequestMeta = Depends(request_meta)):
    if not body.token:
        raise invalid("请提供 token", "token")
    try:
        payload = decode_token(body.token)
    except TokenExpired:
        return {"success": True, "valid": False, "message": "Token 已过期"}
    except TokenInvalid:
        return {"success": True, "valid": False, "message": "Token 无效"}
    user = db.get(User, payload["user_id"])
    if not user:
        return {"success": True, "valid": False, "message": "用户不存在"}
    if issued_before_password_change(payload, user):
        return {"success": True, "valid": False, "message": "密码已修改，请重新登录"}
    if not user.is_active:
        return {"success": True, "valid": False, "message": "用户账号已被禁用"}
    if _blacklisted(db, user.email):
        return {"success": True, "valid": False, "message": "用户邮箱已被封禁"}
    # LockAI 前端直接从浏览器来验，带 Origin；LockCloud 走服务端，登录那一刻已经记过
    audit.record_service_access(db, user, service_for_url(request.headers.get("origin")), meta)
    return {
        "success": True,
        "valid": True,
        "user": {"id": user.id, "email": user.email, "name": user.name, "is_active": user.is_active,
                 "is_admin": user.is_admin, "avatar_key": user.avatar_key,
                 "avatar_url": avatar.url(user.avatar_key)},
    }


@router.post("/reset-password")
def reset_password(body: ResetPasswordBody, db: Session = Depends(get_db), meta: RequestMeta = Depends(request_meta)):
    enforce(f"reset:{meta.ip}", 10, 60)
    email = normalize_email(body.email)
    password = require(body.password, "password")
    code_raw = require(body.code, "code")
    check_email_format(email)
    check_password_rules(password)
    code = clean_code(code_raw)

    user = db.query(User).filter_by(email=email).first()
    if not user:
        raise invalid("该邮箱未注册")
    if not user.is_active:
        raise ApiError(ErrorCode.AUTH_ACCOUNT_DISABLED, "账号已被禁用", 400)
    if _blacklisted(db, email):
        raise ApiError(ErrorCode.AUTH_EMAIL_BLACKLISTED, "该邮箱已被封禁", 400)
    try:
        codes.consume(db, email, code)
    except ApiError as exc:
        audit.record(db, "reset_password", meta, user=user, success=False, error_code=exc.code,
                     error_message=exc.message)
        raise

    user.password_hash = hash_password(password)
    user.password_changed_at = datetime.utcnow()
    db.commit()
    limiter.reset(f"login-fail:{email}")
    audit.record(db, "reset_password", meta, user=user)
    return {"success": True, "message": "密码重置成功"}


@router.get("/whitelist-emails")
def whitelist_emails(db: Session = Depends(get_db), _: User = Depends(admin_user)):
    """旧版对所有人公开，会泄露校友邮箱；现在只给管理员。"""
    entries = db.query(EmailWhitelist).all()
    registered = {u.email for u in db.query(User.email).filter(User.email.in_([e.email for e in entries]))}
    return {
        "success": True,
        "emails": [e.email for e in entries],
        "whitelist": [{"email": e.email, "name": e.name, "registered": e.email in registered} for e in entries],
    }


# ---------------------------------------------------------------- 头像（查询；上传在 account.py）

@router.get("/avatar/by-email")
def avatar_by_email(email: str = Query(default=""), style: str = Query(default="avatarmd"),
                    db: Session = Depends(get_db), _: dict = Depends(token_payload)):
    email = email.strip().lower()
    if not email:
        raise invalid("请提供 email 参数", "email")
    user = db.query(User).filter_by(email=email).first()
    if not user:
        return {"success": True, "has_avatar": False, "avatar_url": None, "user_exists": False}
    return {**avatar.result(user, style), "user_exists": True, "user_id": user.id, "user_name": user.name}


@router.get("/avatar/{user_id}")
def avatar_by_id(user_id: int, style: str = Query(default="avatarmd"), db: Session = Depends(get_db),
                 _: dict = Depends(token_payload)):
    return avatar.result(db.get(User, user_id), style)


@router.post("/avatars")
def avatars(body: AvatarsBody, db: Session = Depends(get_db), _: dict = Depends(token_payload)):
    if body.user_ids is None:
        raise invalid("请提供 user_ids 参数", "user_ids")
    ids = body.user_ids[:200]
    users = {u.id: u for u in db.query(User).filter(User.id.in_(ids))} if ids else {}
    return {"success": True, "avatars": {str(i): avatar.result(users.get(i), body.style) for i in ids}}


@router.get("/me/avatar")
def my_avatar(style: str = Query(default="avatarmd"), user: User = Depends(current_user)):
    return avatar.result(user, style)


# ---------------------------------------------------------------- 新：已登录时一键授权跳转

@router.post("/sso/authorize")
def sso_authorize(body: AuthorizeBody, payload: dict = Depends(token_payload), db: Session = Depends(get_db),
                  meta: RequestMeta = Depends(request_meta)):
    """已经在 Auth 登录过的人，从其他服务过来时不用再输密码。"""
    redirect_uri = (body.redirect_uri or "").strip()
    if not redirect_uri:
        raise invalid("请提供 redirect_uri", "redirect_uri")
    if not is_allowed_redirect_uri(redirect_uri):
        raise invalid("不允许跳转到这个地址", "redirect_uri")
    user = _eligible_user(db, payload)
    user.last_login = datetime.utcnow()
    db.commit()
    token = create_token(user)
    service = service_for_url(redirect_uri)
    audit.record(db, "sso_authorize", meta, user=user, service=service)
    return {"success": True, "redirect_url": build_redirect_url(redirect_uri, token, user), "service": service,
            "token": token}
