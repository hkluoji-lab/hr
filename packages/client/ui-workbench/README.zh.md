---
description: "Web 工作台各表面：空白会话 hero 仪表盘（问候、快捷动作、积分、Agent 预设团队名册）、打开全帧页面的五个侧栏导航入口（任务大厅、智能任务助手、活跃任务、AI 团队、项目），以及右栏中会话作用域的交付物、子任务进度、赏金额度与 AI 团队状态 tab；供工作台各表面的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

[English](README.md) | 中文

## 概述

本包渲染 Web GUI 上的工作台：空白会话 hero 仪表盘（问候语、在线团队副标题、四个快捷动作、Agent 预设团队成员卡），以及产品主导航——五个 `sidebar.nav` 入口：任务大厅、智能任务助手、活跃任务、AI 团队、项目。名册数据来自一次 `agentPresets.list` Remote 读取（工作中、在线、离线），成员卡把其预设 staged 到新会话。四个入口在 `shell.overlay` 中打开全帧页面——跨会话任务行、描述表单、运行中任务过滤、团队网格——项目则展开工作区浏览器。会话作用域的右栏 tab 提供交付物、进度、赏金额度与 AI 团队状态。

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

与运行时一起挂载本插件；没有当前会话时，hero 会在标题区与工作区行之间显示仪表盘。「新建任务」以部署默认组合开启新会话，「查看项目」展开侧栏的工作区浏览器，每张团队成员卡则以该成员的预设组合开启会话。损坏的预设渲染为离线且不可点击。宿主 workbench 服务存在时，副标题显示积分余额。

侧栏主导航在新会话按钮正下方新增五个入口，不替换任何侧栏区域；宽栏下渲染为带文字的行，rail 折叠态下渲染为 36px 带 Tooltip 的控件。**任务大厅**列出全部已启动会话——标题、运行它的预设、生命周期与最近更新时间——点击行即选中该会话。**智能任务助手**是任务描述表单：写下任务、可选地指派公司的角色成员之一（或留给默认团队），提交后开启该会话并把描述作为它的首条用户消息。**活跃任务**是只保留运行中会话的大厅。**AI 团队**以页面尺度渲染公司角色名册——与 hero 团队区相同的卡片，模式等非角色预设不会出现在公司团队中——点击卡片以该成员的预设开启会话；其导航条目还会在原位展开四个角色组——AI 秘书、AI 会计、AI 法务、AI 审计——每个角色组列出该角色的能力子项（AI-客服、AI-合同……），点击子项即打开团队页。**项目**展开工作区浏览器。前四项打开覆盖应用整帧的页面，再次点击当前项（或页面的关闭控件，或 Escape）即关闭。**本月报告**从 hero 的快捷动作打开，并列展示本自然月的任务统计、积分余额、发放表单与最近明细。

hero 上的「调用 AI 团队」与「本月报告」会打开同样的团队页与报告页。

会话打开时，右栏会新增四个 builtin 页面型 tab，四者同时出现在 guide 页。**交付物**列出本会话成功的 `write`、`edit` 与变更类 `str_replace_editor` 调用产出的全部文件，按首次出现顺序去重；点击行通过 Sidebar 的资源地址打开文件。**进度**按会话存储顺序列出本会话的子任务成员，带「进行中/已结束」状态点；点击行打开对应子会话。**赏金额度**展示本部署的积分余额与近期发放明细。**AI 团队状态**统计公司角色成员的在线、工作中与离线数量，再逐个列出角色成员及其状态点。无可展示内容的 tab 只渲染一条空状态、读取中或读取失败的提示。

### 空部署

没有组合任何预设的部署（或未运行 agent-presets 服务）仍会显示问候、快捷动作与任务大厅；团队区渲染一条指向「设置 → 技能与预设」的空状态提示，而不是卡片网格，智能任务助手则提示将由默认团队执行该任务。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

单个 `WorkbenchController` 支撑全部表面，因此导航入口与 hero 快捷方式驱动同一份页面状态。它持有三个快照 store：团队/积分仪表盘、当前打开页面的 id、积分明细。`load()` 发一次 `agentPresets.list`（与其他预设表面一样把 `gateway/invocation-unavailable` 视为空名册），折叠会话列表把有非空白会话的预设标记为「工作中」，损坏预设排到末尾作为「离线」。`startWithPreset(id)` 复刻 hero 预设芯片：先 stage id，调用 `uiWorkspace.startSession()`，下一次会话列表变化时对新的空白会话应用 `agentPresets.select`——宿主拒绝为非空白会话换组合。`assignTask(presetId, brief)` 走同一次开启流程，并在绑定出现后把描述作为该会话的首条用户消息提交。

