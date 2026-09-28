"""统一错误格式：{"error": {"code", "message", "details"?}}，和 Flask 版一致。"""

from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse


class ErrorCode:
    AUTH_INVALID_CREDENTIALS = "AUTH_001"  # 邮箱或密码错误
    AUTH_INVALID_DOMAIN = "AUTH_002"       # 邮箱域名不允许
    AUTH_INVALID_CODE = "AUTH_003"         # 验证码错误或过期
    AUTH_INVALID_TOKEN = "AUTH_004"        # Token 无效或过期
    AUTH_EMAIL_EXISTS = "AUTH_005"         # 邮箱已注册
    AUTH_ACCOUNT_DISABLED = "AUTH_006"     # 账号已禁用
    AUTH_EMAIL_BLACKLISTED = "AUTH_007"    # 邮箱已封禁
    PERMISSION_DENIED = "PERM_001"
    VALIDATION_ERROR = "VAL_001"
    NOT_FOUND = "NOT_FOUND"
    RATE_LIMIT_EXCEEDED = "RATE_001"
    INTERNAL_ERROR = "SYS_001"


class ApiError(Exception):
    """在任何地方抛出，由 app.py 的处理器转成统一格式的响应。"""

    def __init__(self, code: str, message: str, status: int = 400, details: dict[str, Any] | None = None,
                 headers: dict[str, str] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details
        self.headers = headers


def error_body(code: str, message: str, details: Any = None) -> dict:
    body: dict[str, Any] = {"code": code, "message": message}
    if details:
        body["details"] = details
    return {"error": body}


def error_response(code: str, message: str, status: int, details: Any = None,
                   headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(error_body(code, message, details), status_code=status, headers=headers)


def invalid(message: str, field: str | None = None) -> ApiError:
    return ApiError(ErrorCode.VALIDATION_ERROR, message, 400, {"field": field} if field else None)
