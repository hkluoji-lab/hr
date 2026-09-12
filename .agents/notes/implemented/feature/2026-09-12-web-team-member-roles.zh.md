# Agent Note: Web 工作台的手机号绑定团队成员角色

Status: implemented

[English](2026-09-12-web-team-member-roles.md) | 中文

## Problem

登录面此前只有账号：每个登录手机号看到同一个工作台，无岗位、无范围。部署需要手机号绑定 AI 团队岗位（秘书、会计、法务、审计）、一个手机号可持多岗，并在登录后进入按角色划定的工作区——本期不在服务端做任务级数据隔离。成员如何加入、谁有资格拉人、每条规则住在哪里，必须先于任何 UI 过滤固定下来。

## Decision

**成员制活在 `dsh-web-login`，叠在账号之上。** `web_login` 域新增两张表：`members`（按手机号存 `{roles, grantedBy, grantedAt}`）与 `invites`（按邀请码存 `{roles, createdBy, createdAt, expiresAt, acceptedAt?}`）。owner 不存储在任何地方：每次调用派生为最早注册的账户（平局按手机号串序），因此所有权跟随 accounts 表、不可能与它相悖。加入仅凭邀请：owner 为一组校验通过的岗位创建一次性邀请（`POST /team/invites`，6 字节随机 base64url 码，有效期是 Config `inviteValiditySeconds`，默认一周），任何已登录手机号可兑换（`POST /team/invites/redeem`），把邀请的角色并入既有绑定并盖 `acceptedAt`，重放即 409。owner 通过 `GET /team/members` 与 `DELETE /team/members/:phone` 管理名册；解绑 owner 本人被拒绝，否则所有权会照样留存。对已注册的账号，owner 可以跳过邀请环节：`PUT /team/members/:phone` 一次调用为该账号整体指派岗位集合，替换既有绑定——这是对单个成员绑定的编辑决策，刻意不是邀请兑换的并集。五条管理路由对未登录答 401、对 owner 以外的人答 403，`/auth/status` 扩展 `roles?` 与 `isOwner?`，消费者无需第二次读取。角色 id（`secretary`/`accountant`/`legal`/`audit`）就是客户端工作台 `roles.ts` 的词表，由一个 zod schema 校验（非空、无重复）。

**域版本保持 1。** `single` 布局读取严格匹配声明版本，升到 2 会让所有既有 `web_login.json` 介质在打开时被拒。纯新增声明表是兼容的：既有 `accounts` 表 schema 不变，早于新表的介质把缺失表解析为空。因此两张新表随版本 1 发布。

**客户端从 `/auth/status` 收窄工作区。** `WorkbenchState` 新增 `my: {name, roles, isOwner}`；`load()` 同源探测一次该路由，失败静默降级为未绑定访客形态，非 Web 组合的渲染与从前完全一致。`scopedRoles`/`scopedMembers` 把角色词表与预设名册过滤为调用者的角色加无角色预设——owner 与未绑定访客看全量。问候语追加绑定角色，名册、任务助手选择器与团队页读取收窄后的视图。owner 获得第六个导航入口**成员管理**，打开全帧页面驱动发布的 `/team` 路由（直接指派岗位到已注册手机号、按勾选岗位创建邀请、读取带授予元数据的名册、解绑）。槽位注册保持静态；入口在渲染时绑定 `useMy`，非 owner 一律渲染 null——这是唯一可行的门控，因为导航注册在异步 owner 状态到达前就已完成。

**工作区隔离 = 客户端渲染 + 四条受守卫的路由。** 角色绑定过滤浏览器渲染的内容并守住管理路由；任务与会话数据不在服务端按角色隔离。登录页带有可选邀请码字段，验证通过后即刻兑换，为带着邀请码到来的成员闭合加入回路。

## Alternatives considered

**域版本升到 2。** 看似正确实则错误：严格版本匹配会让所有既有介质打不开，把一次兼容新增变成一场迁移。否决，改为原地加表。

**把 ownership 存成标志位或角色。** 存储 owner 标志可能与 accounts 表相悖（谁先注册），还需要自己的转移逻辑。从 `createdAt` 派生保持单一事实源；owner 自解绑拒绝恰好覆盖了那条本来就需要规则的交互。

**单独建成员包。** 成员制离开 web-login 已有的账号与 cookie 就没有意义；拆出去会让一条加入流程横跨两个插件。否决；web-login 原地扩展并经 `./shared` 重发线上契约。

**现在就做服务端任务级数据隔离。** 它需要会话与工作台 Remote 拿到每请求的 subject 上下文——与登录面是不同的接缝。推迟；本期只收窄渲染与管理路由，两份 README 均已写明。

## Consequences

既有 `web_login.json` 介质以空的 `members`/`invites` 原样打开；账号照常工作。首次注册之前没有 owner，每条管理路由答 403、邀请无从创建——第一个注册的手机号仅凭存在即成为 owner。持多岗的成员处处看到并集；解绑必须由 owner 执行。客户端以 `/auth/status` 决定可见性，伪造浏览器可以在本地解除「成员管理」入口的隐藏，但它背后的每条路由仍答 403——守卫在服务端，过滤只是便利。邀请一次性且在服务端过期；已兑换或过期的码在兑换时响亮失败。

## Testing

web-login 测试覆盖 owner 守卫（401 未登录、403 非 owner、无 owner 时拒绝）、随机码邀请创建与非法角色、兑换全生命周期（未知、已用、过期、重放、角色并集）且 `/auth/status` 反映绑定、名册与解绑路由（含 owner 自解绑拒绝）、直接指派（替换语义，会话/所有权/线上/账号的守卫链）、受控注册顺序下的 owner 派生、跨域文件的持久化、dispose 后 404。客户端测试覆盖 `my` 状态与 `scopedMembers`/`scopedRoles` 过滤、问候语角色后缀（访客静默）、owner 专属导航入口、成员管理页（直接指派、创建邀请、名册、解绑）以及 browser-plugin 集成（nav 期望、fetch 打桩、members 动作驱动）。
