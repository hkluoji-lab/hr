# Agent Note: Workbench surfaces and the cross-plugin vocabulary seam

Status: implemented

[English](2026-09-11-workbench-host-and-session-tabs.md) | 中文

## Problem

工作台产品表面一次需要多个贡献：基于 Agent 预设名册的空白会话 hero 仪表盘；从侧栏增量进入的任务大厅、智能任务助手、AI 团队页与本月报告；瘦客户端无法自行派生的「宿主持有积分状态 + 名册在场聚合」；以及四个会话作用域右栏 tab——列出会话产出文件、子任务成员、本部署积分与团队在场状态。名册还新增四个成员预设，其名称与描述必须跟随客户端语言而非预设文件。产出文件 tab 还需要 `ui-deliverables` 按轮次拥有的精确「接受调用」词表，但客户端 feature 包之间不得 value import 彼此的 `./client` 入口：`dsh-client-bundle-purity` 拒绝这种跨包运行时边，而把该包声明进 `dsh.client.external` 又过不了 `verify-client-packages`（「import shared types only or call an injected Cordis service」）。

## Decision

工作台由一个宿主包加一个客户端包组成，二者只经生成的 Remote 与 Cordis 服务连接。

**宿主能力。** `@deepseek-ai/dsh-workbench`（`packages/workbench/workbench`）定义单调的 `workbench` 存储域 v1、per-record 布局：一个非负 `credits` global（`{ balance }`，初始余额是 Config 字段）加一张以随机 UUID 为键、只追加的 `entries` 台账。其 `Workbench` 服务在 wire 命名空间 `workbench` 下继承 `TypertRemoteService`，提供三个方法：`snapshot` 返回积分与聚合团队并置的快照；`ledger` 因台账只增而按最新在前返回有界（`LEDGER_READ_LIMIT`，50 行）的近期发放；`addCredits(amount, reason)` 把「1 到 `config.maxGrant` 的正整数」与「有界非空 reason」校验为 `gateway/bad-request`，然后在域的单写链上先追加台账行再替换余额 global。`team()` 把 `agentPresets.list()` 与活体会话折叠，规则与浏览器仪表盘完全相同——损坏预设为 `offline` 并排到末尾；非空白会话（经 `agentPreset` 与 `turnBoundary` projection 判定已开始 turn）正在运行某预设时该预设为 `busy`，否则为 `online`。域与聚合都在宿主侧；浏览器永不重算该连接。

**客户端表面。** `@deepseek-ai/dsh-client-ui-workbench` 占用既有扩展点，不拥有任何外壳代码。一个 `conversation.hero.dashboard` 列表条目渲染名册、快捷动作与积分 pill（后者经一次容忍 Remote 不可用的 `workbench.snapshot` 读取）。五个增量 `sidebar.footer.action` 列表条目——Workbench（hero）、任务大厅、智能任务助手、AI 团队、本月报告——占用既有侧栏底部，不替换其 workspace 或 settings 区域；hero 条目清除当前会话，另外四个各自切换一个页面。一个 `shell.overlay` 列表条目在全帧之上渲染当前页面；关闭态返回 null，因此 overlay 层保持点击穿透、没有页面拦截输入。大厅把会话列表折叠为任务行（跳过空白草稿与子任务成员，最新在前）并经 `sessions.open` 打开某行；助手收集任务描述与可选成员（未选则为默认团队），经与成员卡相同的 staged 预设流程发起该会话，并把描述作为其首条用户消息提交；团队页复用 hero 名册，并为某成员预设发起一个组合好的会话；报告统计本地自然月的任务与发放，并经 `workbench.addCredits` 发放新积分。四个 `sidebarRightTabs` 注册——交付物、进度、赏金额度与 AI 团队状态——各带一个 builtin tab definition 和 guide 入口，外加一个 session scope 的 keyed `sidebar.right.pane.tab` 正文，因此正文只在会话打开时存在。交付物按 revision 记忆会话事件窗口的折叠结果；进度不持有数据，从会话列表按 parent 选择 `origin: 'subagent'` 行并经 `sessions.open` 打开子会话；赏金额度与团队状态分别绑定控制器的台账与仪表盘快照，因此报告的是部署级余额、台账行与成员状态，而非会话状态。

**本地化名册文案。** 随包名册新增四个成员预设（`secretary`、`accountant`、`legal`、`audit`），各自以自身 persona 组合标准工具集。它们的显示名称与描述不读自 `preset.yml`：`agent-presets` 把每个内置 id 映射到 `BuiltInPresetCopyKey` 条目，由 `ui-agent-preset` 的两份字典提供跟随语言的文案，与既有内置预设完全一致，因此没有预设文件携带面向用户的文本。

