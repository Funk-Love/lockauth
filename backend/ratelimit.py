"""进程内的固定窗口限流。

生产环境是单个 worker（见 gunicorn.conf.py），计数放内存就够。
按真实客户端 IP 计数：旧版在 nginx 后面拿到的全是 127.0.0.1，等于所有人共用一个额度。
"""

from __future__ import annotations

import threading
import time

from errors import ApiError, ErrorCode


class RateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: dict[str, tuple[float, int]] = {}
        self._last_sweep = time.monotonic()

    def _sweep(self, now: float) -> None:
        if now - self._last_sweep < 300:
            return
        self._last_sweep = now
        self._hits = {k: v for k, v in self._hits.items() if v[0] > now}

    def hit(self, key: str, limit: int, window: int) -> int | None:
        """记一次；超限时返回还要等的秒数，否则返回 None。"""
        now = time.monotonic()
        with self._lock:
            self._sweep(now)
            reset_at, count = self._hits.get(key, (now + window, 0))
            if reset_at <= now:
                reset_at, count = now + window, 0
            if count >= limit:
                return max(1, int(reset_at - now + 0.999))
            self._hits[key] = (reset_at, count + 1)
            return None

    def peek(self, key: str, limit: int) -> int | None:
        """只看不记：已超限时返回剩余秒数。"""
        now = time.monotonic()
        with self._lock:
            reset_at, count = self._hits.get(key, (now, 0))
            if reset_at > now and count >= limit:
                return max(1, int(reset_at - now + 0.999))
            return None

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def too_many(retry_after: int, message: str = "操作过于频繁，请稍后再试") -> ApiError:
    return ApiError(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        message,
        429,
        {"retry_after": retry_after},
        headers={"Retry-After": str(retry_after)},
    )


def enforce(key: str, limit: int, window: int, message: str | None = None) -> None:
    wait = limiter.hit(key, limit, window)
    if wait is not None:
        raise too_many(wait, message or "操作过于频繁，请稍后再试")
