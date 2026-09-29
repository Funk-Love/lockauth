# LockAuth 后端

Funk & Love 的账号与单点登录（SSO）服务：成员自己注册、登录、管理账号，管理员在后台管理成员；接入的服务（目前有 LockCloud、LockAI）通过它认证并拿到 JWT。FastAPI + SQLAlchemy + SQLite。

2.0 从 Flask 迁过来，**接口路径、返回格式、JWT 格式和密钥都和旧版一致**，其他服务不用改。

## 本地运行

用 conda 环境 `lockauth`（Python 3.11，和线上同名同版本）：

```powershell
conda activate lockauth
cd backend
pip install -r requirements.txt   # 依赖有变化时再装
copy .env.example .env            # 第一次：填 JWT_SECRET_KEY
$env:MAIL_SUPPRESS_SEND="true"    # 本地不发真邮件，验证码打在终端里
python app.py                     # http://127.0.0.1:5000，/docs 是接口文档（生产环境关闭）
```

没有 `DATABASE_URL` 时用 `instance/auth.db`。启动时会自动建表、补列（见下文"数据库"）。

测试：在 `lockauth` 环境里跑 `pytest`（60 个用例，内存数据库，不发邮件，不连 OSS）。

## 目录

| 文件 | 作用 |
|---|---|
| `app.py` | 应用、错误处理、日志、健康检查 |
| `asgi.py` / `wsgi.py` | gunicorn 入口；`wsgi:application` 是给线上旧启动命令留的别名 |
| `config.py` | 读环境变量 |
| `database.py` | 引擎、会话、启动时迁移 |
| `models.py` | `User`、`VerificationCode`、`EmailWhitelist`、`EmailBlacklist`、`AuthLog` |
| `security.py` | bcrypt、签发 / 校验 JWT |
| `deps.py` | 取客户端 IP、当前用户、管理员 |
| `ratelimit.py` | 进程内限流（所以固定 1 个 worker） |
| `errors.py` | 统一错误格式 `{"error": {"code", "message", "details"}}` |
| `routers/auth.py` | 登录注册、SSO、头像查询 |
| `routers/account.py` | 个人中心：改名、改密码、登录记录 |
| `routers/admin.py` | 管理后台 |
| `services/` | 接入服务的域名表、跳转地址校验、审计日志、验证码、邮件、头像存储 |

## 接口

标 ★ 的是 2.0 新增的。

**认证**（`/api/auth`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/sso/config` | SSO 配置 |
| POST | `/send-code` | 发验证码，`purpose` 为 `register` / `reset_password` |
| POST | `/check-whitelist` | 邮箱能否注册 |
| POST | `/register` | 注册（201） |
| POST | `/login` | 登录，带 `redirect_uri` 时返回 `redirect_url` |
| POST | `/refresh` | 换新 Token |
| GET | `/me` | 当前用户 |
| POST | `/verify-token` | 其他服务校验 Token（按 Origin 记一次"使用服务"） |
| POST | `/reset-password` | 用验证码重置密码 |
| POST | `/sso/authorize` ★ | 已登录时直接拿跳转地址，不用再输密码 |
| GET | `/whitelist-emails` | 白名单邮箱（**2.0 起需要管理员**） |
| GET | `/avatar/by-email`、`/avatar/{id}`、`/me/avatar`；POST `/avatars` | 查头像地址（公开地址，不签名） |
| GET | `/service/avatars` | 其他服务的后端批量查头像：全部用户的 `id`、`email`、`avatar_url`。带 `X-Service-Key`，不要用户 Token |

**个人中心**（`/api/auth/me`，都是 ★）

| 方法 | 路径 | 说明 |
|---|---|---|
| PATCH | `` | 改名，返回新 Token（名字在 Token 里） |
| POST | `/password` | 改密码，返回新 Token，其他设备的旧 Token 立即失效 |
| GET | `/activity` | 自己的登录记录、各服务最近使用时间、统计 |
| POST | `/avatar/upload-url` | 头像直传用的签名 PUT 地址（JPG / PNG / WebP / GIF，5 MB 以内） |
| POST | `/avatar` | 传完后确认，换掉旧头像 |
| DELETE | `/avatar` | 移除头像 |

**管理**（`/api/admin`，需要管理员）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/overview` ★ | 概览：成员统计、12 个月注册、30 天每日活跃、服务使用、24 小时登录失败 |
| GET | `/users` | 成员列表，`search`、`status`（`active` / `disabled` / `admin` / `alumni` / `dormant` ★） |
| GET | `/users/{id}` ★ | 成员详情 + 最近 20 条记录 |
| PUT | `/users/{id}/status` | 停用 / 恢复（不能停用自己） |
| PUT | `/users/{id}/role` ★ | 设 / 撤管理员（不能改自己） |
| GET POST | `/whitelist`；PUT DELETE `/whitelist/{id}` | 校友白名单 |
| GET POST | `/blacklist`；DELETE `/blacklist/{email}` | 黑名单 |
| GET | `/logs` ★ | 操作日志，`action`（`admin` 表示全部管理操作）、`result`（`success` / `failed`）、`search`、`user_id` |

