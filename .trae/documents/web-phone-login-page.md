# Web 登录页：手机号注册/登录（强制登录）

## Context（背景）

当前 Web 工作台（127.0.0.1:3080）没有登录界面：本机访问靠 `trustLoopback` 免登录直进工作台，远程访问返回纯文本 401。用户要求：

- 打开网站即见**高大上的登录页**（参考 DeepSeek platform.sign_in 的极简验证码登录）；
- 支持**手机号 + 短信验证码注册/登录**（一体化的注册即登录）；**微信扫码本期仅预留 Tab（"即将上线"占位）**，上线后再接真实后端；
- 布局选**左右分栏品牌墙**：左侧星躍智品牌展示区，右侧登录卡片；
- **强制登录**：未认证打开 `/` 重定向到登录页；`/?token=...` 启动直通保留（开发者通道）。

短信无真实服务商 → **演示模式**：验证码打印到服务端日志（带 `[演示]` 标记），60s 重发冷却、5 分钟有效期、最多 5 次尝试。

## 已核实的接线点

| 事项 | 位置 |
|---|---|
| Web 组成（添加 web-login 插件行） | `packages/bundle/web-app/cordis.patch.yml`（layer-2 `insert` 表，webserver/connection 同段） |
| resolver manifest 依赖 | `packages/bundle/web-app/package.json` dependencies 加 `@deepseek-ai/dsh-web-login` |
| 认证入口（401→303 改造点） | `packages/client/connection/src/browser-auth.ts` `authorizeIndex` L258-301 |
| trustLoopback 免登录旁路（需删除） | `browser-auth.ts` L297、`ConnectionConfig.trustLoopback` L94/L102 |
| 新包位置 | `packages/host/web-login`（host 组；`packages/web/` 已是模型面 search/fetch 组，不可用） |
| 401 行为的既有测试（需更新） | `packages/client/connection/tests/browser-auth.host.spec.ts` L160/181/186/195、`node-half.host.spec.ts` L218/233/272-273/438/544-545、`packages/host/frontend-static/tests/frontend-static.spec.ts` L119 |
| workbench 问候名 | `packages/workbench/workbench/src/index.ts` L122（`user.name`）与 `resolveUserName` L229-240 |
| i18n 门禁范围 | `verify-client-ui-i18n` 只扫 `packages/client/*/src` 等，host 静态页不在内 → 文案集中 `strings.ts` |

## 实施步骤

### 阶段 1：BrowserAuth v2 + 强制登录重定向

`packages/client/connection/src/browser-auth.ts`：

1. cookie payload v2：`{version: 2, authority, issuedAt, expiresAt, subject?: string}`；`decodeCookie` 接受 v1|v2；`isAuthenticated` 逻辑不变。
2. 新增公开方法：
   - `mintSessionCookie(authority, subject?)` → `{name, value, maxAgeSeconds, expiresAt}`（复用 `sessionCookie` L133 属性：HttpOnly / SameSite=Strict / Path=/）
   - `clearSessionCookie(authority)` → `Set-Cookie` 字符串（Max-Age=0）
   - `subjectOf(request)` → v2 cookie 的 `subject`
3. `authorizeIndex` 未认证分支：`writeUnauthorized`（L294、L299）改为 **303 → `/login`**（`cache-control: no-store` + `referrer-policy: no-referrer`，Location 用相对路径；GET/HEAD 同样处理）。`?token=` 交换分支与优先级保持不变。
4. 删除 `trustLoopback` 旁路与 `ConnectionConfig.trustLoopback` 字段（pre-stable API：更新全部消费者与 README）。
5. `packages/client/connection/src/rpc-host.ts`（L96-110）与 `rpc.ts`（L165+）：在 connection 服务上透出 `issueSessionCookie(headers, subject?)` / `clearSessionCookie(headers)` 供登录插件使用。
6. 更新上述 3 个测试文件的 401 断言 → 断言 303 + Location。

### 阶段 2：新包 `packages/host/web-login`

脚手架（以 `packages/host/open-in-app` 为模板）：`package.json`（exports、peerDeps `@deepseek-ai/cordis`、devDeps `@deepseek-ai/dsh-host-webserver`）、`tsdown.config.ts`、`tsconfig.json`、双语 `README.md`/`README.zh.md`/`README.i18n.yaml`、`## Known Limitations and Deferred Work` 段。

源码：

