# LockAuth 前端

`auth.funk-and.love`：登录、注册、找回密码的入口，登录后的个人控制台，以及管理后台。

Next.js 16（App Router，standalone 输出）· React 19 · Tailwind CSS v4 · three.js + @react-three/fiber + @react-three/postprocessing · GSAP。

## 本地开发

```powershell
npm install
npm run dev          # http://localhost:3000
```

后端默认连 `http://localhost:5000/api`（`.env.development.local`）。`next build` 读 `.env.local`，里面是线上地址 `https://auth.funk-and.love/api`。`NEXT_PUBLIC_API_URL` 在构建时就写进产物，换地址要重新构建。

检查：`npx tsc --noEmit`、`npm run lint`、`npm run build`。

## 页面

| 路径 | 内容 |
|---|---|
| `/`（`/login` 同） | 登录。带 `redirect_uri` 时登录完跳回来源服务；已登录时显示"又见面了"卡片，2.2 秒后自动带着登录状态跳走 |
| `/register` | 注册：邮箱 → 验证码 → 名字 → 密码，完成后自动登录 |
| `/reset-password` | 用验证码重置密码，完成后自动登录 |
| `/dashboard` | 首页：问候、会员卡、最近活动；管理员多一个后台入口 |
| `/dashboard/profile` | 改名字、换头像（浏览器直传到 OSS 的 `lock-publicfiles/avatars/`） |
| `/dashboard/security` | 改密码（其他设备随即登出）、自己的登录与操作记录 |
| `/admin` | 概览：成员统计、每日活跃、每月注册、服务使用、最近的登录失败 |
| `/admin/users` | 成员：搜索、筛选、停用 / 恢复、设 / 撤管理员、详情抽屉 |
| `/admin/whitelist`、`/admin/blacklist` | 校友白名单、黑名单 |
| `/admin/logs` | 操作日志 |

入口页的 URL 参数：`redirect_uri`（和旧版一致，LockCloud / LockAI 都这样跳过来；`/register?redirect_uri=` 注册完也会跳回去）、`next`（站内跳转）、`email`（预填）。

## 目录

```
app/                   页面
components/
  brand/               标志（锁芯截面：外圈 + 锁胆 + 两道钥匙槽）和字标
  stage/               入口页的 3D 锁芯（CylinderScene）、程序生成的材质和摄影棚环境（materials），以及加载时和不支持 WebGL 时的 CSS 占位（LockStage）
  entrance/            入口页外壳和三个表单；StageContext 让表单驱动 3D 弹子
  console/             控制台外壳、会员卡、服务卡、时间线、图表
  ui/                  按钮、输入框、验证码框、对话框、提示条等
lib/
  api.ts               所有接口；Token 存在 localStorage 的 auth_token（和旧版同一个键）
  auth.tsx             登录状态：启动时校验、到期前一天自动续期、多标签页同步
  errors.ts            后端错误码 → 给人看的话
  format.ts            时间、设备、IP 打码、操作名称
```

## 设计

和 LockAI 同一家族：暖黑底、Fraunces 斜体字标、"两道并行细竖线"的母题。区别在强调色：LockAI 是琥珀，LockAuth 是**铜绿**（`--accent`，老铜锁放久了生的锈色）。

- 入口页左边是一颗剖开的弹子锁芯（实时 3D）。每填对一项就有一颗弹子被顶到剪切线上；登录成功锁芯转过去定住，失败弹子掉回去、锁身摇一下头。静止时锁芯偶尔"犹豫"一下，是锁舞 lock 的节奏，只是暗示。
- 小屏或触屏用简化场景；不支持 WebGL 或开了"减少动态效果"时换成静态 SVG。
- 控制台里克制：只有会员卡和服务卡跟着指针轻微倾斜。
- 设计令牌都在 `app/globals.css` 的 `:root`，通过 `@theme inline` 映射成 Tailwind 类（`bg-surface`、`text-fg-soft`、`text-accent` ……）。
- 图表只用一个颜色 `--chart`（比 accent 暗一点、饱和一点，暗底上对比度够）；每张图都能切换成表格看原始数字。

注意：`globals.css` 里自定义的基础样式和组件类必须写在 `@layer base` / `@layer components` 里。写在层外会压过 Tailwind 的工具类（之前 `button { color: inherit }` 就把主按钮的字色吃掉了）。

## 部署

`npm run build` → 上一级 `python deploy.py` → 把 `dist/lockauth-frontend.zip` 解压到服务器，`npm start`（包里的 `package.json` 已改成 `node server.js`，监听 `127.0.0.1:3002`）。

`AGENTS.md` / `CLAUDE.md` 是 `next dev` 自动生成的，删了也会再生成，留着即可。
