# 登录手机号绑定 AI 岗位（成员制）实施计划

## Context（背景）

当前登录（`packages/host/web-login`）只有手机号账号，无岗位、无权限，所有人登录后看到同一个工作台。需要引入"成员制"：登录手机号绑定 AI 团队岗位（秘书/会计/法务/审计），登录后按岗位进入不同工作范围。已拍板三个决策：

1. **邀请制**：首个注册手机号自动成为 owner（老板），owner 发邀请码给成员绑定岗位；未绑定者为访客视图
2. **可多岗位**：一个手机号可绑多个岗位（`roles` 数组）
3. **工作区隔离**：前端按角色过滤导航/花名册/任务标签/成员下拉 + 服务端对管理路由做角色校验；任务级数据隔离不在本期

## 关键技术结论（已验证）

- **不新建包**，扩展 `web-login`；`packages/bundle/web-app/cordis.patch.yml` L196 已注册，无需改装配
- **同源 fetch 有先例**：`packages/client/ui-open-in-app/src/client/controller.ts` L35-86（注入 fetcher、默认带 cookie）。client 直接 `fetch('/auth/status')` 取身份+roles；workbench host 的 `greetingName()` 是进程级软查找（无 per-request subject），**host 侧不动**
- **域版本策略（重要修正）**：`web_login` 域 **version 保持 1**，只增 `members`/`invites` 两张表。`single` 布局读取是严格版本匹配（`storage-json/src/format.ts` L66-71），升 v2 会让旧介质打开即拒；纯加表时旧介质 parse 对缺失声明表建空 map（format.ts L76-81），天然兼容。理由记入 Agent Note
- 角色 id 与 client 侧 [roles.ts](/Users/apple/Documents/hr/packages/client/ui-workbench/src/client/roles.ts) 对齐：`'secretary'|'accountant'|'legal'|'audit'`；owner 是派生概念（accounts 表 `createdAt` 最早的手机号），不进 roles 数组
- 导航注册是静态 `slots.inject`（异步 owner 状态到达前已注册），owner 专属页只能**渲染时**门控（非 owner 渲染 null）
- 不发布 `./invariant`（owner 判定与 redeem 均为路由内单一操作点，无独立观测可发散），README 记录理由
- SDK expected outputs 不触及（无 SessionEventMap/agent-loop/RPC 变化）；默认（未登录/无角色）时渲染不变，旧 web 快照不破

## 分阶段实施

### 阶段 1 — web-login 存储（[spec.ts](/Users/apple/Documents/hr/packages/host/web-login/src/spec.ts)）
- version 留 1；`tables` 增 `members`（keyed by phone：`{ roles, grantedBy, grantedAt }`）与 `invites`（keyed by code：`{ roles, createdBy, createdAt, expiresAt, acceptedAt? }`）
- 导出 `ROLE_IDS` 常量与 roles 数组的 zod 校验（非空、去重、值域）

### 阶段 2 — web-login 路由（[shared.ts](/Users/apple/Documents/hr/packages/host/web-login/src/shared.ts) + [index.ts](/Users/apple/Documents/hr/packages/host/web-login/src/index.ts)）
- `shared.ts`：4 个路由常量（`POST /team/invites`、`POST /team/invites/redeem`、`GET /team/members`、`DELETE /team/members/:phone`）；`AuthStatusPayload` 加 `roles?` 与 `isOwner?`（L27-34）；`LoginErrorPayload` codes 扩 `'unauthenticated'|'forbidden'|'bad-invite'|'invite-used'|'invite-expired'`；请求/响应 payload 接口
- `index.ts`：`ownerPhone()`（`accounts.entries()` 按 `createdAt` 最小，平局按 phone 串序）；`Config` 加 `inviteValiditySeconds`（禁硬编码 tunables）；4 个路由 effect——复用 `readPostFields`/`parseJsonObject`（L195）校验模式，DELETE 用 `kind: 'prefix'` 解析尾段 phone；未登录 401、非 owner 403；redeem 校验过期/已用后写 members + 盖 acceptedAt；邀请码 `node:crypto` randomBytes；`/auth/status`（L272-276）补 roles/isOwner；owner 自解绑拒绝（403）

