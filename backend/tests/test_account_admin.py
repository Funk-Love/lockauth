"""个人中心、授权跳转、管理后台、审计、头像代理、迁移。"""

import sqlite3
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

import database
from conftest import PASSWORD, auth_header, make_user, whitelist
from models import AuthLog
from services import avatar
from services.redirects import is_allowed_redirect_uri

RULES = ["http://localhost:3000", "https://funk-and.love", "https://*.funk-and.love", "https://x.example/app"]


@pytest.mark.parametrize("uri,ok", [
    ("https://cloud.funk-and.love/auth/callback", True),
    ("https://funk-and.love/", True),
    ("http://localhost:3000/cb", True),
    ("https://x.example/app/cb", True),
    ("https://x.example/application", False),
    ("http://localhost:3001/cb", False),
    ("https://ai.funk-and.love.evil.com/", False),
    ("https://evil.com/?https://ai.funk-and.love", False),
    ("https://a.b.funk-and.love/", False),
    ("https://user:pw@ai.funk-and.love/", False),
    ("http://ai.funk-and.love/", False),
    ("javascript:alert(1)", False),
    ("//ai.funk-and.love/", False),
    ("", False),
])
def test_redirect_rules(uri, ok):
    assert is_allowed_redirect_uri(uri, RULES) is ok


def test_update_profile(client, db):
    user = make_user(db)
    r = client.patch("/api/auth/me", json={"name": "  新名字 "}, headers=auth_header(user))
    assert r.status_code == 200
    assert r.json()["user"]["name"] == "新名字" and r.json()["token"]
    assert client.patch("/api/auth/me", json={"name": "a"}, headers=auth_header(user)).status_code == 400


def test_change_password_logs_out_other_sessions(client, db):
    user = make_user(db)
    old = auth_header(user)
    time.sleep(1.05)
    bad = client.post("/api/auth/me/password", json={"current_password": "nope-nope", "new_password": "whatever1"},
                      headers=old)
    assert bad.status_code == 400 and bad.json()["error"]["details"]["field"] == "current_password"
    r = client.post("/api/auth/me/password", json={"current_password": PASSWORD, "new_password": "fresh-pass-1"},
                    headers=old)
    assert r.status_code == 200
    new = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.get("/api/auth/me", headers=new).status_code == 200
    assert client.get("/api/auth/me", headers=old).status_code == 401
    assert client.post("/api/auth/verify-token", json={"token": old["Authorization"][7:]}).json()["valid"] is False


def test_sso_authorize(client, db):
    user = make_user(db)
    r = client.post("/api/auth/sso/authorize", json={"redirect_uri": "https://cloud.funk-and.love/auth/callback"},
                    headers=auth_header(user))
    assert r.status_code == 200 and r.json()["service"] == "cloud"
    assert r.json()["redirect_url"].startswith("https://cloud.funk-and.love/auth/callback?token=")
    r = client.post("/api/auth/sso/authorize", json={"redirect_uri": "https://evil.com/"}, headers=auth_header(user))
    assert r.status_code == 400
    user.is_active = False
    db.commit()
    r = client.post("/api/auth/sso/authorize", json={"redirect_uri": "https://cloud.funk-and.love/auth/callback"},
                    headers=auth_header(user))
    assert r.status_code == 401


def test_activity_and_service_access(client, db):
    user = make_user(db)
    client.post("/api/auth/login", json={"email": user.email, "password": "bad-password"})
    token = client.post("/api/auth/login", json={"email": user.email, "password": PASSWORD,
                                                 "redirect_uri": "https://cloud.funk-and.love/auth/callback"}).json()["token"]
    for _ in range(3):
        client.post("/api/auth/verify-token", json={"token": token}, headers={"Origin": "https://ai.funk-and.love"})
    body = client.get("/api/auth/me/activity", headers={"Authorization": f"Bearer {token}"}).json()
    actions = [log["action"] for log in body["logs"]]
    assert actions.count("service_access") == 1
    assert actions.count("login") == 2
    assert set(body["services"]) == {"cloud", "ai"}
    assert body["stats"]["logins_30d"] == 1 and body["stats"]["member_days"] >= 1
    assert "email" not in body["logs"][0]


def test_admin_requires_admin(client, db):
    member = make_user(db)
    assert client.get("/api/admin/users").status_code == 401
    r = client.get("/api/admin/users", headers=auth_header(member))
    assert r.status_code == 403 and r.json()["error"]["code"] == "PERM_001"


