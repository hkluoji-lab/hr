# Agent Note: 在 loopback index 信任之前兑换启动令牌

Status: implemented

[English](2026-09-11-loopback-token-exchange-precedence.md) | 中文

## Problem

`BrowserAuth.authorizeIndex` 在 `?token=` 兑换之前先检查 `trustLoopback`。配置了 `trustLoopback: true` 的 `dsh web` 部署因此在 `127.0.0.1` 上对打印的根 URL 直接返回 index.html，从不写入绑定 authority 的 cookie，而 `/api` 分发仍要求该 cookie。每个没有先前兑换过的 cookie 的浏览器窗口——全新无痕窗口、清空过的 profile——都能加载外壳，然后所有 Remote 调用全部以 `HTTP 401` 失败（例如呈现为 `directory picker failed: ... transport failure for /api/directoryPicker/pick: HTTP 401`），且没有任何 URL 能修复该状态，因为兑换路径在 loopback 上不可达。

## Decision

[authorizeIndex](../../../../packages/client/connection/src/browser-auth.ts) 现在先运行令牌兑换分支，仅对无令牌请求应用 loopback 信任。有效的 `?token=` 根请求无论 `trustLoopback` 与否都会写入 cookie 并重定向到干净的 `/`；错误令牌即使在 loopback 上也返回 401，与非 loopback 行为及 401 文案自身「重新打开打印的 URL」的指示一致；无令牌的 loopback 请求继续返回 index.html，文档化的裸 URL 便利保持不变。`/api` 围栏保持仅 cookie，没有 loopback 层。

## Alternatives considered

**让 loopback 的 `/api` 请求也被信任。** 在 loopback 上取消 cookie 校验会让任何本地浏览器上下文无需会话即可驱动 agent，且文档化契约保持 `/api` 的 cookie 校验不变。予以否决。

**让部署去掉 `trustLoopback: true`。** 这能恢复兑换，却牺牲了该标志存在的意义——裸 URL 访问，且所有设置该标志的部署都会继承这个陷阱。予以否决。

## Consequences

在 `trustLoopback: true` 下，携带过期令牌的 URL 现在返回 401 页面，而不是静默打开未认证的外壳——失败前移到最早可解析的位置。已持有有效 cookie 的窗口不受影响。[browser-auth.host.spec.ts](../../../../packages/client/connection/tests/browser-auth.host.spec.ts) 覆盖 loopback 信任下的兑换与过期令牌 401。