### 阶段 3 — web-login 测试（[login.spec.ts](/Users/apple/Documents/hr/packages/host/web-login/tests/login.spec.ts)，复用 boot()/trust stub 模式）
- 未登录 401 / 非 owner 403；owner 创建邀请（码随机）；roles 非法 400；accounts 空（无 owner）时拒绝
- redeem 全生命周期：有效 / 不存在 / 已用 / 过期 / 重放竞态；绑定后 `/auth/status` 返回 roles
- GET members 含 grantedBy；DELETE 成功 / 非 owner / owner 自解绑拒绝 / phone 格式
- owner 派生（`vi.setSystemTime` 控注册先后）；持久化断言（readFile 模式 L323-326）；dispose 后 404（L362-373）

### 阶段 4 — client（[workbench-store.ts](/Users/apple/Documents/hr/packages/client/ui-workbench/src/client/workbench-store.ts)）
- `WorkbenchState` 加 `my: { name: string | null, roles: RoleId[], isOwner: boolean }`（INITIAL 同步默认值）；`readAuthStatus()` 同源 fetch，失败静默降级（仿 `readHost` L287-294）；并入 `load()` 的 Promise.all（L338）
- 花名册/成员下拉/任务标签按 `my.roles` 过滤（owner 与未绑定者看全量；绑定者只看自己岗位 + 公共）；问候语带岗位后缀（"下午好，xxx（会计），…"）
- 新增 `pages/MembersPage.tsx`（owner 专属）：邀请码创建（选岗位）、成员列表、解绑；`WorkbenchPageId` 加 `'members'`、`WorkbenchShell.tsx` TITLES/SUBTITLES（L34-43）与条件渲染接线、`NAV_TARGETS`（index.ts L69）追加、渲染时 isOwner 门控
- i18n：[locales.ts](/Users/apple/Documents/hr/packages/client/ui-workbench/src/client/locales.ts) zh（key-set 源）+ en 双处同步、行对齐，全部走 `t()`（verify-client-ui-i18n）

### 阶段 5 — 文档与门禁
- web-login README（双语）：新路由、邀请语义、域加表理由、不发布 invariant 的理由
- Agent Note（非平凡变更必须）：`.agents/notes/implemented/feature/` 下新建
- 门禁：`pnpm run test:docs`、typecheck、lint、duplication、web-login + ui-workbench vitest

## 验证方案

1. 单测：阶段 3 用例全绿；ui-workbench 的 `workbench-store.client.spec.ts`、`dashboard.client.spec.tsx`、`nav-action.client.spec.tsx` 补 my 状态用例
2. 端到端（Playwright，同登录功能验证方式）：
   - 清 cookie 访问 → 注册手机号 A → 验证 `/auth/status` 返回 `isOwner: true`（首个注册者）
   - A 创建邀请（选会计岗）→ 用手机号 B 登录并 redeem → B 的 `/auth/status` 含 `roles: ['accountant']`
   - B 登录后：问候语带岗位、AI 团队/任务视图过滤到会计；导航无"成员管理"
   - A 登录：成员管理页可见，列表含 B；解绑 B 后 B 刷新变访客
3. 存量兼容：用升级前生成的 `web_login.json` 介质启动（旧 v1 文件 + 新代码），确认账号可读、members/invites 为空表

## 本期边界（不做）

- 任务级数据隔离（服务端按岗位过滤任务/会话数据）——后续阶段
- 微信扫码登录（沿用"即将上线"占位）
- SMS 真实通道（演示模式验证码/邀请码均走服务端控制台或响应返回）
