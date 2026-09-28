"""请求体。字段都设成可选，缺字段时由路由给出与旧版一致的中文提示。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Body(BaseModel):
    model_config = ConfigDict(extra="ignore")


class SendCodeBody(_Body):
    email: str | None = None
    purpose: Literal["register", "reset_password"] | None = None


class RegisterBody(_Body):
    email: str | None = None
    password: str | None = None
    name: str | None = None
    code: str | None = None
    redirect_uri: str | None = None


class LoginBody(_Body):
    email: str | None = None
    password: str | None = None
    redirect_uri: str | None = None


class TokenBody(_Body):
    token: str | None = None


class EmailBody(_Body):
    email: str | None = None


class ResetPasswordBody(_Body):
    email: str | None = None
    password: str | None = None
    code: str | None = None


class AuthorizeBody(_Body):
    redirect_uri: str | None = None


class AvatarsBody(_Body):
    user_ids: list[int] | None = None
    style: str | None = None


class AvatarUploadBody(_Body):
    content_type: str | None = None
    size: int | None = None


class AvatarConfirmBody(_Body):
    key: str | None = None


class UpdateProfileBody(_Body):
    name: str | None = None


class ChangePasswordBody(_Body):
    current_password: str | None = None
    new_password: str | None = None


class UserStatusBody(_Body):
    is_active: bool | None = None


class UserRoleBody(_Body):
    is_admin: bool | None = None


class BlacklistBody(_Body):
    email: str | None = None
    reason: str | None = None


class WhitelistBody(_Body):
    email: str | None = None
    name: str | None = None
    note: str | None = None


class WhitelistUpdateBody(_Body):
    name: str | None = None
    note: str | None = None
