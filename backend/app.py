"""
LockAuth 后端入口（FastAPI）。

开发：python app.py            （默认端口 5000，读取 backend/.env）
生产：gunicorn -c gunicorn.conf.py asgi:app
接口文档：/docs（仅非生产环境）
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import database
from config import BACKEND_DIR, settings
from errors import ApiError, ErrorCode, error_response
from routers import account, admin, auth

VERSION = "2.0.0"
logger = logging.getLogger("lockauth")


def configure_logging() -> None:
    root = logging.getLogger()
    if getattr(root, "_lockauth_configured", False):
        return
    root._lockauth_configured = True  # type: ignore[attr-defined]
    root.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s", "%Y-%m-%d %H:%M:%S")
    console = logging.StreamHandler()
    console.setFormatter(fmt)
    root.addHandler(console)
    if os.getenv("LOG_TO_FILE", "true").lower() != "false":
        logs_dir = BACKEND_DIR / "logs"
        logs_dir.mkdir(exist_ok=True)
        for name, level in (("auth.log", logging.INFO), ("error.log", logging.ERROR)):
            handler = RotatingFileHandler(logs_dir / name, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8")
            handler.setLevel(level)
            handler.setFormatter(fmt)
            root.addHandler(handler)
    logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    if database.engine is None:
        database.init_engine()
    database.migrate()
    logger.info("LockAuth %s 启动（%s）", VERSION, settings.env)
    yield


app = FastAPI(
    title="LockAuth",
    version=VERSION,
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Retry-After"],
    max_age=3600,
)


@app.exception_handler(ApiError)
async def _on_api_error(_: Request, exc: ApiError):
    return error_response(exc.code, exc.message, exc.status, exc.details, exc.headers)


@app.exception_handler(RequestValidationError)
async def _on_validation_error(_: Request, exc: RequestValidationError):
    errors = exc.errors()
    first = errors[0] if errors else {}
    loc = [str(part) for part in first.get("loc", ()) if part not in ("body", "query", "path")]
    if first.get("type") in ("missing", "model_attributes_type", "dict_type", "json_invalid") and not loc:
        return error_response(ErrorCode.VALIDATION_ERROR, "请求数据不能为空", 400)
    field = loc[0] if loc else None
    return error_response(ErrorCode.VALIDATION_ERROR, f"字段 {field} 格式不正确" if field else "请求参数错误", 400,
                          {"field": field} if field else None)


_HTTP_CODES = {
    400: (ErrorCode.VALIDATION_ERROR, "请求参数错误"),
    401: (ErrorCode.AUTH_INVALID_TOKEN, "未登录或登录已过期"),
    403: (ErrorCode.PERMISSION_DENIED, "权限不足"),
    404: (ErrorCode.NOT_FOUND, "资源不存在"),
    405: (ErrorCode.NOT_FOUND, "不支持的请求方法"),
    429: (ErrorCode.RATE_LIMIT_EXCEEDED, "操作过于频繁，请稍后再试"),
}


@app.exception_handler(StarletteHTTPException)
async def _on_http_error(_: Request, exc: StarletteHTTPException):
    code, message = _HTTP_CODES.get(exc.status_code, (ErrorCode.INTERNAL_ERROR, "请求失败"))
    return error_response(code, message, exc.status_code)


@app.exception_handler(Exception)
async def _on_unhandled(request: Request, exc: Exception):
    logger.exception("未处理的异常 %s %s", request.method, request.url.path)
    return error_response(ErrorCode.INTERNAL_ERROR, "服务器开小差了，请稍后再试", 500)


@app.get("/")
def index():
    return {"message": "Funk & Love Auth System API", "status": "running", "version": VERSION}


@app.get("/health")
def health():
    return {"status": "healthy"}


# 同一套接口在 nginx 后面是 /api/...；/api/health 方便从外面探活
@app.get("/api/health")
def api_health():
    return JSONResponse({"status": "healthy", "version": VERSION})


app.include_router(account.router)
app.include_router(auth.router)
app.include_router(admin.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5000")),
        reload=os.getenv("DEV_RELOAD", "false").lower() == "true",
    )
