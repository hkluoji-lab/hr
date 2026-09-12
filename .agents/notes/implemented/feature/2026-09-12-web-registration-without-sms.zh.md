# Agent Note: 免短信验证码的手机号 + 密码注册

Status: implemented

[English](2026-09-12-web-registration-without-sms.md) | 中文

## 问题

`POST /auth/register` 在密码之外强制要求一个活跃的短信挑战，因此未接短信服务商的部署根本无法建号：通往固定凭据的唯一可用路径是短信登录后再重置密码。Web 登录面需要一种仅凭手机号与密码即可完成的注册，同时让真正接了短信通道的部署在同一条路由上保留挑战。

## 决策

**这个要求是 Config 字段，而不是第二条路由。** `requireRegistrationCode`（默认 `false`）决定 `POST /auth/register` 是否索取 `code`；同一条路由服务两种策略。`readRegisterFields` 据此读取 `['phone', 'password']` 或 `['phone', 'code', 'password']`，并返回 `[phone, code | undefined, validPassword]`，因此处理器只在收到 code 时验证挑战：`if (code !== undefined && !verifyChallenge(res, phone, code)) return`。部署未索取 code 时仍发来 code 会被忽略而非拒绝——一个多余字段不该决定策略。

**页面渲染部署实际索取的内容。** `renderLoginPage({ requireRegistrationCode })` 在要求关闭时省略 `#reg-code` 的 label、input 与发送按钮，打印一条无需短信验证码的提示，并把同一事实以 `var REG_CODE` 序列化进页面脚本。提交路径随后只在该标志下校验并发送 `code`，`bindSend` 对不存在的按钮直接跳过而不是在内部加守卫。字段的缺席才是诚实的渲染：禁用的输入框仍在承诺一个没有任何路由会签发的验证码。

**`RegisterPayload.code` 变为可选。** 线上类型把这一条件要求集中在一处，紧邻路由常量，其文档现在读作"手机号与密码（部署索取时外加一个短信验证码）"。密码重置保留自己的读取器（`readCredentialFields`）并始终要求挑战，因为对既有账号的凭据写入没有别的所有权证明。

## 考虑过的替代方案

**只要带了 code 就要求挑战。** 那会让客户端选择策略；策略属于部署，所以服务端只读取策略点名的字段。

**彻底去掉短信要求。** 日后接入 provider 的部署将没有路由可以打开；Config 字段把这个门留着，且不需要第二份实现。

**单独开一条免验证码路由。** 同一个建号决策用两条路由会重复重复手机号的 409、凭据写入与 cookie 铸造，还会让客户端在两者之间做选择。

## 后果

随附的 Web 组成无需短信服务商即可注册账号，演示控制台不再是新账号的关键路径。设置 `requireRegistrationCode: true` 的部署保留原有行为（含 `no-challenge`/`bad-code` 应答），页面则渲染带发送按钮的验证码字段。注册仍对任何匹配 `^1\d{10}$` 的手机号开放：挑战关闭时没有任何东西证明调用者拥有该号码，而账号只能通过它刚设置的凭据抵达。

## 测试

Web-login 测试覆盖默认路径（仅凭手机号与密码注册、`HttpOnly` cookie、域文件中的 `passwordHash`/`scrypt$`、随即密码登录）、配置路径（缺 code 字段为 `bad-request`、无活跃挑战时为 `no-challenge`、用演示控制台取码后成功）、任何写入之前的线上/策略拒绝、重复手机号 409，以及页面两种渲染（`requireRegistrationCode` 为假时无 `#reg-code`/`#reg-send` 且 `var REG_CODE = false`，为真时相反）。
