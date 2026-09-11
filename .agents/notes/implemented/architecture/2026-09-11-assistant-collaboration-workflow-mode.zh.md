# Agent Note: 助手协作模式由模型编写的 workflow 承载

Status: implemented

[English](2026-09-11-assistant-collaboration-workflow-mode.md) | 中文

## Problem

公司团队的设计隐含自动跨角色编排——秘书接单、派发会计/法务/审计并汇总结果。产品此前没有任何机制做到这一点：跨角色工作意味着用户逐个预设手动开会话，或靠会话内模型自行决定委派。任务助手的一条简报只能启动一个预设。

## Decision

协作模式是客户端首消息模板，而不是新的编排机器。助手页新增一个开关；开启后页面隐藏成员选择器，从角色名册解析出 AI 秘书的预设，并经既有 `assignTask` 路径提交简报，消息前拼上一份 locale 字典模板。模板指示秘书经 `tool-workflow` 编写一个 workflow 脚本——一次分诊 `agent()` 把简报拆成三份工作说明，`parallel()` 并行三个 `agent()`（会计/法务/审计，prompt 以分诊产出开头并附角色指令），一个审计复核 `agent()` 复核三份结果，最后 `return` JSON 汇总。

角色指令写进 prompt 文本而非 persona 选项：workflow 运行时的 `agent()` 只接受 `label/phase/schema/provider/model`，未知键直接拒绝——注入 persona 意味着把 subagent 的 persona capability 打通到 worker 协议。鉴于四个角色预设除人设前缀外组合完全相同，prompt 承载指令即可交付同样行为。`label` 让右栏进度 tab 保持可读；秘书预设本就挂载 `workflow-worker-thread` + `tool-workflow`，因此零预设与引擎改动。

## Alternatives considered

**给 workflow `agent()` 加 persona 选项。** subagent 服务确有 persona capability，但 workflow 引擎从不传递它：worker 宿主启动子代理只传 prompt/parent/signal/outputSchema/provider/model。打通它要动 worker 运行时、宿主与 provider 契约——为部署层需求改引擎，否决，保持 harness 核心不动。

**新建独立编排预设。** 第五个编排人设预设会复制现有四个组合，模板文本仍需另行投递。秘书预设本就承担「接简报、派工作」，模式搭在它上面。

**宿主侧多会话编排。** workbench 宿主可以为每个预设开会话并轮询投影串联——真正的 per-role 会话，但要新增存储域、等待/取消机制与更多 UI。本轮否决；workflow 运行让所有角色留在同一个可追溯会话内。

## Consequences

子代理人格来自 prompt 文本，子代理若无视指令没有 persona 兜底。进度 tab 按 label 展示 workflow 子代理，workflow 的 JSON 汇总作为工具结果落入会话。模板是 locale 字典文案，编辑时两种语言必须保持行为一致。
