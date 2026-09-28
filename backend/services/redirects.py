"""登录后跳回业务服务：地址白名单校验与带 Token 的跳转链接。"""

from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from config import settings

_LABEL = re.compile(r"[a-z0-9-]+")


def is_allowed_redirect_uri(redirect_uri: str | None, allowed: list[str] | None = None) -> bool:
    """只按 scheme + 主机(+端口) 精确匹配；通配只允许一级子域。

    旧版的通配正则没锚定结尾，https://x.funk-and.love.evil.com 也能通过，这里改为比对解析后的主机名。
    """
    if not redirect_uri or not isinstance(redirect_uri, str):
        return False
    try:
        target = urlparse(redirect_uri.strip())
    except ValueError:
        return False
    if target.scheme not in ("http", "https") or not target.netloc or target.username or target.password:
        return False
    target_host = (target.hostname or "").lower()
    try:
        target_port = target.port
    except ValueError:
        return False

    for rule in allowed if allowed is not None else settings.allowed_redirect_uris:
        rule = rule.strip()
        if not rule:
            continue
        pattern = urlparse(rule)
        if pattern.scheme != target.scheme:
            continue
        rule_host = (pattern.hostname or "").lower()
        try:
            rule_port = pattern.port
        except ValueError:
            continue
        if rule_port != target_port:
            continue
        if "*" in rule_host:
            # *.funk-and.love：恰好一级子域，不含点
            prefix, _, suffix = rule_host.partition("*")
            if not (target_host.startswith(prefix) and target_host.endswith(suffix)):
                continue
            middle = target_host[len(prefix):len(target_host) - len(suffix)]
            if not _LABEL.fullmatch(middle):
                continue
        elif rule_host != target_host:
            continue
        rule_path = pattern.path.rstrip("/")
        if rule_path and not (target.path == rule_path or target.path.startswith(rule_path + "/")):
            continue
        return True
    return False


def build_redirect_url(base_url: str, token: str, user) -> str:
    """在原地址的查询参数上追加 token / user_id / email / name（与旧版一致）。"""
    parsed = urlparse(base_url.strip())
    params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    params.update({"token": token, "user_id": str(user.id), "email": user.email, "name": user.name})
    return urlunparse(parsed._replace(query=urlencode(params)))