def test_admin_users(client, db):
    admin = make_user(db, "admin@zju.edu.cn", admin=True)
    for i in range(25):
        make_user(db, f"m{i}@zju.edu.cn", name=f"成员{i}")
    body = client.get("/api/admin/users?per_page=10&page=2", headers=auth_header(admin)).json()
    assert len(body["users"]) == 10
    assert body["pagination"] == {"page": 2, "per_page": 10, "total": 26, "pages": 3}
    found = client.get("/api/admin/users?search=成员1", headers=auth_header(admin)).json()
    assert found["pagination"]["total"] == 11
    underscore = client.get("/api/admin/users?search=_", headers=auth_header(admin)).json()
    assert underscore["pagination"]["total"] == 0


def test_admin_status_and_role(client, db):
    admin = make_user(db, "admin@zju.edu.cn", admin=True)
    member = make_user(db)
    h = auth_header(admin)
    r = client.put(f"/api/admin/users/{member.id}/status", json={"is_active": False}, headers=h)
    assert r.json()["user"]["is_active"] is False and r.json()["message"] == "用户状态已更新"
    assert client.put(f"/api/admin/users/{admin.id}/status", json={"is_active": False}, headers=h).status_code == 400
    assert client.put(f"/api/admin/users/{member.id}/status", json={}, headers=h).status_code == 400
    assert client.put(f"/api/admin/users/{member.id}/role", json={"is_admin": True}, headers=h).json()["user"]["is_admin"]
    assert client.put(f"/api/admin/users/{admin.id}/role", json={"is_admin": False}, headers=h).status_code == 400
    detail = client.get(f"/api/admin/users/{member.id}", headers=h).json()
    # 管理员的操作记在管理员名下，不算被操作者自己的记录
    assert detail["user"]["is_admin"] is True and detail["recent"] == []


def test_admin_blacklist(client, db):
    admin = make_user(db, "admin@zju.edu.cn", admin=True)
    make_user(db, "bad@zju.edu.cn")
    h = auth_header(admin)
    r = client.post("/api/admin/blacklist", json={"email": "Bad@zju.edu.cn", "reason": "违反规定"}, headers=h)
    assert r.status_code == 201 and r.json()["blacklist"]["email"] == "bad@zju.edu.cn"
    assert client.post("/api/admin/blacklist", json={"email": "bad@zju.edu.cn"}, headers=h).status_code == 400
    listed = client.get("/api/admin/blacklist", headers=h).json()
    assert listed["blacklist"][0]["blocker"]["email"] == "admin@zju.edu.cn"
    assert client.post("/api/auth/login", json={"email": "bad@zju.edu.cn", "password": PASSWORD}).status_code == 401
    assert client.delete("/api/admin/blacklist/bad@zju.edu.cn", headers=h).json()["message"] == "邮箱已从黑名单移除"
    assert client.delete("/api/admin/blacklist/bad@zju.edu.cn", headers=h).status_code == 400


def test_admin_whitelist(client, db):
    admin = make_user(db, "admin@zju.edu.cn", admin=True)
    h = auth_header(admin)
    r = client.post("/api/admin/whitelist", json={"email": "old@gmail.com", "name": "老队长", "note": "2019 届"}, headers=h)
    assert r.status_code == 201
    entry_id = r.json()["whitelist"]["id"]
    assert client.post("/api/admin/whitelist", json={"email": "old@gmail.com"}, headers=h).status_code == 400
    assert client.post("/api/admin/whitelist", json={"email": "x@zju.edu.cn"}, headers=h).status_code == 400
    listed = client.get("/api/admin/whitelist?search=老队", headers=h).json()
    assert listed["whitelist"][0]["adder"]["id"] == admin.id and listed["whitelist"][0]["registered"] is False
    upd = client.put(f"/api/admin/whitelist/{entry_id}", json={"note": ""}, headers=h).json()
    assert upd["whitelist"]["note"] is None and upd["whitelist"]["name"] == "老队长"
    assert client.delete(f"/api/admin/whitelist/{entry_id}", headers=h).json()["success"]
    assert client.delete(f"/api/admin/whitelist/{entry_id}", headers=h).status_code == 400


