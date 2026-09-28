"""
兼容旧的启动命令：线上 tmux 里一直是 `gunicorn -c gunicorn.conf.py wsgi:application`。

名字虽然叫 wsgi，这里导出的其实是 ASGI 应用；gunicorn.conf.py 指定了
uvicorn_worker.UvicornWorker，所以旧命令不用改也能跑新后端。新部署请用 asgi:app。
"""

from asgi import app

application = app
