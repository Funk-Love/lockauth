# 各产品对 LockAuth 的需求

接入方在这里提需求，LockAuth 做完后在条目下写上"已上线"和实际接口。

---

## 1. 服务端批量查头像（LockCloud 提，2026-09-29）· 已上线

**实际接口**（和下面要的一致）

```
GET https://auth.funk-and.love/api/auth/service/avatars?style=avatarmd
X-Service-Key: <LOCKAUTH_SERVICE_KEY>
```

- 返回 `{"success": true, "users": [{"id", "email", "avatar_url"}]}`，按 `id` 升序，`email` 小写，没头像是 `null`。
- 密钥缺少或不对：401，`{"error": {"code": "AUTH_004", "message": "服务密钥无效"}}`。用户的 Bearer Token 不能代替服务密钥。
- `style` 不认识时按 `avatarmd` 处理（同现有接口）。每个密钥每分钟 30 次，超了 429。
- 密钥在 LockAuth 服务器 `backend/.env` 的 `SERVICE_KEYS` 里，LockCloud 那把由维护者直接给，不进仓库。


**背景**：头像归 LockAuth 管。LockCloud 要在很多地方显示别人的头像（上传者、评论、成员列表），
以前是 LockCloud 自己存一份 `avatar_key`，只在本人登录 LockCloud 时从 `verify-token` 同步，
别人换了头像要等他下次登录才更新。LockCloud 重构后不再存任何头像信息，改成问 LockAuth。

现有的 `/avatar/{id}`、`/avatar/by-email`、`POST /avatars` 要用户的 LockAuth token，
而 LockCloud 登录后拿的是自己的 token（SSO 时换掉了），后端没有 LockAuth token 可用，所以需要一个服务之间调用的入口。

**要的接口**

```
GET /api/auth/service/avatars?style=avatarmd
X-Service-Key: <给 LockCloud 的密钥>
```

```json
{
  "success": true,
  "users": [
    {"id": 12, "email": "someone@zju.edu.cn", "avatar_url": "https://.../avatars/12/xxx.webp?x-oss-process=..."},
    {"id": 13, "email": "other@zju.edu.cn", "avatar_url": null}
  ]
}
```

- 返回全部用户（队里几十到几百人，一次拿全，LockCloud 缓存 5 分钟）。只要 `id`、`email`、`avatar_url` 三个字段，不要别的个人信息。
- `email` 小写。`avatar_url` 就是现在 `avatar.url(key, style)` 的结果，没头像是 `null`；`style` 同现有接口（`avatarsm` / `avatarmd` / `avatarlg`，默认 `avatarmd`）。
- 鉴权：每个接入服务一个密钥，比如环境变量 `SERVICE_KEYS="lockcloud:<随机串>,lockai:<随机串>"`，
  比对用常数时间比较；缺少或不对返回 401（错误格式同 LockAuth 现有的）。只允许服务端调用，不需要 CORS。
- 调用频率很低（每个服务每几分钟一次），不用单独限流；想加的话每个密钥每分钟 30 次足够。

**LockCloud 这边的做法**（供参考，不需要 LockAuth 配合）：后端配 `LOCKAUTH_SERVICE_KEY`，
按邮箱对上自己的用户；接口没上线或调不通时头像显示名字首字，不影响其他功能。

**顺带**：LockAuth 2.0 已经不调 LockCloud 的 `/api/auth/sso-internal/avatar*` 了，LockCloud 这次会把这组接口删掉；
LockCloud 的迁移脚本里读写 LockAuth 库的 `avatars` 子命令也一起删掉，以后不会再碰 LockAuth 的库和头像桶。
