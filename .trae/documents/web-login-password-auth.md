# 登录流程改造：密码登录 + 注册 + 忘记密码 + 微信占位

## Context

当前登录页只有「验证码登录（登录即注册）」一条路径，用户要求补齐标准认证体验：密码登录为主、独立注册、忘记密码找回、微信扫码占位（现有占位已满足，仅保留）。已确认的决策：

- **记住我**：改 connection 认证核心 —— 勾选 = 30 天持久 cookie，不勾 = 会话 cookie（关浏览器即失效）
- **密码强度**：8–64 位，至少一个字母和一个数字（前端提示 + 服务端 zod 双重校验）
- 验证码登录 tab 保留（老账号无密码时仍可用）；注册后自动登录；忘记密码 = 验证码重置（复用现有 SMS 挑战机制）

## 方案设计

### 存储域（packages/host/web-login/src/spec.ts）

- 新增 `credentials` 表（key = 手机号）：`{passwordHash, createdAt, updatedAt}`。`passwordHash` 为自描述格式 `scrypt$N$r$p$saltHex$hashHex`
- 域 version 保持 1 —— 复用 members/invites 的兼容模式（缺失表解析为空表），旧介质零迁移
- 导出 `passwordSchema`（`z.string().min(8).max(64)` + refine 字母/数字）供路由校验

### 密码哈希（新文件 packages/host/web-login/src/password.ts）

- `hashPassword(password): string` — node:crypto `scryptSync`（N=16384, r=8, p=1）+ 16 字节随机盐
- `verifyPassword(password, stored): boolean` — 解析格式、重算、`timingSafeEqual` 比对（repo 先例：connection/browser-auth.ts 已用 timingSafeEqual）

### 新路由（shared.ts 常量 + index.ts 处理器）

| 路由 | 请求体 | 语义 |
|---|---|---|
| `POST /auth/password/login` | `{phone, password, remember?}` | scrypt 验证 → 签发 cookie（`remember=false` → 会话 cookie）；未设密码 → 400 `no-credential` |
| `POST /auth/register` | `{phone, code, password}` | 挑战验证并消费 → 已注册 409 `phone-registered` → 建账号 + 凭证 → 签发 cookie（自动登录，返回 redirect） |
| `POST /auth/password/reset` | `{phone, code, password}` | 挑战验证并消费 → 账号必须存在（400 `no-account`）→ 更新凭证 → 签发 cookie（找回即登录） |

- `/auth/sms/send` 复用为三个流程的取码入口（冷却机制已有）
- 新错误码进 `LoginErrorPayload`：`wrong-password`、`no-credential`、`phone-registered`、`no-account`、`weak-password`
- cookie 签发统一走 `connection.issueSessionCookie`（见下方 connection 改动）

### connection 包改动（记住我）

- `browser-auth.ts`：`mintSessionCookie(headers, subject?, maxAgeMilliseconds?)` —— 第三参缺省 = 现有 30 天；会话 cookie 时 `sessionCookie()` 不输出 `Max-Age`/`Expires` 属性（浏览器关闭即失效），cookie payload 的 `expiresAt` 照旧计算（服务端校验逻辑零改动）
- `rpc.ts` / `rpc-host.ts`：`issueSessionCookie` 透传可选时长；web-login 的本地 `LoginConnection` 接口同步
- 补 connection 测试：会话 cookie 无持久化属性、仍可通过 `isAuthenticated`

### 登录页（page.ts + strings.ts）

Tabs 扩展为 4 个（复用现有 `select(name)` 机制）：**密码登录（默认）| 验证码登录 | 注册 | 微信扫码（保留「即将上线」badge + 占位面板，现状已满足要求 3）**

| 视图 | 元素 |
|---|---|
| `form#login-password` | 手机号（autofocus）+ 密码（眼睛图标显示/隐藏）+ 记住我勾选框 + 忘记密码链接 + 提交按钮「登录」（loading/禁用态） |
| `form#sms` | 现有表单原样保留（手机号 + 验证码 + 发送 + 邀请码 + 登录/注册） |
| `form#register` | 手机号 + 验证码 + 发送 + 密码 + 确认密码 + 协议勾选框（未勾选拒绝提交）+ 邀请码（选填，成员模型主入口）+ 「注册并登录」 |
| `form#reset` | 手机号 + 验证码 + 发送 + 新密码 + 确认密码 + 「重置密码并登录」+ 返回登录链接（从忘记密码进入，无 tab） |

- 前端验证：手机号 `^1\d{10}$`、6 位验证码、密码强度正则、两次密码一致、协议必勾；失败就地提示并 focus
- 注册/重置成功后：若邀请码非空走现有 `redeemInvite` 闭环，否则 `location.replace(redirect)`
- CSS：复用现有 `.field/.submit/.tabs` 体系；密码输入框内嵌眼睛按钮；移动端（现有窄屏断点）tabs 允许换行、字号缩小
- 文案全部进 strings.ts（中文，该包既有模式）

## 实施步骤

1. **spec.ts + password.ts**：credentials 表、passwordSchema、scrypt 哈希/验证 + 单测
2. **shared.ts**：路由常量、payload 类型、错误码
3. **connection 包**：mintSessionCookie/issueSessionCookie 可选时长 + 会话 cookie + 测试
4. **index.ts**：3 个新路由处理器（复用 readPostObject/sendError/challenges/ownerPhone 既有件；register/reset 走挑战消费）
5. **strings.ts + page.ts**：文案 + 4 tabs/4 表单 + JS（记住我、密码显隐、前端验证、注册/重置流程）+ CSS
6. **测试**：login.spec.ts 新增 describe（密码登录 / 注册 / 密码重置，覆盖成功、错误码、挑战消费、cookie 属性、旧介质兼容）；connection 测试补会话 cookie
7. **文档 + 门禁**：web-login 与 connection README 双语更新、Agent Note、typecheck/lint/duplication/test:docs

## 验证

- `pnpm vitest run packages/host/web-login/tests/ packages/client/connection/tests/`
- `pnpm run typecheck && pnpm run lint && pnpm run duplication && pnpm run test:docs`
- 端到端：重启 web 服务 → curl 全链路：注册（验证码取自服务日志）→ 自动登录 cookie → 退出 → 密码登录（记住我开/关对比 Set-Cookie 是否含 Max-Age）→ 忘记密码重置 → 旧密码登录失败 → 旧账号（无凭证）密码登录得 `no-credential`、验证码登录不受影响
- 浏览器走查：4 tabs 切换、密码显隐、错误提示、移动端窄屏布局