def test_admin_overview_and_logs(client, db):
    admin = make_user(db, "admin@zju.edu.cn", admin=True)
    make_user(db)
    whitelist(db, "alumni@gmail.com", admin)
    client.post("/api/auth/login", json={"email": "member@zju.edu.cn", "password": PASSWORD})
    client.post("/api/auth/login", json={"email": "member@zju.edu.cn", "password": "wrong-one"})
    h = auth_header(admin)
    ov = client.get("/api/admin/overview", headers=h).json()
    assert ov["users"]["total"] == 2 and ov["users"]["active_7d"] == 1
    assert ov["whitelist"] == {"total": 1, "registered": 0}
    assert len(ov["registrations"]) == 12 and ov["registrations"][-1]["count"] == 2
    assert len(ov["daily_active"]) == 30 and ov["daily_active"][-1]["users"] == 1
    assert ov["failed_logins_24h"] == 1
    logs = client.get("/api/admin/logs?result=failed", headers=h).json()
    assert logs["pagination"]["total"] == 1 and logs["logs"][0]["user_name"] == "小锁"
    client.put(f"/api/admin/users/{admin.id + 1}/status", json={"is_active": False}, headers=h)
    admin_logs = client.get("/api/admin/logs?action=admin", headers=h).json()
    assert admin_logs["logs"][0]["action"] == "admin.disable_user"
    assert admin_logs["logs"][0]["detail"]["target"]["email"] == "member@zju.edu.cn"


class FakeBucket:
    """代替 oss2.Bucket：记下对象，签名返回假地址。"""

    def __init__(self):
        self.objects: dict[str, tuple[int, str]] = {}
        self.deleted: list[str] = []

    def sign_url(self, method, key, expires, headers=None, slash_safe=False):
        return f"https://oss.test/{key}?sig"

    def head_object(self, key):
        import oss2

        if key not in self.objects:
            raise oss2.exceptions.NotFound(404, {}, b"", {})
        size, ctype = self.objects[key]
        return SimpleNamespace(content_length=size, content_type=ctype)

    def delete_object(self, key):
        self.deleted.append(key)
        self.objects.pop(key, None)


def test_avatar(client, db, monkeypatch):
    user = make_user(db)
    other = make_user(db, email="other@zju.edu.cn", name="小钥")
    bucket = FakeBucket()
    monkeypatch.setattr(avatar, "_oss", lambda signer=False: bucket)
    h = auth_header(user)

    assert client.get("/api/auth/me/avatar", headers=h).json() == {"success": True, "has_avatar": False, "avatar_url": None}
    assert client.post("/api/auth/me/avatar/upload-url", json={"content_type": "image/svg+xml"}, headers=h).status_code == 400
    assert client.post("/api/auth/me/avatar/upload-url", json={"content_type": "image/png", "size": 6 << 20},
                       headers=h).status_code == 400

    ticket = client.post("/api/auth/me/avatar/upload-url", json={"content_type": "image/png", "size": 1000},
                         headers=h).json()
    assert ticket["key"].startswith(f"avatars/{user.id}/") and ticket["key"].endswith(".png")
    assert ticket["headers"]["Content-Type"] == "image/png"
    # 没传上去就确认
    assert client.post("/api/auth/me/avatar", json={"key": ticket["key"]}, headers=h).status_code == 400
    # 别人目录下的 key
    assert client.post("/api/auth/me/avatar", json={"key": f"avatars/{other.id}/x.png"}, headers=h).status_code == 400

    bucket.objects[ticket["key"]] = (1000, "image/png")
    res = client.post("/api/auth/me/avatar", json={"key": ticket["key"]}, headers=h).json()
    assert res["user"]["avatar_url"].startswith("https://lock-publicfiles.oss-cn-hangzhou.aliyuncs.com/avatars/")
    assert "w_320" in res["user"]["avatar_url"]

    # 换一张：旧的删掉
    second = client.post("/api/auth/me/avatar/upload-url", json={"content_type": "image/jpeg"}, headers=h).json()
    bucket.objects[second["key"]] = (2000, "image/jpeg")
    client.post("/api/auth/me/avatar", json={"key": second["key"]}, headers=h)
    assert bucket.deleted == [ticket["key"]]

    # 传了个不是图片的东西
    bad = client.post("/api/auth/me/avatar/upload-url", json={"content_type": "image/png"}, headers=h).json()
    bucket.objects[bad["key"]] = (10, "text/html")
    assert client.post("/api/auth/me/avatar", json={"key": bad["key"]}, headers=h).status_code == 400
    assert bad["key"] in bucket.deleted

    # 查询接口
    assert "w_64" in client.get("/api/auth/me/avatar?style=avatarsm", headers=h).json()["avatar_url"]
    by_email = client.get("/api/auth/avatar/by-email?email=MEMBER@zju.edu.cn", headers=h).json()
    assert by_email["has_avatar"] and by_email["user_id"] == user.id
    assert client.get("/api/auth/avatar/by-email?email=none@zju.edu.cn", headers=h).json()["user_exists"] is False
    batch = client.post("/api/auth/avatars", json={"user_ids": [user.id, other.id, 999]}, headers=h).json()["avatars"]
    assert batch[str(user.id)]["has_avatar"] and not batch[str(other.id)]["has_avatar"] and not batch["999"]["has_avatar"]
    assert client.get(f"/api/auth/avatar/{user.id}").status_code == 401

    # verify-token 把 key 带给其他服务
    verified = client.post("/api/auth/verify-token", json={"token": h["Authorization"][7:]}).json()["user"]
    assert verified["avatar_key"] == second["key"] and verified["avatar_url"]

    res = client.delete("/api/auth/me/avatar", headers=h).json()
    assert res["user"]["avatar_url"] is None and second["key"] in bucket.deleted


