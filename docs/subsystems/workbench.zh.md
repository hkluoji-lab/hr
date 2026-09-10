# 工作台

[English](workbench.md) | 中文

[`@deepseek-ai/dsh-workbench`](../../packages/workbench/workbench) 是 Web GUI 工作台的 host 半区：一个持久化的积分余额加一张只追加的发放台账，以及一个由 Agent 预设名册与活体会话折叠出的 AI 团队状态读模型。它声明 `workbench` 存储域，并通过 `workbench` Typert Remote 命名空间提供 `snapshot`、`ledger` 与 `addCredits`，让浏览器 surface 为积分与在场状态读取同一个由 host 拥有的答案，而不是各自重新派生这一 join。

来源：[`packages/workbench/workbench/src/index.ts`](../../packages/workbench/workbench/src/index.ts)

## 积分

该域为 version 1、`per-record` 布局：一个全局记录保存 `{ balance }`，一张以随机 UUID 为键的 `entries` 表每次发放保存一行 `{ amount, reason, at }`。`addCredits(amount, reason)` 在接触任一存储之前先校验——amount 需为不超过 `Config.maxGrant` 的正整数，reason 需为去空白后 1–200 个字符，其他输入以 `gateway/bad-request` 拒绝。校验通过的发放先追加台账行，再替换余额全局记录；两次写入都排在域的单一链上，因此并发发放不会交错或丢失增量。全新介质在首次发放前提供 `Config.startingBalance`，已有介质保留其持久化余额。

`ledger()` 按最新在前返回最近的发放，上限为 `LEDGER_READ_LIMIT`（50），因为台账只追加，每次发放都会累积一行。

## 团队状态

`snapshot()` 在返回当前余额的同时返回团队读模型：`agentPresets.list()` 发现的每个预设及其聚合状态，加上三个计数，以及按名册顺序排列、损坏预设排在最后的成员列表。预设发现报告损坏时为 `offline`；有活体非 blank 会话通过 `agentPreset` 与 `turnBoundary` 投影投影到该预设时为 `busy`；否则为 `online`。`online` 把 busy 成员计为可达，因此它衡量的是客户端可达的成员，而非空闲成员。折叠在调用时于 host 上运行；浏览器永不重算。

## Web surface

`@deepseek-ai/dsh-api-remotes` 挂载生成的 `workbench` 贡献，`@deepseek-ai/dsh-client-ui-workbench` 用它渲染 hero 积分 pill、赏金额度页与 tab，以及 AI 团队状态页与 tab。这些 surface 都直接渲染 Remote 答案，自身不持有余额或在场状态。

## 边界与限制

- 积分是部署级的：只有一个全局余额，没有按用户、按会话或按成员的余额，也没有扣减或消费路径，只有发放。
- Remote 只能拉取：`snapshot` 与 `ledger` 仅在调用时回答、不发事件，因此别处完成的发放会在读取方下一次调用时才出现，而非立即出现。
- 团队状态是名册与会话列表在某一时刻的 join，且 `online` 表示可达而非空闲。
- 域句柄在服务 init 时打开，因此存储后端缺失或失败会让服务响亮失败，而不是提供空数据。
- 若在台账追加与余额设置之间崩溃，可能留下已记录但未计入余额的发放；持久台账是对账依据。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworkbench--workbench"></a>

### `ctx.workbench` — `Workbench`

The workbench Remote service: credits storage plus roster aggregation.

```ts cordis-catalog
/**
 * The Remote read: current credits balance beside the aggregated team.
 * @returns one snapshot over both halves.
 */
@Remote('snapshot') async remoteSnapshot(): Promise<WorkbenchSnapshot>

/**
 * Grant points: append one ledger entry, then replace the balance global.
 * Both writes queue on the domain's single chain, so concurrent grants
 * never interleave or lose an increment.
 * @param amount - positive integer points, at most `config.maxGrant`.
 * @param reason - non-empty trimmed reason, at most {@link MAX_REASON_LENGTH} characters.
 * @returns the new balance beside the appended entry.
 * @throws RemoteError `gateway/bad-request` when the amount or reason is invalid.
 */
@Remote('addCredits') async addCredits(amount: number, reason: string): Promise<WorkbenchCreditGrant>

/**
 * The Remote ledger read: the most recent grants, newest first. The page is
 * bounded because the ledger is append-only — a long-lived deployment
 * accumulates one row per grant.
 * @returns the recent entries, at most {@link LEDGER_READ_LIMIT}.
 */
@Remote('ledger') remoteLedger(): Promise<WorkbenchLedger>
```

Source: [`packages/workbench/workbench/src/index.ts`](../../packages/workbench/workbench/src/index.ts)
<!-- END GENERATED cordis-surface -->
