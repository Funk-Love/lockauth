"""接入 LockAuth 认证的服务。登录记录里的"经由哪个服务"按跳转地址的域名从这里查。"""

from __future__ import annotations

from urllib.parse import urlparse

SERVICES: list[dict] = [
    {
        "key": "cloud",
        "name": "LockCloud",
        "hosts": ["cloud.funk-and.love"],
    },
    {
        "key": "ai",
        "name": "LockAI",
        "hosts": ["ai.funk-and.love"],
    },
    {
        "key": "main",
        "name": "Funk & Love",
        "hosts": ["funk-and.love", "www.funk-and.love"],
    },
]

_BY_HOST = {host: s["key"] for s in SERVICES for host in s["hosts"]}
_BY_HOST["auth.funk-and.love"] = "auth"


def service_for_url(url: str | None) -> str | None:
    if not url:
        return None
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return None
    if host in _BY_HOST:
        return _BY_HOST[host]
    if host in ("localhost", "127.0.0.1"):
        return "local"
    return None
