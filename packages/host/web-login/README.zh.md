---
description: "Web 登录面：带品牌墙的渲染登录页、手机号 + 短信验证码与密码凭据路由（注册/登录/重置）、loginSession 身份服务，以及 owner 的团队成员邀请与名册管理。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-login

[English](README.md) | 中文

## 概述

挂载 `dsh-web-login`，Web 部署即拥有真正的登录页：未认证浏览器落到 `/login`，用手机号、密码注册（仅当部署要求时再加一个短信验证码），随后用密码或短信验证码登录（验证成功同时首次建号），离开时携带绑定账号的会话 cookie；页面还会在登录后兑换可选的邀请码。未接短信服务商时，每个验证码都以明确的演示标记打印到服务端控制台。其上是成员制：首个注册手机号即 owner，一次性邀请码把手机号绑定到 AI 团队岗位，`/auth/status` 一并回答角色与 owner 身份。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在携带 `webServer`（路由载体）、`connection`（信任栅栏与会话 cookie）、`storageDomain`（账号介质）的组成中挂载本包——随附的 Web 组成即满足条件。`/?token=...` 进程启动交换保持有效：它铸造匿名会话，本面在登录时将其升级为绑定账号的会话。

### 选择的时机

适用于需要区分"浏览器前是谁"的 Web 部署——工作台问候语、积分以及未来的按账号面读取登录身份而非匿名 cookie，绑定的角色同时划定工作台的渲染视图。避免把它当其他面的逐路由授权层——在团队管理路由之外，签发的 cookie 与匿名会话授予相同的 Web 访问；服务端任务级数据隔离尚不存在。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-web-login'
  config:
    codeCooldownSeconds: 60
    codeValiditySeconds: 300
    maxVerificationAttempts: 5
    requireRegistrationCode: false
    inviteValiditySeconds: 604800
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `codeCooldownSeconds` | 60 | 同一手机号两次发送的最小间隔，单位秒。 |
| `codeValiditySeconds` | 300 | 一个验证码可验证的时长，单位秒。 |
| `maxVerificationAttempts` | 5 | 一个挑战被销毁前允许的错误验证次数。 |
| `requireRegistrationCode` | false | `POST /auth/register` 是否在密码之外索取短信验证码。为假时仅凭手机号与密码建号并隐藏验证码字段，因此未接短信服务商的部署同样可以注册账号。 |
| `inviteValiditySeconds` | 604800 | 一个成员邀请码可兑换的时长，单位秒。 |

默认值即随附体验；演示部署可收紧。生成式[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-login)是全部可接受字段的穷尽来源。

### HTTP 面

| 路由 | 语义 |
|---|---|
| `GET /login` | 渲染页（200、`no-store`、支持 HEAD）。 |
| `GET /auth/status` | 调用者会话的 `{authenticated, subject?, displayName?, roles?, isOwner?}`——角色与 owner 身份是成员制事实。 |
| `POST /auth/sms/send` | 为 `^1\d{10}$` 手机号签发一个验证码；冷却中返回 429 与 `cooldownSeconds`。验证码仅以 `[演示]` 标记打印到服务端控制台——绝不出现在响应中。 |
| `POST /auth/sms/verify` | 验证：400 `no-challenge`/`bad-code`（附剩余次数）、410 `expired`/`exhausted`；成功即首次登录自动注册、铸造绑定账号的 cookie，并返回 `{ok, redirect: '/'}`。 |
| `POST /auth/register` | 以 `password`（8–64 位，含一个字母和一个数字）注册 `phone`，部署设置 `requireRegistrationCode` 时另加 `code`，铸造 cookie 并返回 `{ok, redirect: '/'}`；400 `weak-password`/`no-challenge`/`bad-code`、409 `phone-registered`。 |
| `POST /auth/password/login` | 对照存储凭据验证密码；`remember: true` 铸造持久 cookie，否则铸造浏览器会话 cookie。400 `no-credential`/`wrong-password`。 |
| `POST /auth/password/reset` | 经短信验证后替换凭据并登录；400 `no-account`/`weak-password`。 |
| `POST /auth/logout` | 清除会话 cookie（204）。 |
| `POST /team/invites` | owner 为一组岗位创建一个一次性邀请码，收到 `{ok, code, expiresAt}`；401 未登录、403 非 owner、400 角色非法。 |
| `POST /team/invites/redeem` | 任何已登录手机号兑换一个邀请码；邀请的角色并入调用者的既有绑定。400 `bad-invite`、409 `invite-used`、410 `invite-expired`。 |
| `GET /team/members` | owner 读取名册 `{ok, owner, members}`，按授予时间排序。 |
| `PUT /team/members/:phone` | owner 一次调用为已注册账号整体指派岗位集合 `{roles}`；该集合替换既有绑定。400 `bad-phone`/`bad-request`/`no-account`，403 非 owner 或 owner 本机号。 |
| `DELETE /team/members/:phone` | owner 解绑一个成员（204）；owner 本人的手机号被拒绝（403）。 |
| `GET /team/accounts` | owner 读取全部已注册账号 `{ok, owner, accounts}`，按注册时间排序——唯一能触及从未绑定过岗位的账号的列表。 |
| `DELETE /team/accounts/:phone` | owner 删除一个账号及其密码凭据与岗位绑定（204）。400 `bad-phone`/`no-account`，403 非 owner 或 owner 本机号（所有权正由它派生）。 |

