"""头像：归 Auth 管，存在阿里云 OSS 的公共资源桶 lock-publicfiles。

    avatars/{用户 id}/{uuid}.{ext}

桶策略只放开 avatars/ 的匿名读，所以显示用不签名的公开地址，尺寸用 OSS 图片处理参数现算。
上传由浏览器直传：先要一个签名 PUT 地址，传完再确认，确认时核对对象确实在、大小和类型合规。
其他服务（LockCloud 等）登录时从 verify-token 拿到 avatar_key / avatar_url。
"""

from __future__ import annotations

import logging
import uuid
from urllib.parse import quote

from config import settings

logger = logging.getLogger("lockauth.avatar")

STYLES = {"avatarsm": 64, "avatarmd": 160, "avatarlg": 320}
CONTENT_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
MAX_BYTES = 5 * 1024 * 1024
UPLOAD_SECONDS = 600

_bucket = None
_signer = None


def _style(style: str | None) -> str:
    return style if style in STYLES else "avatarmd"


def url(key: str | None, style: str | None = None) -> str | None:
    if not key or not key.startswith("avatars/") or not settings.public_files_url:
        return None
    size = STYLES[_style(style)]
    process = f"image/auto-orient,1/resize,m_fill,w_{size},h_{size}/quality,q_85/format,webp"
    return f"{settings.public_files_url.rstrip('/')}/{quote(key)}?x-oss-process={process}"


def result(user, style: str | None = None) -> dict:
    """单个用户的头像结果，字段和以前代理 LockCloud 时一样。"""
    key = getattr(user, "avatar_key", None) if user else None
    link = url(key, style)
    return {"success": True, "has_avatar": bool(link), "avatar_url": link}


# ---------------------------------------------------------------- 上传

def _oss(signer: bool = False):
    """两个 Bucket 对象：签名给浏览器用外网 endpoint，服务器自己读写走内网（没配时同外网）。"""
    global _bucket, _signer
    import oss2

    if not settings.oss_access_key_id or not settings.oss_access_key_secret:
        raise RuntimeError("OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET 未配置")
    if signer and _signer is None:
        auth = oss2.AuthV4(settings.oss_access_key_id, settings.oss_access_key_secret)
        _signer = oss2.Bucket(auth, settings.oss_endpoint, settings.oss_public_bucket, region=settings.oss_region)
    if not signer and _bucket is None:
        auth = oss2.AuthV4(settings.oss_access_key_id, settings.oss_access_key_secret)
        endpoint = settings.oss_internal_endpoint or settings.oss_endpoint
        _bucket = oss2.Bucket(auth, endpoint, settings.oss_public_bucket, region=settings.oss_region,
                              connect_timeout=15)
    return _signer if signer else _bucket


def user_prefix(user_id: int) -> str:
    return f"avatars/{user_id}/"


def upload_url(user_id: int, content_type: str) -> dict:
    """浏览器直传用的签名 PUT。Content-Type 签进去，上传时必须带同样的头。"""
    key = f"{user_prefix(user_id)}{uuid.uuid4().hex}.{CONTENT_TYPES[content_type]}"
    headers = {"Content-Type": content_type, "Cache-Control": "public, max-age=31536000, immutable"}
    signed = _oss(signer=True).sign_url("PUT", key, UPLOAD_SECONDS, headers=headers, slash_safe=True)
    return {"upload_url": signed, "key": key, "headers": headers, "expires_in": UPLOAD_SECONDS}


def check_uploaded(key: str) -> str | None:
    """确认上传的对象：返回错误信息，没问题返回 None。"""
    import oss2

    try:
        meta = _oss().head_object(key)
    except oss2.exceptions.NotFound:
        return "没有找到上传的图片，请重试"
    if meta.content_length > MAX_BYTES:
        remove(key)
        return "图片不能超过 5 MB"
    if meta.content_type not in CONTENT_TYPES:
        remove(key)
        return "只支持 JPG、PNG、WebP、GIF 图片"
    return None


def remove(key: str | None) -> None:
    """删旧头像。失败只记日志：留一张没人引用的小图不影响使用。"""
    if not key or not key.startswith("avatars/"):
        return
    try:
        _oss().delete_object(key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("删除头像 %s 失败: %s", key, exc)
