---
description: "面向客户端与维护者的 host 工作台能力说明：持久化积分台账与名册×活体会话团队状态 Remote。"
kind: "package-reference"
---

# @deepseek-ai/dsh-workbench

[English](README.md) | 中文

## 概述

本包是 Web GUI 工作台的 host 半区。它在 `workbench` 存储域中持久化积分余额与只追加的发放台账，并提供 `workbench` Typert Remote 命名空间：`snapshot` 返回余额与一个由 Agent 预设名册和活体会话列表折叠出的 AI 团队读模型；`ledger` 按最新在前返回最近的发放；`addCredits` 追加一条经校验的发放并推进余额。当浏览器 surface 需要一个由 host 统一拥有的积分与团队状态答案时，把它挂在存储域、Agent 预设与会话存储旁。

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
| `snapshot()` | `{ credits: { balance }, team: { online, busy, offline, members } }` |
| `ledger()` | `{ entries: [{ id, amount, reason, at }] }`，最新在前，最多 `LEDGER_READ_LIMIT`（50）行 |
| `addCredits(amount, reason)` | 追加一条台账行并设置新余额后返回 `{ balance, entry }` |

发放只接受不超过 `maxGrant` 的正整数金额，以及长度 1–200 的去空白理由；其他输入以 `gateway/bad-request` 拒绝，两个存储都不变。台账页有界，因为台账只追加，每次发放都会累积一行。团队行镜像浏览器仪表盘的派生：某预设在有一个已开始（非 blank）会话投影到它时为 `busy`，发现报告损坏时为 `offline`，否则为 `online`；损坏行排在最后，`online` 把 busy 成员计为可达。

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
| [`src/index.ts`](src/index.ts) | `Workbench` Remote 服务：init/打开/关闭、`snapshot`、`ledger`、`addCredits`、团队折叠 |
| [`src/spec.ts`](src/spec.ts) | `workbench` 域 spec、持久化记录 schema 与发放长度限制 |
| [`src/types.ts`](src/types.ts) | 客户端安全的快照、台账、成员与发放类型 |

### 持久化

域带版本（`name: 'workbench'`，version 1），per-record 布局：一个全局记录 `{ balance }` 和一个以随机 UUID 为键的 `entries` 表，每行 `{ amount, reason, at }`。发放先 put 台账行，再替换全局记录；两次写入都排在域的链上，因此并发发放不会交错或丢失增量。

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

无。

</details>

**运行时不变式：** 不发布伴生入口。本服务只是对其他 surface 已拥有并运行时检查的关系做一次 join：存储域按 spec schema 校验全局与条目记录，预设目录拥有包括 `broken` 在内的名册健康，会话投影 surface 拥有 busy 折叠读取的 `agentPreset` 与 `turnBoundary` 值。
