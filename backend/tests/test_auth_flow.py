"""登录 / 注册 / 验证码 / Token：与旧版接口的兼容性。"""

import time
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from conftest import PASSWORD, auth_header, latest_code, make_user, whitelist
from config import settings
from models import EmailBlacklist, VerificationCode


def test_health(client):
    assert client.get("/health").json() == {"status": "healthy"}
    assert client.get("/").json()["status"] == "running"


def test_unknown_route_uses_error_format(client):
    r = client.get("/api/auth/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_send_code_zju(client, db):
    r = client.post("/api/auth/send-code", json={"email": " New@ZJU.edu.cn "})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] and body["message"] == "验证码已发送"
    assert 590 <= body["expires_in"] <= 600
    assert body["is_whitelisted"] is False
    assert len(latest_code(db, "new@zju.edu.cn")) == 6


def test_send_code_rejects_other_domains(client):
    r = client.post("/api/auth/send-code", json={"email": "someone@gmail.com"})
    assert r.status_code == 400
    assert r.json()["error"] == {"code": "VAL_001", "message": "请使用 @zju.edu.cn 邮箱", "details": {"field": "email"}}


def test_send_code_whitelisted_alumni(client, db):
    admin = make_user(db, "admin@zju.edu.cn", admin=True)
    whitelist(db, "alumni@gmail.com", admin)
    r = client.post("/api/auth/send-code", json={"email": "alumni@gmail.com"})
    assert r.status_code == 200 and r.json()["is_whitelisted"] is True


