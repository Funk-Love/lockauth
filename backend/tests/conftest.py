"""测试环境：内存 SQLite、不真发邮件、固定的 JWT 密钥。"""

import os
import sys

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BACKEND_DIR)

# 必须在导入 config 之前设置（load_dotenv 不会覆盖已有的环境变量）
os.environ.update({
    "APP_ENV": "testing",
    "DATABASE_URL": "sqlite:///:memory:",
    "JWT_SECRET_KEY": "test-secret-key-for-lockauth-tests-0123456789",
    "MAIL_SUPPRESS_SEND": "true",
    "LOG_TO_FILE": "false",
    "CORS_ORIGINS": "http://localhost:3000,https://ai.funk-and.love,https://cloud.funk-and.love",
    "ALLOWED_REDIRECT_URIS": "http://localhost:3000,https://funk-and.love,https://cloud.funk-and.love,https://*.funk-and.love",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import database  # noqa: E402
from app import app  # noqa: E402
from models import EmailWhitelist, User, VerificationCode  # noqa: E402
from ratelimit import limiter  # noqa: E402
from security import create_token, hash_password  # noqa: E402
from services import audit  # noqa: E402

PASSWORD = "secret123"


@pytest.fixture()
def client():
    database.init_engine("sqlite:///:memory:")
    limiter.clear()
    audit.reset_access_cache()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def db(client):
    session = database.SessionLocal()
    yield session
    session.close()


def make_user(db, email="member@zju.edu.cn", name="小锁", admin=False, active=True, password=PASSWORD) -> User:
    user = User(email=email, name=name, password_hash=hash_password(password), is_admin=admin, is_active=active)
    db.add(user)
    db.commit()
    return user


def auth_header(user: User) -> dict:
    return {"Authorization": f"Bearer {create_token(user)}"}


def latest_code(db, email: str) -> str:
    db.expire_all()
    return db.query(VerificationCode).filter_by(email=email).order_by(VerificationCode.id.desc()).first().code


def whitelist(db, email: str, by: User, name="校友") -> None:
    db.add(EmailWhitelist(email=email, name=name, added_by=by.id))
    db.commit()