- `src/spec.ts` — storage domain `web-login` v1：`accounts` 表（key=手机号，record `{displayName, createdAt, lastLoginAt}`，displayName=掩码 `138****1234`）；短信挑战存内存 Map（不持久化）。
- `src/index.ts` — 插件 `web-login`，inject `['webServer', 'connection', 'storageDomain']`；注册 exact 命名路由 + 宿主服务 `loginSession`（`ctx.get('loginSession')` 可读取，记录最近登录 `{phone, displayName}`）：

| 路由 | 语义 |
|---|---|
| `GET /login` | 纯 TS 渲染函数输出整页 HTML（200，`no-store`；支持 HEAD） |
| `GET /auth/status` | `{authenticated, subject?, displayName?}`（公开） |
| `POST /auth/sms/send` | 校验 `^1\d{10}$`（400）；60s 冷却（429 带 `cooldownSeconds`）；6 位码 5 分钟有效；日志打印 `[dsh-web-login] [演示] 验证码 123456（138****1234）` |
| `POST /auth/sms/verify` | 无挑战 400 / 过期 410 / 错码 400 带 `remainingAttempts` / 超 5 次销毁 410；成功 → upsert 账户 + mint v2 cookie（subject=phone）+ `{ok, redirect:'/'}` |
| `POST /auth/logout` | 清 cookie，204 |

- 所有 POST 校验 Origin == Host（CSRF；`/auth` 不在 `/api` 信任栅栏内）。
- `src/page.ts` + `src/strings.ts` — 登录页（内联 vanilla JS/CSS，无静态资源拷贝）：
  - **左侧品牌墙**（约 55%）：`#f7b3d2 → #e08bc8 → #d678c1` 渐变底 + 柔光晕/网格纹理，白色层叠 SVG logo + 红"秘"角标，主标题"星躍智 · AI 秘书工作台"，副标语，三条产品亮点（AI 团队协作 / 任务自动流转 / 数据本地化）。
  - **右侧登录卡**（约 45%）：双 Tab——「验证码登录」（+86 前缀、手机号输入、验证码输入 + 获取验证码 60s 倒计时、渐变登录按钮、错误提示与加载态）｜「微信扫码」（"即将上线"徽标 + 占位二维码框 + 敬请期待文案）。
  - 窄屏（<900px）品牌区折叠为顶部横幅；focus 品牌色 ring、按钮 hover 上浮、Tab 下划线过渡。
- `tests/login.spec.ts` — 路由语义全覆盖（校验/冷却/尝试上限/自动注册/cookie 签发/Origin 校验/页面渲染）。

### 阶段 3：接线与问候语

1. `packages/bundle/web-app/cordis.patch.yml`：insert 表加 `web-login` 行；`packages/bundle/web-app/package.json` dependencies 加 `@deepseek-ai/dsh-web-login`。
2. workbench 问候（`packages/workbench/workbench/src/index.ts` L122）：优先 `this.ctx.get('loginSession')?.displayName()`，无登录身份回退现有 `resolveUserName()`；用 `import type {} from '@deepseek-ai/dsh-web-login'` 补 Context 类型，不加强 inject。
3. 更新 `packages/host/README.md` 包表、bundle README、`packages/bundle/web-app/tests/web-app.spec.ts`、ui-workbench 问候测试（登录名优先）。

### 阶段 4：文档与门禁

1. Agent Note 三件套 `.agents/notes/implemented/feature/2026-09-11-web-phone-login.md`（英文 + 中文 + sidecar）。
2. connection README（cookie v2、强制登录、trustLoopback 移除）、webserver/web-login README。
3. `pnpm run gen-module-graph`（模块图新鲜度门禁）。
4. **部署注意**：用户侧 `~/.dsh/profiles/web/cordis.patch.yml` 含 `trustLoopback: true`，字段删除后会 fail loud——实施时同步移除该行。

## 验证

1. 聚焦测试：`packages/client/connection`、`packages/host/web-login`、`packages/host/frontend-static`、`packages/workbench/workbench`、`packages/client/ui-workbench` 的 vitest。
2. `pnpm run typecheck`；`pnpm run verify-cordis-config`；`pnpm run doc-sync`。
3. `pnpm run build` 后重启 `dsh web`，浏览器验证：
   - 打开 `http://127.0.0.1:3080/` → 303 到 `/login`，登录页按设计渲染（双 Tab、品牌墙）；
   - 服务端日志出现 `[演示] 验证码`；输入手机号+验证码 → 自动注册登录 → 回到工作台；
   - 右上问候语显示掩码手机号（如 `138****1234`）；
   - `/?token=...` 启动直通仍有效；`GET /auth/status` 未登录返回 `{authenticated:false}`。