### `loginSession` 服务

插件提供 `ctx.loginSession`，持有本进程生命期内最近一次登录（`displayName()`/`phone()`）。刻意只在内存：持久账号位于 `web_login` 存储域；该服务回答"刚才是谁登录"而无需域读取。宿主面读取它用于展示（工作台问候语），缺失时自行回退。

### `./shared` 子路径

路由路径与线上载荷类型以浏览器安全的 `./shared` 子路径发布（仅常量与类型）。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

[`src/index.ts`](src/index.ts) 是函数插件：打开 `web_login` 域（单布局 `accounts` 表，以手机号为键；掩码显示名 `138****1234` 在写入时派生），并在 `ctx.webServer` 注册各条路由。信任原样复用组成的 connection 栅栏：每条路由先问 `requestRejection`——403（Host/Origin 栅栏：DNS 重绑定、跨站 POST）拒绝，401（"受信任调用者，未登录"）放行，因为这正是本面服务的调用者。POST 主体在线上校验：`application/json` 本质、64 KiB 上限、精确字符串字段。验证码存于内存仓 [`src/sms.ts`](src/sms.ts)——每手机号一个活跃挑战，带冷却、过期与尝试上限；每个终局都销毁挑战。验证成功即 upsert 账号、记录 `loginSession`，并经 `connection.issueSessionCookie(headers, phone)` 铸造 cookie，签发、属性与生命周期保持单点。[`src/page.ts`](src/page.ts) 从 [`src/strings.ts`](src/strings.ts) 渲染页面——内联 CSS 与原生 JS，无外部资源；页面脚本探测 `/auth/status`，对已登录浏览器跳过表单，调用者未持任何角色时改为提供邀请码字段。

密码凭据与账号并存：域的 `credentials` 表存每手机号的 `passwordHash`，[`src/password.ts`](src/password.ts) 以 scrypt 散列（每哈希独立盐、算法参数内嵌于存储串）并以 `timingSafeEqual` 比较。注册仅在部署设置 `requireRegistrationCode` 时先验证短信挑战再写凭据——否则手机号与密码就是整个请求，页面也不渲染验证码字段；重置则始终验证挑战。密码登录在勾选"记住我"时以 connection 默认生命周期铸造 cookie，否则铸造浏览器会话 cookie。登录页提供四个 Tab（密码、验证码、注册、微信占位）加忘记密码进入的重置面板；前端校验在任何 POST 之前镜像线上规则，注册策略以序列化标志传入页面脚本。