def test_send_code_cooldown(client):
    assert client.post("/api/auth/send-code", json={"email": "a@zju.edu.cn"}).status_code == 200
    r = client.post("/api/auth/send-code", json={"email": "a@zju.edu.cn"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "RATE_001"
    assert int(r.headers["Retry-After"]) > 0


def test_send_code_missing_email(client):
    r = client.post("/api/auth/send-code", json={})
    assert r.status_code == 400
    assert r.json()["error"]["message"] == "缺少必填字段: email"
    r = client.post("/api/auth/send-code", content=b"not json", headers={"content-type": "application/json"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "VAL_001"


def test_send_code_register_for_existing_email(client, db):
    make_user(db)
    r = client.post("/api/auth/send-code", json={"email": "member@zju.edu.cn"})
    assert r.json()["error"]["code"] == "AUTH_005"


def test_send_code_reset_for_unknown_email(client):
    r = client.post("/api/auth/send-code", json={"email": "ghost@zju.edu.cn", "purpose": "reset_password"})
    assert r.status_code == 400 and r.json()["error"]["message"] == "该邮箱未注册"


def _register(client, db, email="new@zju.edu.cn", **extra):
    client.post("/api/auth/send-code", json={"email": email})
    code = latest_code(db, email)
    return client.post("/api/auth/register", json={"email": email, "password": "hunter22", "name": "新成员",
                                                   "code": code, **extra})


def test_register_success(client, db):
    r = _register(client, db)
    assert r.status_code == 201
    body = r.json()
    assert body["message"] == "注册成功"
    assert set(body["user"]) == {"id", "email", "name", "created_at", "last_login", "is_active", "is_admin",
                                 "avatar_url"}
    assert "token" not in body and "redirect_url" not in body
    login = client.post("/api/auth/login", json={"email": "new@zju.edu.cn", "password": "hunter22"})
    assert login.status_code == 200


def test_register_with_redirect(client, db):
    r = _register(client, db, redirect_uri="https://cloud.funk-and.love/auth/callback")
    url = r.json()["redirect_url"]
    assert url.startswith("https://cloud.funk-and.love/auth/callback?token=")
    assert "user_id=" in url and "email=new%40zju.edu.cn" in url


def test_register_wrong_code(client, db):
    client.post("/api/auth/send-code", json={"email": "x@zju.edu.cn"})
    r = client.post("/api/auth/register", json={"email": "x@zju.edu.cn", "password": "hunter22", "name": "某某",
                                                "code": "000000" if latest_code(db, "x@zju.edu.cn") != "000000" else "111111"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "AUTH_003"


def test_register_code_cannot_be_reused(client, db):
    _register(client, db, email="once@zju.edu.cn")
    code = latest_code(db, "once@zju.edu.cn")
    db.query(EmailBlacklist).delete()
    r = client.post("/api/auth/register", json={"email": "once@zju.edu.cn", "password": "hunter22", "name": "某某",
                                                "code": code})
    assert r.json()["error"]["code"] == "AUTH_005"


def test_code_guessing_is_capped(client, db):
    client.post("/api/auth/send-code", json={"email": "g@zju.edu.cn"})
    real = latest_code(db, "g@zju.edu.cn")
    wrong = [f"{i:06d}" for i in range(20) if f"{i:06d}" != real][:8]
    for code in wrong:
        client.post("/api/auth/register", json={"email": "g@zju.edu.cn", "password": "hunter22", "name": "某某",
                                                 "code": code})
    r = client.post("/api/auth/register", json={"email": "g@zju.edu.cn", "password": "hunter22", "name": "某某",
                                                "code": real})
    assert r.status_code == 400 and "次数太多" in r.json()["error"]["message"]


def test_register_expired_code(client, db):
    client.post("/api/auth/send-code", json={"email": "late@zju.edu.cn"})
    record = db.query(VerificationCode).filter_by(email="late@zju.edu.cn").first()
    record.expires_at = datetime.utcnow() - timedelta(seconds=1)
    db.commit()
    r = client.post("/api/auth/register", json={"email": "late@zju.edu.cn", "password": "hunter22", "name": "某某",
                                                "code": record.code})
    assert r.json()["error"]["message"] == "验证码已过期，请重新获取"


def test_register_validation_messages(client):
    r = client.post("/api/auth/register", json={"email": "v@zju.edu.cn", "password": "hunter22", "name": "某某"})
    assert r.json()["error"]["message"] == "缺少必填字段: code"
    r = client.post("/api/auth/register", json={"email": "v@zju.edu.cn", "password": "123", "name": "某某", "code": "123456"})
    assert r.json()["error"]["message"] == "密码长度至少为 6 位"
    r = client.post("/api/auth/register", json={"email": "v@gmail.com", "password": "hunter22", "name": "某某", "code": "123456"})
    assert r.json()["error"]["code"] == "AUTH_002"


def test_login_success_shape(client, db):
    make_user(db)
    r = client.post("/api/auth/login", json={"email": "MEMBER@zju.edu.cn", "password": PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["message"] == "登录成功" and body["token"] and body["user"]["last_login"]


def test_login_wrong_password(client, db):
    make_user(db)
    r = client.post("/api/auth/login", json={"email": "member@zju.edu.cn", "password": "nope-nope"})
    assert r.status_code == 401 and r.json()["error"] == {"code": "AUTH_001", "message": "邮箱或密码错误"}
    r = client.post("/api/auth/login", json={"email": "ghost@zju.edu.cn", "password": "nope-nope"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "AUTH_001"


def test_login_disabled_and_blacklisted(client, db):
    make_user(db, "off@zju.edu.cn", active=False)
    r = client.post("/api/auth/login", json={"email": "off@zju.edu.cn", "password": PASSWORD})
    assert r.status_code == 401 and r.json()["error"]["code"] == "AUTH_006"
    admin = make_user(db, "admin@zju.edu.cn", admin=True)
    make_user(db, "bad@zju.edu.cn")
    db.add(EmailBlacklist(email="bad@zju.edu.cn", reason="test", blocked_by=admin.id))
    db.commit()
    r = client.post("/api/auth/login", json={"email": "bad@zju.edu.cn", "password": PASSWORD})
    assert r.status_code == 401 and r.json()["error"]["code"] == "AUTH_007"


def test_login_bruteforce_lock(client, db):
    make_user(db)
    for _ in range(8):
        client.post("/api/auth/login", json={"email": "member@zju.edu.cn", "password": "wrong-pass"})
    r = client.post("/api/auth/login", json={"email": "member@zju.edu.cn", "password": PASSWORD})
    assert r.status_code == 429


def test_login_redirects(client, db):
    make_user(db)
    ok = client.post("/api/auth/login", json={"email": "member@zju.edu.cn", "password": PASSWORD,
                                              "redirect_uri": "https://ai.funk-and.love/callback?next=%2Fchat"}).json()
    assert ok["redirect_url"].startswith("https://ai.funk-and.love/callback?next=%2Fchat&token=")
    evil = client.post("/api/auth/login", json={"email": "member@zju.edu.cn", "password": PASSWORD,
                                                "redirect_uri": "https://ai.funk-and.love.evil.com/"}).json()
    assert "redirect_url" not in evil and evil["token"]


def test_me_refresh_verify(client, db):
    user = make_user(db)
    headers = auth_header(user)
    assert client.get("/api/auth/me", headers=headers).json()["user"]["email"] == user.email
    fresh = client.post("/api/auth/refresh", headers=headers).json()
    assert fresh["message"] == "Token 刷新成功" and fresh["token"]
    v = client.post("/api/auth/verify-token", json={"token": fresh["token"]}).json()
    assert v == {"success": True, "valid": True, "user": {"id": user.id, "email": user.email, "name": user.name,
                                                          "is_active": True, "is_admin": False,
                                                          "avatar_key": None, "avatar_url": None}}


def test_missing_and_bad_tokens(client, db):
    r = client.get("/api/auth/me")
    assert r.status_code == 401 and r.json()["error"]["message"] == "缺少或无效的 Authorization 头"
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer abc.def.ghi"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "AUTH_004"
    assert client.post("/api/auth/verify-token", json={"token": "garbage"}).json() == {
        "success": True, "valid": False, "message": "Token 无效"}
    assert client.post("/api/auth/verify-token", json={}).status_code == 400


def test_alg_none_and_tampered_rejected(client, db):
    user = make_user(db)
    unsigned = jwt.encode({"sub": str(user.id), "user_id": user.id, "exp": int(time.time()) + 60, "type": "access"},
                          key=None, algorithm="none")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401
    other = jwt.encode({"sub": str(user.id), "user_id": user.id, "exp": int(time.time()) + 60}, "wrong-key-0123456789abcdef0123456789", algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {other}"}).status_code == 401


def test_expired_token(client, db):
    user = make_user(db)
    past = datetime.now(timezone.utc) - timedelta(days=8)
    token = jwt.encode({"sub": str(user.id), "user_id": user.id, "iat": past, "nbf": past, "exp": past + timedelta(days=7),
                        "type": "access"}, settings.jwt_secret_key, algorithm="HS256")
    assert client.post("/api/auth/verify-token", json={"token": token}).json()["message"] == "Token 已过期"


def test_flask_jwt_extended_token_shape_accepted(client, db):
    """旧版签发的 Token：sub 是字符串、带 fresh/jti/csrf 无关字段。"""
    user = make_user(db)
    now = datetime.now(timezone.utc)
    legacy = jwt.encode({
        "fresh": False, "iat": now, "jti": str(uuid.uuid4()), "type": "access", "sub": str(user.id), "nbf": now,
        "exp": now + timedelta(days=7), "user_id": user.id, "email": user.email, "name": user.name,
    }, settings.jwt_secret_key, algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {legacy}"}).status_code == 200
    refresh_type = jwt.encode({"sub": str(user.id), "exp": now + timedelta(days=1), "type": "refresh"},
                              settings.jwt_secret_key, algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {refresh_type}"}).status_code == 401


def test_verify_token_disabled_user(client, db):
    user = make_user(db)
    token = auth_header(user)["Authorization"].split()[1]
    user.is_active = False
    db.commit()
    assert client.post("/api/auth/verify-token", json={"token": token}).json()["message"] == "用户账号已被禁用"
    assert client.post("/api/auth/refresh", headers={"Authorization": f"Bearer {token}"}).json()["error"]["code"] == "AUTH_006"


def test_reset_password_flow(client, db):
    user = make_user(db)
    old_token = auth_header(user)
    time.sleep(1.05)
    client.post("/api/auth/send-code", json={"email": user.email, "purpose": "reset_password"})
    code = latest_code(db, user.email)
    r = client.post("/api/auth/reset-password", json={"email": user.email, "password": "brand-new-pw", "code": code})
    assert r.json() == {"success": True, "message": "密码重置成功"}
    assert client.post("/api/auth/login", json={"email": user.email, "password": "brand-new-pw"}).status_code == 200
    assert client.get("/api/auth/me", headers=old_token).status_code == 401


def test_check_whitelist(client, db):
    admin = make_user(db, "admin@zju.edu.cn", admin=True)
    whitelist(db, "alumni@qq.com", admin, name="老队员")
    assert client.post("/api/auth/check-whitelist", json={"email": "x@zju.edu.cn"}).json()["is_zju_email"] is True
    hit = client.post("/api/auth/check-whitelist", json={"email": "alumni@qq.com"}).json()
    assert hit["is_whitelisted"] is True and hit["whitelist_info"]["name"] == "老队员"
    assert client.post("/api/auth/check-whitelist", json={"email": "no@qq.com"}).json()["is_whitelisted"] is False


def test_whitelist_emails_no_longer_public(client, db):
    admin = make_user(db, "admin@zju.edu.cn", admin=True)
    member = make_user(db)
    assert client.get("/api/auth/whitelist-emails").status_code == 401
    assert client.get("/api/auth/whitelist-emails", headers=auth_header(member)).status_code == 403
    assert client.get("/api/auth/whitelist-emails", headers=auth_header(admin)).json()["success"] is True


def test_sso_config(client):
    body = client.get("/api/auth/sso/config").json()
    assert body["success"] and body["sso_login_url"].endswith("/login")


def test_cors(client):
    r = client.options("/api/auth/login", headers={"Origin": "https://cloud.funk-and.love",
                                                   "Access-Control-Request-Method": "POST",
                                                   "Access-Control-Request-Headers": "content-type,authorization"})
    assert r.headers["access-control-allow-origin"] == "https://cloud.funk-and.love"
    assert r.headers["access-control-allow-credentials"] == "true"
    r = client.options("/api/auth/login", headers={"Origin": "https://evil.example",
                                                   "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in r.headers
