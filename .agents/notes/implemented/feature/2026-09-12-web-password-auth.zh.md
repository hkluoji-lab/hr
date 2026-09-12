# Agent Note：Web 登录面的密码凭据

Status: implemented

[English](2026-09-12-web-password-auth.md) | 中文

## 问题

登录面只认一个因子：每次登录都要短信验证码，回头用户每次都得等新验证码，演示控制台扛起了整个登录故事。工作台需要一个长期凭据——密码登录作为默认 Tab、自助密码注册、忘记密码路径——同时短信流程保留给无凭据账号和凭据写入的挑战校验。微信扫码需保持可见占位，且不引入竞争性后端。

## 决策

**凭据与账号同域并存。** `web_login` 域新增 `credentials` 表（每手机号 `{passwordHash, createdAt, updatedAt}`）；按成员制同样的"原地加表"推理，版本保持 1。[`src/password.ts`](../../../../packages/host/web-login/src/password.ts) 以 scrypt 散列（N=16384、r=8、p=1、每哈希独立随机盐），存为自描述串 `scrypt$N$r$p$saltHex$hashHex`，参数升级可与旧哈希共存，比较用 `timingSafeEqual`。策略是 `spec.ts` 里的一个 zod schema（`passwordSchema`：8–64 位，至少一个字母和一个数字），注册与重置共用；页面在任何 POST 之前于前端镜像该策略。

**三条路由扩展本面；线上契约留在 `./shared`。** `POST /auth/register`（phone + code + password）在写账号与凭据前先验证活跃短信挑战——注册与登录不再是一条流，已存在手机号返回 409 `phone-registered`。`POST /auth/password/login` 对纯短信账号返回 400 `no-credential`，否则密码错误返回 400 `wrong-password`；除这两个码外不区分具体错因。`POST /auth/password/reset` 在触碰挑战前以 `no-account` 拒绝未知账号，探测无法消耗他人手机号的验证次数，随后验证挑战并替换哈希。三条路由都记录 `loginSession` 并像其他登录一样铸造 cookie。

**"记住我"是 connection 服务内部的持久化分工，不是第二个 cookie。** `mintSessionCookie`/`issueSessionCookie` 接受可选 `persistenceMilliseconds`：省略即配置的默认生命周期（持久 cookie），`0` 请求 `maxAgeSeconds: 0`，Set-Cookie 序列化将其渲染为浏览器会话 cookie（无 `Max-Age`/`Expires`），而签名载荷保持完整有效期。不勾选随浏览器关闭失效，勾选则存活。登录页发送 `remember: true` → undefined，未勾选 → 0。

**页面变成四个 Tab 加重置面板。** 密码登录（自动聚焦、密码显示/隐藏、记住我、忘记链接）、带可选邀请码字段的验证码登录（流程不变）、注册（验证码 + 密码 + 确认 + 协议勾选框，成功即自动登录，邀请码随后兑换）、以及只渲染"即将上线"、不发起任何请求的微信 Tab。忘记链接打开无独立 Tab 的重置面板；前端校验镜像线上规则（手机号模式、6 位验证码、密码策略、一致性检查），每个提交按钮带加载/禁用态。

## 考虑过的替代方案

**把密码存进 accounts 表。** 账号是画像事实（`displayName`、时间戳）；并非每个账号都有凭据，把可选密钥混进所有账号记录会迫使所有读取方面对 `passwordHash?`。独立表把可选性留在表层。

**bcrypt/argon2。** 两者都需为无跨部署哈希兼容需求的流程引入依赖；node 内置 scrypt 加参数编码删掉依赖并保留升级路径。

**JWT 或独立的"记住我 token"。** 会话 cookie 已携带主体与生命周期；第二个 token 会制造第二条信任路径。持久化参数复用已铸造 cookie 的签名与清除。

**微信 Tab 上线前先隐藏。** 该 Tab 预告路线图并保持布局稳定；隐藏会让卡片高度随 Tab 变化。它渲染占位面板、不发请求。

## 后果

此前注册的账号（纯短信）行为不变；其首个密码经重置或注册路径升级（经重置）到来。密码登录的 `no-credential` 点名纯短信场景，页面可据此建议验证码 Tab。重置路由在挑战检查前拒绝 `no-account`，攻击者无法廉价区分"未注册"与"验证码错误"，但能得知注册状态——接受，与注册路由的 409 一致。演示短信通道仍是注册与重置的挑战载体，这两个流程仍在服务端打印验证码；只有日常登录不再依赖控制台。

## 测试

Web-login 测试覆盖注册的线上/策略拒绝（弱、缺数字、缺字母、超长密码；拒绝时不写入）、409 重复手机号、活跃挑战要求、域文件中带 `scrypt$` 哈希的凭据持久化、密码登录线上校验、`no-credential`/`wrong-password` 且不记录身份、在 issuer 存根参数与渲染 Set-Cookie 头两侧断言的记住我持久化分工（会话 cookie 无 `Max-Age`）、以及重置生命周期（未知账号、挑战前先策略、轮换后旧密码失败新密码通过）。Connection 测试覆盖持久化覆盖参数（`0` → 会话语义、显式时长、默认回退）。页面测试断言四个 Tab、重置入口与新表单 id。