**词表接缝。** `ui-deliverables` 发布 `producedPathsFromEvents(events)`——与每轮次相同的接受调用折叠（`write`、`edit`、有修改作用的 `str_replace_editor`；跳过读取、失败、格式错误调用与 transient 事件；按首次出现去重），用一张 call-id map 覆盖所有轮次——并以可选 `sessionDeliverables` 服务暴露到浏览器 Context 上，其 `produced(events)` 返回 `{ path, name }` 行。工作台交付物 tab 只 type-only import `ProducedFileEntry`，调用 `ctx.get('sessionDeliverables')?.produced(events)`；服务缺失是显式关闭态，渲染 tab 的空状态文案。这与 `chatFileMentions` 在 ui-deliverables 与 ui-chat 之间已有的可选服务模式相同；它刻意不注入，因此任一插件都可被独立组合掉。

**接线。** web-app patch 把 `@deepseek-ai/dsh-workbench` 挂为宿主行、把 `@deepseek-ai/dsh-client-ui-workbench` 挂为浏览器插件行；`api/remotes` 挂载该服务，使生成的 Typert 客户端暴露 `workbench.snapshot`、`workbench.ledger` 与 `workbench.addCredits`。包清单、workspace tsconfig references、module-graph 与 tsconfig-path catalog 均已重新生成。`@deepseek-ai/dsh-workbench/types` 还需要在 `tsconfig.base.json` 手写一条指向 `src/types.ts` 的别名：否则客户端工程会解析到构建产物 `./types` 入口，而 typert 分析器会把清单导出目标反查为源码路径，因找不到对应工程文件而使 `gen-cordis-inspect-catalog` 崩溃。

## Alternatives considered

**从 `ui-deliverables/client` value import 折叠函数。** 零重复，但在两个浏览器 feature 包之间制造运行时边；bundle purity 失败，且该边会冻结词表的 bundle 切分。两道门禁与包边界规则都拒绝它。

**把 ui-deliverables 声明到 `dsh.client.external`。** `verify-client-packages` 不允许客户端 feature 包请求运行时 external——只支持共享 type import 或注入的 Cordis 服务。type-only import 只给类型不给实现，而服务模式恰好只需要类型加注入。

**在 ui-workbench 内重新实现接受调用词表。** 能过门禁，但会分叉「哪些工具调用算产出文件」这一安全相关策略；新增修改工具时该 tab 会静默遗漏，两个表面随之漂移。可选 Cordis 服务保持唯一 owner。

**只在浏览器计算团队在场。** hero 本已在客户端做此折叠，宿主聚合看似多余；但积分持久化本来就需要宿主包，且其他表面（未来非浏览器客户端、报表）需要一个宿主答案，而不是各自重算预设/会话连接。浏览器保留其容忍离线的名册读取；宿主快照是积分 pill 背后的唯一聚合。

**给外壳加页面或路由区域。** 全帧工作台页面需要一个座位，而既有座位都不建模「页面」。槽位注册拒绝向 `root` 注册，让 `ui-layout` 认识页面区域则会把某个功能的导航写进外壳。既有的 `shell.overlay` 列表座位被文档化为此类全帧增量表面，因此工作台各页面都搭它，外壳不动。

## Consequences

代价是新增一个可选 Context 服务和一个宿主包：消费方必须把服务视为可能缺失，积分语义（只追加台账、有界发放）成为 v1 持久域而非客户端状态。收益是产出文件策略恰有一个 owner、没有客户端包 value import 兄弟包的浏览器入口、右栏贡献遵循其[公开两阶段注册](../feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md)而无需改外壳、且工作台 tab、hero、导航条目与页面都是普通槽位占用者，其他组合可以独立移除。这些页面是派生视图而非新模型：大厅里的任务就是已开始的会话，助手页是把一份描述交给一次会话发起的表单，团队页重读 hero 名册，报告是对已加载会话列表与有界台账页的本地自然月统计，而非持久化报表。会话 tab 同样是视图：交付物折叠只覆盖已加载的事件窗口，进度列出直属子任务成员而非 workflow-run 的 phase 树，赏金额度与团队状态报告的则是 hero 与报告页同源的部署级快照。名册文案没有引入新机制——四个成员预设复用「内置 id → 语言键」映射，因此部署只要改字典就能一次改变全部表面。

## Verification

宿主行为由 `packages/workbench/workbench` 测试钉住（域开关、发放校验、台账追加、有界且最新在前的台账页、busy/offline 聚合）。客户端行为由 ui-workbench 的 hero、导航、助手页、页面视图、store、tab 与插件注册规格、ui-deliverables 的会话折叠与服务生命周期规格、agent-presets 的随包名册规格以及 ui-agent-preset 的语言字典规格钉住；无密钥 recorded-session 套件在新增 keyed tab 占用者与 overlay 占用者后仍通过。`verify-client-packages`、`dsh-client-bundle-purity`、`verify-client-catalog`、`verify-client-ui-i18n`、两个 TypeScript 工程聚合、oxlint、包 README 门禁与 `hygiene` 全部通过；bundle 已重打、catalog 已重新生成。
