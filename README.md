# LockAuth

Funk & Love 的账号与单点登录（SSO）服务，线上地址 [auth.funk-and.love](https://auth.funk-and.love)。

- 成员自己注册、登录、找回密码，在个人控制台里改名字、换头像、改密码、看登录记录。
- 管理员在后台管理成员：停用、设管理员、校友白名单、黑名单、操作日志。
- 其他服务通过它认证：用户在这里登录后带着 JWT 跳回来源服务，服务端用 `verify-token` 校验。

LockAuth 只负责账号和认证，不是门户。各个服务的入口在官网。

## 组成

| 目录 | 内容 |
|---|---|
| [`backend/`](backend/README.md) | FastAPI + SQLAlchemy + SQLite，Python 3.11 |
| [`auth-service/`](auth-service/README.md) | Next.js 16 + React 19 + Tailwind CSS v4，入口页的 3D 锁芯用 three.js |
| `deploy.py` | 打包前后端，产物在 `dist/`；上线步骤不在仓库里 |

头像存在阿里云 OSS 的 `lock-publicfiles` 桶，数据库里只记对象 key。

## 本地运行

后端（conda 环境 `lockauth`）：

```powershell
conda activate lockauth
cd backend
pip install -r requirements.txt
copy .env.example .env          # 第一次：填 JWT_SECRET_KEY
$env:MAIL_SUPPRESS_SEND="true"  # 不发真邮件，验证码打印在终端
python app.py                   # http://127.0.0.1:5000
```

前端：

```powershell
cd auth-service
npm install
npm run dev                     # http://localhost:3000
```

检查：后端 `pytest`；前端 `npx tsc --noEmit`、`npm run lint`、`npm run build`。

## 接入一个新服务

1. 把服务的回调地址加进后端的 `ALLOWED_REDIRECT_URIS`（支持 `https://*.funk-and.love`）。
2. 登录按钮跳到 `https://auth.funk-and.love/?redirect_uri=<回调地址>`。登录成功后会带着 `token` 跳回回调地址。
3. 服务端拿 `token` 调 `POST /api/auth/verify-token`，返回用户的 id、邮箱、名字、是否管理员和头像。

接口细节见 [`backend/README.md`](backend/README.md)。

## 作者

[Hofmann8](https://github.com/Hofmann8) · link-ai@zju.edu.cn
