"""字段校验。提示文案沿用 Flask 版，旧前端和其他服务看到的错误信息不变。"""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from errors import invalid

ZJU_DOMAIN = "@zju.edu.cn"
_EMAIL = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

PASSWORD_MIN = 6
PASSWORD_MAX = 128
NAME_MIN = 2
NAME_MAX = 50


def require(value, field: str) -> str:
    """必填字段：缺失或空白都算缺。"""
    if value is None:
        raise invalid(f"缺少必填字段: {field}", field)
    if not isinstance(value, str):
        raise invalid(f"字段 {field} 格式不正确", field)
    if not value.strip():
        raise invalid(f"字段 {field} 不能为空", field)
    return value


def normalize_email(value) -> str:
    return require(value, "email").strip().lower()


def check_email_format(email: str) -> None:
    if not _EMAIL.match(email):
        raise invalid("邮箱格式不正确", "email")


def is_zju(email: str) -> bool:
    return email.endswith(ZJU_DOMAIN)


def check_email_allowed(db: Session, email: str) -> bool:
    """浙大邮箱直接放行；其他邮箱要在校友白名单里。返回是否白名单。"""
    from models import EmailWhitelist

    check_email_format(email)
    if is_zju(email):
        return False
    if db.query(EmailWhitelist).filter_by(email=email).first():
        return True
    raise invalid("请使用 @zju.edu.cn 邮箱", "email")


def check_password(password: str, field: str = "password") -> None:
    if len(password) < PASSWORD_MIN:
        raise invalid(f"密码长度至少为 {PASSWORD_MIN} 位", field)
    if len(password) > PASSWORD_MAX:
        raise invalid(f"密码不能超过 {PASSWORD_MAX} 位", field)


def clean_name(value) -> str:
    name = require(value, "name").strip()
    if len(name) < NAME_MIN:
        raise invalid(f"姓名长度至少为 {NAME_MIN} 位", "name")
    if len(name) > NAME_MAX:
        raise invalid(f"姓名不能超过 {NAME_MAX} 个字", "name")
    return name


def clean_code(value) -> str:
    code = require(value, "code").strip()
    if len(code) != 6:
        raise invalid("验证码必须是 6 位数字", "code")
    if not code.isdigit():
        raise invalid("验证码必须是数字", "code")
    return code
