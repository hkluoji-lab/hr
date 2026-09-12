# Agent Note: Web 表面的手机验证码登录

Status: implemented

[English](2026-09-11-web-phone-login.md) | 中文

## Problem

Web 表面此前没有登录页：本机浏览器无身份直进（`trustLoopback` 放宽 index 门禁），远程浏览器只收到纯文本 401，工作台问候语面向宿主 OS 账户。部署需要手机号注册/登录、短信验证码、品牌化登录页与强制登录姿态；微信扫码登录待服务商可用后再做。

## Decision

三块结构，各管一件事：

**强制登录进入连接信任栅栏。** 删除 `trustLoopback` 及其 `ConnectionConfig` 字段。`authorizeIndex` 保持 token 交换优先——启动打印的 `?token=` URL 仍然铸造匿名 v1 会话 cookie 并重定向到干净的 `/`——其余未认证的 index 请求一律 303 到 `/login`。`/api` RPC 拒绝保持 401，只有 index 导航才重定向。两种 cookie 版本同时有效：v1（匿名，由 token 交换铸造）与 v2（同一载荷加上命名登录账户的 `subject` 字符串），由同一个校验版本的解码器读取。

**`@deepseek-ai/dsh-web-login` 拥有登录表面。** 该宿主包渲染 `/login` 页面（左侧品牌墙、右侧手机号 + 6 位验证码卡片、标注即将上线的微信占位），提供认证状态路由、短信发送/验证路由和登出路由。它与组合的 connection 服务双向复用信任：`requestRejection` 应答 Host/Origin 栅栏（403）并放行本表面目标 caller 的 401，验证成功后通过 `issueSessionCookie` 铸造会话 cookie，因此 cookie 序列化、签名与生命周期留在一处。验证码仅存内存，冷却、有效期与尝试上限都是 Config；未接短信服务商时，下发验证码以显式 `[演示]` 标记打印到服务端控制台——直接用 console 输出，因为随附 Web 组合没有注册 logger exporter，而这行与 `dsh web:` URL 行一样是面向操作者的输出。账户按手机号持久化在 `web_login` 存储域，掩码号码即显示名；首次验证成功即注册账户，登录与注册是同一条流程。插件同时提供 `loginSession` Context 服务——本进程生命周期内最近一次登录，按设计只存内存。

**工作台问候语优先登录身份。** `remoteSnapshot` 在请求时解析问候名：存在登录时用 `loginSession` 显示名，否则回退 init 时解析的宿主 OS 账户。工作台不注入 web-login 服务，而是软读取——登录是表面级行，非 Web 组合永远不会挂载它。

## Alternatives considered

**保留 loopback 信任不做登录。** 问候语拿不到身份，远程访问依旧不可用，LAN 场景仍需要登录页。选择删除。

**在 web-login 内自行铸造 cookie。** 第二个签名方会把 cookie 签名与生命周期所有权从信任栅栏拆走。否决；栅栏端到端拥有信任。

**现在做微信扫码登录。** 需要服务商资质与审批流程。页面保留入口，路由集合在其到来时不变。

## Consequences

每个新浏览器在每个 cookie 生命周期内经过一次登录页；启动打印的 URL 行为不变。profile patch 仍设置 `trustLoopback` 的部署在加载时 fail loud——需删除该行。短信通道是演示级：验证码只出现在服务端控制台，接入真实服务商是部署方事务。`web_login` 存储域从 schema 版本 1 起步。客户端会话失效仍以 Remote 调用 401 呈现，shell 的重连对话框仍是那里的恢复路径。

## Testing

连接测试覆盖 index 重定向矩阵（token 交换、已认证、未认证到 `/login`）、v1/v2 cookie 往返与 subject 读取。web-login 测试覆盖页面渲染、信任栅栏放行、发送/验证（含冷却、过期、尝试耗尽、错误码计数）、登出、状态与掩码名的存储持久化。工作台测试覆盖问候语回退宿主账户与优先启动后记录的登录身份。frontend-static 测试断言未认证 index 请求 303 到 `/login`。
