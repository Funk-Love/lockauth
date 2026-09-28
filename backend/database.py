"""数据库：SQLAlchemy 2.0，每个请求一个会话（FastAPI 依赖 get_db）。

生产库是 instance/auth.db（SQLite）。表结构沿用 Flask 版建的表，
新功能需要的列在 migrate() 里用 ALTER TABLE 补，只加不删，可以反复执行。
"""

from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from datetime import datetime, timedelta

import sqlalchemy as sa
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import BACKEND_DIR, settings

logger = logging.getLogger(__name__)

INSTANCE_DIR = BACKEND_DIR / "instance"
DEFAULT_DATABASE_URL = "sqlite:///auth.db"


class Base(DeclarativeBase):
    pass


def resolve_database_url(raw: str | None) -> sa.URL:
    """相对路径的 SQLite 放进 instance/，和 Flask 版的位置一致。"""
    url = make_url(raw or DEFAULT_DATABASE_URL)
    if url.get_backend_name() == "sqlite":
        database = url.database or ""
        if database and database != ":memory:" and not os.path.isabs(database):
            INSTANCE_DIR.mkdir(parents=True, exist_ok=True)
            url = url.set(database=str(INSTANCE_DIR / database))
    return url


engine: sa.Engine | None = None
SessionLocal = sessionmaker(autoflush=False, expire_on_commit=False)


def init_engine(url: str | None = None) -> sa.Engine:
    """建引擎；重复调用会换库（测试用）。"""
    global engine
    resolved = resolve_database_url(url or settings.database_url)
    kwargs: dict = {}
    if resolved.get_backend_name() == "sqlite":
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 15}
        if resolved.database in (None, "", ":memory:"):
            # 内存库只有一条连接，所有线程共用，否则每个线程看到的是不同的空库
            kwargs["poolclass"] = sa.pool.StaticPool
    if engine is not None:
        engine.dispose()
    engine = sa.create_engine(resolved, **kwargs)
    SessionLocal.configure(bind=engine)
    return engine


def get_db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# (表, 列, DDL)：老库缺哪列补哪列
_ADDED_COLUMNS = [
    ("users", "password_changed_at", "ALTER TABLE users ADD COLUMN password_changed_at DATETIME"),
    ("users", "avatar_key", "ALTER TABLE users ADD COLUMN avatar_key VARCHAR(500)"),
    ("auth_logs", "service", "ALTER TABLE auth_logs ADD COLUMN service VARCHAR(50)"),
    ("auth_logs", "detail", "ALTER TABLE auth_logs ADD COLUMN detail TEXT"),
]


def migrate() -> None:
    """建缺失的表、补缺失的列、清理过期数据。"""
    import models  # noqa: F401  注册所有模型

    assert engine is not None
    Base.metadata.create_all(engine)
    inspector = sa.inspect(engine)
    with engine.begin() as conn:
        for table, column, ddl in _ADDED_COLUMNS:
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(sa.text(ddl))
                logger.info("[DB] 已添加 %s.%s 列", table, column)
        if "idx_auth_logs_service" not in {i["name"] for i in inspector.get_indexes("auth_logs")}:
            conn.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_auth_logs_service ON auth_logs(service)"))

        now = datetime.utcnow()
        cutoff = now - timedelta(days=settings.audit_retention_days)
        pruned = conn.execute(sa.text("DELETE FROM auth_logs WHERE created_at < :cutoff"), {"cutoff": cutoff})
        if pruned.rowcount:
            logger.info("[DB] 清理了 %s 条过期登录记录", pruned.rowcount)
        # 验证码只有 10 分钟有效，留 30 天足够排查问题
        conn.execute(sa.text("DELETE FROM verification_codes WHERE created_at < :cutoff"), {"cutoff": now - timedelta(days=30)})
