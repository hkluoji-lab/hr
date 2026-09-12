---
description: "面向客户端与维护者的 host 工作台能力说明：持久化积分台账、客户主档与法定申报义务台账、年度排期、文件签转催办阶梯、催办中心、名册×活体会话团队状态 Remote。"
kind: "package-reference"
---

# @deepseek-ai/dsh-workbench

[English](README.md) | 中文

## 概述

本包是 Web GUI 工作台的 host 半区。它在同一个 `workbench` 存储域中持久化积分发放台账、秘书公司客户主档、法定申报义务台账与文件签转台账，并提供 `workbench` Typert Remote 命名空间：`snapshot` 由预设名册与活体会话折叠出 AI 团队读模型，`ledger`/`addCredits` 维护发放，`clients`/`obligations`/`complianceSchedule` 回答客户主档、其申报与本年排期，`deliveries`/`addDelivery`/`markDelivery`/`removeDelivery` 维护签转催办队列，`followUps`/`recordFollowUp` 折叠催办队列并登记提醒。把它挂在存储域、Agent 预设与会话存储旁。

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

在存储后端、storage-domain 服务、Agent 预设与会话存储之后挂载本插件。出厂 web-app bundle 组合的正是这一行；storage-domain 后端（出厂组合为 json）必须已经打开。

### 组合

```yaml
- name: '@deepseek-ai/dsh-storage-json'
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- name: '@deepseek-ai/dsh-agent-presets'
- name: '@deepseek-ai/dsh-workbench'
  config:
    startingBalance: 0
    maxGrant: 100000
```

### 配置

| 字段 | 含义 |
|---|---|
| `startingBalance` | 非负整数，全新介质在首次发放前提供的余额；已有介质保留其持久化余额 |
| `maxGrant` | 正整数，单次发放上限，每次调用都校验 |

### Remote 面

`workbench` 命名空间通过 `@deepseek-ai/dsh-api-remotes` 在浏览器侧挂载。

| 方法 | 返回 |
|---|---|
| `snapshot()` | `{ credits: { balance }, team: { online, busy, offline, members }, user? }`——`user` 是问候语面向的身份：存在 Web 登录时为登录显示名，否则为宿主 OS 账户 |
| `ledger()` | `{ entries: [{ id, amount, reason, at }] }`，最新在前，最多 `LEDGER_READ_LIMIT`（50）行 |
| `addCredits(amount, reason)` | 追加一条台账行并设置新余额后返回 `{ balance, entry }` |
| `clients()` | `{ clients: [{ id, nameCn, nameEn?, brNo?, crNo?, incorporationDate, registeredAddress?, contactEmail?, contactWechat?, contactWhatsapp?, complianceStatus, openObligations, createdAt }] }`，保持创建顺序 |
| `addClient(payload)` | 存入一行主档后返回 `{ client }`；id 为 `C-<年份>-<序号>`，序号越过该年已存的全部 id |
| `removeClient(id)` | 删除该客户行及其记录的全部申报义务 |
| `obligations()` | `{ obligations: [{ id, clientId, clientNameCn, kind, periodLabel, dueDate, status, createdAt, daysUntilDue, dueTier }] }`，open 行在前，各组内按截止日期最早在前 |
| `addObligation(payload)` | 存入一行（随机 UUID 为键）后返回 `{ obligation }`；客户必须存在 |
| `markObligation(id, status)` | 在 `open` 与 `submitted` 之间移动一行——即 SOP 中客户提交后的收尾步骤 |
| `removeObligation(id)` | 删除一行义务 |
| `complianceSchedule()` | `{ year, rows: [{ clientId, clientNameCn, kind, periodLabel, dueDate, status, source, daysUntilDue, dueTier }] }`——本年申报日历，按截止日期最早在前 |
| `deliveries()` | `{ deliveries: [{ id, clientId, clientNameCn, title, channel, status, createdAt, daysSinceSent, followUpTier }] }`，open 行在前，各组内按发出时间最早在前 |
| `addDelivery(payload)` | 以随机 UUID 为键存入一行后返回 `{ delivery }`；行以 `sent` 打开，发出时间即现在；客户必须存在 |
| `markDelivery(id, status)` | 沿 `sent` → `viewed` → `signed` → `returned` 推进一行——即 SOP 中的查看、签署与回收归档步骤 |
| `removeDelivery(id)` | 删除一行签转记录 |
| `followUps()` | `{ followUps: [{ id, targetKind, targetId, clientId, clientNameCn, title, tier, suggestedChannel, dueDate?, days, message, reminderCount, lastReminderAt? }] }`——进入催办档位的 open 签转行与进入提醒档位的 open 义务行折叠为一个队列，最紧急档位在前 |
| `recordFollowUp(payload)` | 以随机 UUID 为键存入一行提醒后返回 `{ reminder }`；目标必须存在且未关闭，其档位依据当天日期重新派生 |