成员制活在 [`src/spec.ts`](src/spec.ts)：域的 `members` 表存每手机号的角色绑定（`roles`、`grantedBy`、`grantedAt`），`invites` 表存每邀请码的一次性邀请（`roles`、`createdBy`、`expiresAt`、`acceptedAt?`）。owner 每次调用时派生为最早注册的账户（平局按手机号串序），因此所有权跟随 accounts 表、无第二事实源；兑换把邀请的角色并入调用者绑定并在邀请上盖 `acceptedAt`，重放即 409。直接指派（`PUT /team/members/:phone`）则整体替换目标账号的岗位集合——owner 对单个成员的绑定做一次性决策。members/invites 新增期间域版本保持 1：`single` 布局读取严格匹配版本，升级会让所有既有 `web_login.json` 介质打不开，而缺失的声明表按空表解析、既有 `accounts` 表的 schema 未变。accounts 表同时是删除面：`GET /team/accounts` 列出全部已注册账号（含未绑定岗位者），`DELETE /team/accounts/:phone` 删除账号连同其凭据与绑定，并拒绝 owner 本机号——所有权正派生自最早注册的账号。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-client-connection](../../client/connection/README.zh.md) — 本面组合的信任栅栏（`requestRejection`）与会话 cookie 签发器（`issueSessionCookie`）。
- [dsh-host-webserver](../webserver/README.zh.md) — 承载十三条 HTTP 端点的路由注册表。
- [dsh-storage-domain](../../storage/storage-domain/README.zh.md) — 拥有持久 `web_login` 账号的域层。
- [Host package map](../README.zh.md) — 本包所属的 GUI-host 家族。

-----

<a id="model-experience"></a>
## 模型体验

### 登录页与 `loginSession` 服务

#### What the model sees

无。本包通过十三条 HTTP 路由（`/login`、`/auth/status`、`/auth/sms/send`、`/auth/sms/verify`、`/auth/register`、`/auth/password/login`、`/auth/password/reset`、`/auth/logout`、`/team/invites`、`/team/invites/redeem`、`/team/members`、`PUT /team/members/:phone`、`DELETE /team/members/:phone`）和一个内存挑战仓服务人类登录流程；它不注册模型可读的工具、提示段、消息内容或事件，登录身份也只留在服务端的 `web_login` 域和 `ctx.loginSession` 中。

#### Token effect

无；任何模型请求都不包含登录页字节、路由载荷或登录身份。

#### KV Cache effect

无；本包从不组装或发送 provider 请求，因此没有可缓存或失效的内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **无真实短信服务商。** 验证码以明确的 `[演示]` 标记打印到服务端控制台；在 provider 落到 `issue`/`verify` 之前，部署不得将本路由集暴露给不可信网络。只要 `requireRegistrationCode` 保持假（默认值），注册本身不需要 provider，这正是无 provider 部署也能建号的原因。
- **微信扫码是占位。** 第二个 Tab 渲染"即将上线"；后端不存在。接线意味着真实 provider 加上经 `connection` 的自有 cookie 铸造。
- **cookie 不隔离访问。** 角色绑定守住 owner 的管理路由并划定工作台的渲染视图；在其他所有面上，登录 cookie 与匿名 cookie 授予相同访问，服务端任务级数据隔离推迟到出现需要的消费者。
- **`loginSession` 是进程内的。** 重启即忘记最近登录；宿主面在下次登录前回退到自身默认值。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

强制登录重构——v2 携带主体的 cookie、移除回环信任旁路、登录重定向，以及本面的提升决策——记录在[登录页 Agent Note](../../../.agents/notes/implemented/feature/2026-09-11-web-phone-login.zh.md)。成员制——owner 派生、邀请生命周期、域版本 1 扩展、以及宿主与客户端之间的工作区隔离分工——记录在[团队成员角色 Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-web-team-member-roles.zh.md)。密码凭据层——scrypt 哈希格式、credentials 域表、"记住我"的 cookie 持久化分工、以及四 Tab 页面——记录在[密码认证 Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-web-password-auth.zh.md)。免短信注册——`requireRegistrationCode` Config 字段、页面的条件验证码字段、以及变为可选的线上 `code`——记录在[免验证码注册 Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-web-registration-without-sms.zh.md)。

</details>

**Runtime invariant:** 无 companion 发布。插件在一个域和一个内存挑战仓之上注册十三条无状态路由；路由注册经 HMR 安全测试证明可释放。owner 派生与邀请兑换各自只是其路由内的单一操作点，不存在可发散的独立观察。