## JWT

和 flask-jwt-extended 签出来的一模一样：HS256，`sub` 是字符串形式的用户 ID，带 `type: "access"`、`fresh`、`jti`、`iat`、`nbf`、`exp`，外加 `user_id`、`email`、`name`。有效期 7 天。旧版签发的 Token 在新版照样能用。

改密码 / 重置密码会记下 `users.password_changed_at`，签发时间早于它的 Token 一律 401。

## 数据库

启动时 `database.migrate()` 做这几件事，都可以重复执行：

- 缺表就建；
- `users.password_changed_at`、`auth_logs.service`、`auth_logs.detail` 没有就加（可空列，旧版代码不受影响）；
- 删 180 天前的 `auth_logs`（`AUDIT_RETENTION_DAYS`）和 30 天前的验证码。

## 环境变量

见 `.env.example`。线上 `.env` 的键名和旧版一样，`FLASK_ENV` 仍然认（等同 `APP_ENV`）。

| 变量 | 说明 |
|---|---|
| `APP_ENV` | `production` 时关闭 `/docs` |
| `DATABASE_URL` | 默认 `sqlite:///auth.db`（相对路径放在 `instance/` 下） |
| `JWT_SECRET_KEY` | 和 LockCloud / LockAI 共用，**不能改** |
| `MAIL_*` | SMTP；`MAIL_SUPPRESS_SEND=true` 时不发信，把验证码写进日志 |
| `CORS_ORIGINS` | 逗号分隔 |
| `ALLOWED_REDIRECT_URIS` | 可以跳回的地址，支持 `https://*.funk-and.love`（`*` 只匹配一级子域名） |
| `SSO_FRONTEND_URL` | 登录页地址 |
| `SERVICE_KEYS` | 调 `/service/*` 的服务密钥，`lockcloud:<密钥>,lockai:<密钥>` |
| `OSS_*`、`PUBLIC_FILES_URL` | 头像存储：阿里云 OSS 的 `lock-publicfiles` 桶，`avatars/` 公开可读 |
| `AUDIT_RETENTION_DAYS` | 登录记录保留天数，默认 180 |

## 和旧版相比的行为变化

- **安全修复**
  - 跳转地址校验：旧版的通配符没锚定，`https://cloud.funk-and.love.evil.com` 也能通过；现在按协议、主机、端口逐项比较。
  - 限流：旧版在 nginx 后面拿到的 IP 全是 127.0.0.1，等于所有人共用一个额度；现在读 `X-Real-IP`。
  - 登录：每个 IP 每分钟 20 次；同一邮箱 15 分钟内错 8 次就暂停登录到这 15 分钟结束（登录成功或重置密码会清零）；邮箱不存在时也跑一遍 bcrypt，响应时间不泄露账号是否存在。
  - 验证码：用 `secrets` 生成；同一邮箱 60 秒只能发一次；错 8 次作废该邮箱所有验证码。
  - `whitelist-emails` 以前谁都能看，现在只有管理员。
  - gunicorn 从 `0.0.0.0:5002` 改成 `127.0.0.1:5002`。
- 注册时发验证码会先检查邮箱是否已注册 / 被封禁，不再白发一封信。
- bcrypt 升到 5.x，超过 72 字节的密码显式截断（和旧版实际效果一致）。
- 所有登录、注册、改密码和管理操作都写进 `auth_logs`，控制台和管理后台里能看到。
- 头像归 Auth 管，存在 `lock-publicfiles/avatars/{用户 id}/`。`verify-token` 返回 `avatar_key` 和 `avatar_url`；其他服务要显示别人的头像，后端用 `/service/avatars` 批量取。