发放只接受不超过 `maxGrant` 的正整数金额，以及长度 1–200 的去空白理由；其他输入以 `gateway/bad-request` 拒绝，两个存储都不变。台账页有界，因为台账只追加，每次发放都会累积一行。团队行镜像浏览器仪表盘的派生：某预设在有一个已开始（非 blank）会话投影到它时为 `busy`，发现报告损坏时为 `offline`，否则为 `online`；损坏行排在最后，`online` 把 busy 成员计为可达。

客户与义务写入走同一条 wire 校验：`nameCn`、`incorporationDate`（`YYYY-MM-DD`）、`kind`（`NAR1`/`AB56`/`PTR`/`ITR`）、`periodLabel` 与 `dueDate` 必填，可选字段非空才入库，未知客户 id 以 `workbench/client-not-found` 拒绝；未知义务 id 以 `workbench/obligation-not-found` 拒绝。`daysUntilDue` 与 `dueTier` 依据当天 UTC 日期派生，`dueTier` 划出 UI 渲染的催办阶梯：`ok`（30 天内未到期）、`d30`、`d15`、`d7`、`d1`，再到 `overdue`。`complianceSchedule` 把本年到期的已登记义务视为权威，并为成立周年日落在本年的客户追加一行推算 NAR1（`source: 'derived'`）——周年日后 `NAR1_FILING_WINDOW_DAYS`（31）天到期——除非该年已登记过 NAR1 义务，因此已登记与推算行不会重复提醒。

签转写入走同一条校验：`clientId` 与 `title`（1–`MAX_DELIVERY_TITLE_LENGTH`（120）字符）必填，`channel` 缺省为 `email`（`email`/`wechat`/`whatsapp`），未知客户 id 以 `workbench/client-not-found` 拒绝；未知签转 id 以 `workbench/delivery-not-found` 拒绝。`daysSinceSent` 按发出日期（UTC）计整天数，`followUpTier` 划出催办工作流依据的阶梯：第一级之前为 `fresh`，未查看自 `DELIVERY_NUDGE_DAYS`（3）起为 `nudge`，未签署自 `DELIVERY_CHASE_DAYS`（7）起为 `chase`，自 `DELIVERY_ESCALATE_DAYS`（14）起为 `escalate`，行关闭（`signed`/`returned`）后为 `done`。

催办登记走同一条校验：`targetKind`（`delivery`/`obligation`）选择台账，目标必须存在（`workbench/delivery-not-found` / `workbench/obligation-not-found`）且未关闭（`workbench/follow-up-not-open`），尚未进入阶梯的目标以 `gateway/bad-request` 拒绝。档位依据当天日期重新派生，使存储的记录保持真实。`channel` 缺省为该档位的建议渠道（`nudge` → `whatsapp`，`chase` → `wechat`，`escalate`/`d30`/`d15`/`overdue` → `email`，`d7`/`d1` → `whatsapp`），`message` 缺省为该档位的 host 话术稿；两者都接受秘书改写，`message` 最长 `MAX_REMINDER_MESSAGE_LENGTH`（500）字符。

### 失败与恢复