hero 向 `conversation.hero.dashboard` 列表槽位（由 ui-conversation 声明，scope 为 `root`）贡献一个条目。五个条目占用 `sidebar.nav` 列表槽位（由 ui-sidebar 声明，scope 为 `root`），因此无需改动侧栏外壳代码：`navActionFace(controller, target)` 把页面目标绑为 `controller.togglePage` 并从打开页面 store 派生活动态，把项目绑为 `controller.viewProjects()`，即展开侧栏工作区浏览器，并把 `openTeam` 绑为 `controller.openPage('team')` 供团队条目的能力子项使用。团队条目内联渲染 `ROLES` 角色组；展开状态是该行的组件本地状态（分组与全部角色默认展开），子项永远不会变成槽位条目。页面表面是 `shell.overlay` 列表槽位（由 ui-layout 声明，scope 为 `root`）中的一个条目；`WorkbenchShell` 在没有页面打开时渲染 null，保持 overlay 层可点击穿透，并分发到大厅、助手、活跃任务、团队或报告页。大厅折叠会话列表（跳过空白与子任务会话），其 hook 按列表快照缓存，使 `useSyncExternalStore` 始终看到稳定引用。

报告页通过宿主 workbench 的 `ledger` Remote 读取有界明细，通过 `addCredits` 发放，并以宿主自身的返回刷新余额与明细。`monthReport` 用同一批大厅行与明细条目统计本地自然月。

另外四个贡献走 ui-sidebar-right 的公开两阶段路径：先各注册一个 `SidebarRightTabDefinition`（builtin 优先级、带 guide 入口），再把正文注册进 keyed 的 `sidebar.right.pane.tab` 槽位（scope 为 `session`，因此正文只在会话打开时存在）。交付物 face 按窗口 revision 记忆会话事件窗口的折叠结果，折叠通过 ui-deliverables 的可选 `sessionDeliverables` Cordis 服务完成——不做跨插件 value import；该插件被组合掉时 tab 渲染空状态。行点击通过 tab 的 `openResource` 发出，使用与 Files tab 相同的会话文件地址（`dsh-util-workspace-path`）。进度 face 不持有数据：一个基于标准会话列表 store 的选择器按 `parentId` 过滤 `origin: 'subagent'` 行，点击调用 `sessions.open(childId)`。赏金额度 face 与团队状态 face 分别绑定控制器的明细与仪表盘快照——两者都是部署级数据，因此展示的余额、明细、名册与成员状态与 hero、报告页完全一致。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当仪表盘不够用时阅读以下页面。

- [ui-agent-preset](../ui-agent-preset/README.zh.md)——共享同一名册的预设管理设置区与 hero 预设芯片。
- [ui-workspace](../ui-workspace/README.zh.md)——快捷动作所驱动的 Workspace 导航服务（`startSession`）。
- [ui-conversation](../ui-conversation/README.zh.md)——声明本包占用的 `conversation.hero.dashboard` 槽位。
- [ui-sidebar](../ui-sidebar/README.zh.md)——声明主导航入口占用的 `sidebar.nav` 列表槽位。
- [ui-layout](../ui-layout/README.zh.md)——声明全帧页面占用的 `shell.overlay` 列表槽位。
- [ui-sidebar-right](../ui-sidebar-right/README.zh.md)——拥有 tab 注册表与四个 tab 占用的 keyed `sidebar.right.pane.tab` 槽位。
- [ui-deliverables](../ui-deliverables/README.zh.md)——拥有产出文件词表，交付物 tab 通过其 `sessionDeliverables` 服务调用。
- [Web 客户端架构](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——浏览器插件行如何加载并注册槽位。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包基于宿主名册、会话与积分状态渲染面向人类的表面，不触及 prompt、消息、schema、流或工具结果。

#### KV Cache 影响

无；本包从不组装或发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了当前各表面。它们是当前包约束，不是路线图对比。

- **团队状态是在场状态，不是真实工作量**——「工作中」只表示有非空白会话携带该预设；没有运行级任务计数，且进度 tab 列出的是直属子任务成员，不是 workflow-run 的 phase 树。
- **大厅是会话列表，不是任务模型**——行是由会话列表折叠出的已启动会话；没有宿主侧任务实体、指派或队列。
- **智能任务助手每个描述只开会话一次**——描述成为该会话的首条用户消息，页面不保留草稿、历史或队列。
- **本月报告只读有界明细**——超出宿主读取上限的发放不会计入，且统计仅覆盖本地自然月。
- **tab 是会话视图，不是跨会话报表**——交付物只折叠当前打开会话已加载的事件窗口（窗口内去重），且四个 tab 都只在选中会话时挂载。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。本包只是既有 agent-presets 与 workbench Remote（含积分发放写入）、会话列表及 Workspace 导航服务之上的「只读 + 动作」UI；不发出 Cordis 事件，除自身视图快照外不持有跨插件可变状态。

