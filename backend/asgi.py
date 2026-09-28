"""
ASGI 入口，生产环境由 gunicorn + uvicorn worker 加载：

    gunicorn -c gunicorn.conf.py asgi:app

不用 gunicorn 时也可以直接：

    uvicorn asgi:app --host 127.0.0.1 --port 5002
"""

from app import app

__all__ = ["app"]
