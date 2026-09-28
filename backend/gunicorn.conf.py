"""
Gunicorn 配置（FastAPI / ASGI）。线上是 2 核 2G 的小机器，和其他服务共用。

启动：gunicorn -c gunicorn.conf.py asgi:app
（旧命令 wsgi:application 也能用，见 wsgi.py）
"""

import os

# 只听本机，由 nginx 反代；旧版绑 0.0.0.0 会把 5002 端口直接暴露在公网
bind = os.environ.get("GUNICORN_BIND", "127.0.0.1:5002")

# 限流计数和"一小时只记一次"的服务访问缓存都在进程内存里，保持 1 个 worker。
# 普通接口是同步函数，在 worker 的线程池里并发执行，bcrypt 计算时会释放 GIL。
workers = int(os.environ.get("GUNICORN_WORKERS", 1))
worker_class = "uvicorn_worker.UvicornWorker"

timeout = 60
graceful_timeout = 20
keepalive = 5

accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")

proc_name = "lockauth"
daemon = False
preload_app = False

limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190
