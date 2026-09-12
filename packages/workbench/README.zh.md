---
description: "workbench 包组地图：Web GUI 工作台的 host 半区，供读者选择或导航该组。"
kind: "package-group"
---

# workbench/ — host 侧 Web GUI 工作台

[English](README.md) | 中文

## 概述

workbench 组拥有 Web GUI 工作台的 host 半区：一个持久化的积分余额加一张只追加的发放台账，以及一个由 Agent 预设名册与活体会话折叠出的 AI 团队状态读模型。唯一的包把两者都放在 `workbench` Typert Remote 命名空间下提供，让浏览器 surface 共享同一个由 host 拥有的答案，而不是各自重新派生积分与在场状态。它在存储域形式上打开 `workbench` 域；浏览器半区位于 client 组。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx key |
|---|---|---|
| [`workbench/`](workbench/README.zh.md) | host 工作台能力：持久化积分域、经校验的发放路径，以及名册×活体会话的团队状态 Remote | `ctx.workbench` |

-----

<a id="related-documentation"></a>
## 相关文档

- [存储子系统](../../docs/subsystems/storage.zh.md)——积分域打开所依托的域形式，含其 `per-record` 布局。
- [preset 组地图](../preset/README.zh.md)——团队折叠读取的 Agent 预设名册。
- [浏览器工作台 UI](../client/ui-workbench/README.zh.md)——渲染两个 Remote 答案的浏览器半区。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