def test_production_requires_jwt_secret(monkeypatch):
    """代码公开，默认密钥谁都知道：生产环境没配真密钥就不许启动。"""
    from config import DEV_JWT_SECRET, Settings

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError):
        Settings()
    monkeypatch.setenv("JWT_SECRET_KEY", DEV_JWT_SECRET)
    with pytest.raises(RuntimeError):
        Settings()
    monkeypatch.setenv("JWT_SECRET_KEY", "a-real-secret")
    assert Settings().jwt_secret_key == "a-real-secret"


def test_migrate_legacy_schema():
    """用线上库的原始表结构（Flask 版建的）跑迁移：补列、不丢数据、可重复执行。"""
    # 不用 pytest 的 tmp_path：Windows 上它建的目录有时没有读权限
    path = Path(tempfile.mkdtemp(prefix="lockauth-migrate-")) / "legacy.db"
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE users ( id INTEGER PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(100) NOT NULL, created_at DATETIME NOT NULL, last_login DATETIME,
          is_active BOOLEAN NOT NULL DEFAULT 1, is_admin BOOLEAN NOT NULL DEFAULT 0 );
        CREATE TABLE verification_codes ( id INTEGER PRIMARY KEY AUTOINCREMENT, email VARCHAR(255) NOT NULL, code VARCHAR(6) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME NOT NULL, used BOOLEAN NOT NULL DEFAULT 0 );
        CREATE TABLE email_blacklist ( id INTEGER PRIMARY KEY AUTOINCREMENT, email VARCHAR(255) UNIQUE NOT NULL, reason VARCHAR(500),
          blocked_by INTEGER NOT NULL, blocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (blocked_by) REFERENCES users(id) ON DELETE CASCADE );
        CREATE TABLE auth_logs ( id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, email VARCHAR(255), action VARCHAR(50) NOT NULL,
          ip_address VARCHAR(45), user_agent TEXT, success BOOLEAN NOT NULL DEFAULT 1, error_code VARCHAR(50), error_message TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP );
        CREATE TABLE email_whitelist ( id INTEGER NOT NULL, email VARCHAR(255) NOT NULL, name VARCHAR(100), note VARCHAR(500),
          added_by INTEGER NOT NULL, added_at DATETIME NOT NULL, PRIMARY KEY (id), FOREIGN KEY(added_by) REFERENCES users (id) );
        INSERT INTO users VALUES (1, 'a@zju.edu.cn', 'x', '甲', '2025-11-10 10:50:04.913005', NULL, 1, 1);
    """)
    conn.commit()
    conn.close()
    database.init_engine(f"sqlite:///{path.as_posix()}")
    database.migrate()
    database.migrate()
    conn = sqlite3.connect(path)
    user_cols = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    log_cols = {row[1] for row in conn.execute("PRAGMA table_info(auth_logs)")}
    assert {"password_changed_at", "avatar_key"} <= user_cols and {"service", "detail"} <= log_cols
    assert conn.execute("SELECT name FROM users WHERE id = 1").fetchone() == ("甲",)
    conn.close()
    session = database.SessionLocal()
    session.add(AuthLog(action="login", user_id=1))
    session.commit()
    session.close()
    database.engine.dispose()
    database.init_engine("sqlite:///:memory:")