打开域是服务 init 的一部分，因此后端缺失或失败会让服务响亮失败，而非提供空数据。域句柄在服务 fiber dispose 时关闭。余额与台账是 per-record json 文件，重启后两者原样重开；若在台账追加与余额设置之间崩溃，可能留下已记录但未计入余额的发放，由运维依据台账对账。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释 Remote 答案背后的存储与折叠；可观察行为已在[使用本包](#use-this-package)中完整说明。

### 设计理念

两个原本会在各 surface 重复的 join 变成一个 host 答案。积分需要耐久、串行化的写入，存储域的单链正好提供。团队状态需要预设目录（`agentPresets.list`）借由 `agentPreset` 与 `turnBoundary` 投影与活体会话 join；放在 host 可让 busy 规则（没有已开始轮次的会话是 blank，不计工作，与 select 锁一致）只存一处，而不是在每个客户端重新派生。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `Workbench` Remote 服务：init/打开/关闭、`snapshot`、`ledger`、`addCredits`、客户主档与义务台账及其排期折叠、签转台账及其催办折叠、跨两条阶梯的催办中心、团队折叠 |
| [`src/spec.ts`](src/spec.ts) | `workbench` 域 spec、持久化记录 schema、发放长度限制与到期日计算 |
| [`src/types.ts`](src/types.ts) | 客户端安全的快照、台账、成员、发放、客户、义务、排期、签转与催办类型 |

### 持久化

域带版本（`name: 'workbench'`，version 1），per-record 布局：一个全局记录 `{ balance }`；一个以随机 UUID 为键的 `entries` 表，每行 `{ amount, reason, at }`；一个以 `C-<年份>-<序号>` 主档 id 为键的 `clients` 表，每行为客户字段加 `createdAt` 与 `complianceStatus`；一个以随机 UUID 为键的 `obligations` 表，每行为申报字段加 `status` 与 `createdAt`；一个以随机 UUID 为键的 `deliveries` 表，每行为签转字段加 `createdAt`；一个以随机 UUID 为键的 `reminders` 表，每行 `{ targetKind, targetId, tier, channel, message, createdAt }`。介质缺少后加的表时按空表读取，旧介质加载不变。发放先 put 台账行，再替换全局记录；两次写入都排在域的链上，因此并发发放不会交错或丢失增量。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当服务约定不够用时阅读以下页面。

- [存储域包](../../storage/storage-domain/README.zh.md)——`open(spec)` seam、global/table API 与 per-record 布局。
- [Agent 预设包](../../preset/agent-presets/README.zh.md)——本包折叠的名册字段，含 `broken`。
- [浏览器工作台 UI](../../client/ui-workbench/README.zh.md)——渲染该快照的 hero 仪表盘。

-----

<a id="model-experience"></a>
## 模型体验

无。该 Remote 读取预设目录和已记录的会话投影，并持久化一个记账整数；它不组装任何 prompt 段、工具或提供方请求。

#### KV Cache 影响

无；本包从不组装或发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明服务回答什么。它们是当前包约束。

- **只有一个全局余额**——积分是部署级的；没有按用户、按会话或按成员的余额，也没有扣减或消费路径，只有发放。
- **Remote 只能拉取**——`snapshot` 仅在调用时回答，不发事件；客户端在自己执行动作后重读，看不到别处完成的发放，直到下一次读取。
- **出厂组合使用 json 介质**——耐久性与单写者行为与 storage-domain json 后端一致；更换后端是部署组合选择，不是包选项。
- **团队状态是时间点结果**——折叠在调用时把名册与会话列表 join，`online` 表示可达（busy 成员计入其中），而非空闲。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

客户主档、申报台账与本年排期折叠记录在[客户主档与申报台账 Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-workbench-clients-filings.zh.md)。签转台账与催办阶梯记录在[文件签转与催办 Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-workbench-deliveries-followup.zh.md)。跨两条阶梯的催办中心记录在[催办中心 Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-workbench-follow-up-center.zh.md)。

</details>

**运行时不变式：** 不发布伴生入口。本服务只是对其他 surface 已拥有并运行时检查的关系做一次 join：存储域按 spec schema 校验全局与条目记录，预设目录拥有包括 `broken` 在内的名册健康，会话投影 surface 拥有 busy 折叠读取的 `agentPreset` 与 `turnBoundary` 值。
