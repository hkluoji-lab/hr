# Agent Note: The six-role company roster

Status: implemented

[English](2026-09-26-six-role-company-roster.md) | 中文

## Problem

工作台曾以四个成员预设——`secretary`、`accountant`、`legal`、`audit`——作为公司名册：AI 团队侧栏分组、hero 栅格、团队页成员卡、智能任务助手的指派人选择器以及各角色的一键动作，说的都是这四个。而本部署自己的产品表面与其用户说的是六个：招聘、财务、法务、融资、行政、营销。两套词表在描述同一支团队，且四个中有两个与六个是重叠而非互补——`secretary` 做的日程与催办正是六个里的「行政」，`audit` 则是对法务工作的复核，而非与之平级的角色。

重复不止出现在源码，也出现在实际服务的页面上。门户把自己的分组导航和自己的右栏注入到工作台导航与其右栏旁边：一列里出现了两个菜单、命名同一批角色与任务，一帧里出现了两条右栏、重复同样的赏金积分、团队状态、任务进度与交付物面板。

这次改动不能只是改名。`web_login.json` 把每个成员与待处理邀请绑定到角色 id，而这些 id 由 `packages/host/web-login` 依 `ROLE_IDS` 校验；一旦清单不再包含某个 id，存储记录便不合法，服务拒绝启动（`DomainError: stored record ... does not match its schema`）。因此引入六角色必须迁移持久数据，而不只是改源码。

## Decision

一套词表，六个角色，按此顺序：`recruiting` 🧑💼、`finance` 💰、`legal` ⚖️、`financing` 📈、`admin` 📋、`marketing` 📣。

**预设是真实内置项，不是别名。** `packages/preset/agent-presets/presets/<id>/` 随包提供全部六个：一个 `preset.yml`（显示名、描述、`order` 5/6/8/9/10）加一个完整 `agent.cordis.yml`，以角色 persona 组合标准工具集。`secretary`、`accountant`、`audit` 是删除而非保留为弃用 id——留存的 `secretary` 会让「行政」在名册列表、预设注册表与 `BuiltInPresetCopyKey` 里继续有两个名字。

**角色词表由单个客户端模块拥有。** `packages/client/ui-workbench/src/client/roles.ts` 声明 `RoleId` 为闭集六元联合、`ROLES` 为展示顺序（emoji、`match` 词、描述键、四个标签键）、`ROLE_ACTIONS` 为每个角色提供的两个一键动作。侧栏的 AI 团队子项、成员卡、待办行、助手的协作控制器与仪表盘栅格都由这些声明派生。对 Clients 域尚未建模其工作的角色，`rolePending` 返回 `null`，成员卡据此不渲染待办行，而非渲染一个「0 项」。

**归并。** `secretary` → `admin`（日程、纪要、催办），`accountant` → `finance`，`audit` → `legal`（对法务工作的复核）；`legal` 保留原 id。

**持久绑定就地迁移。** `packages/host/web-login/src/spec.ts` 的 `ROLE_IDS` 变为六个，既有 `web_login.json` 的 `members.roles` 与 `invites.roles` 被重写：逐条映射旧 id、去重、按声明顺序排序，且先把原文件复制为带时间戳的 `.bak-roles6-*` 兄弟文件。这是每个部署执行一次的一次性迁移，而非加载期的兼容路径：若兜底仍接受 `secretary`，被校验的 schema 里就仍留着已退役的词表，正是本次要消除的漂移。

**布局跟随数量。** 仪表盘成员栅格从一排四个改为三个一行（`repeat(3, …)`、`max-width: 1040px`，≥1400px 时放宽到 `1160px`），让六张卡排成均衡的两行。

**门户层为工作台让位。** 托管门户（`apps/web/hr-portal/index.html`，由 `install.mjs` 合并进构建产物 `apps/web/dist/index.html`）探测所服务的文档里是否存在工作台自己的表面，一旦发现即退位：一个 `aria-label` 为「任务大厅」「智能任务助手」或「AI 团队」、且不在门户自身注入容器内的 `button`，会移除门户已构建的导航并隐藏门户右栏，只留下一条侧栏、一条右栏。工作台 hero——`[data-workbench-hero]` 区块，用语言文案与登录成员自己的姓名和角色渲染问候语、四个快捷卡、任务统计与成员卡——会移除门户注入的问候语、快捷区与演示计数，并撤销门户的贴底 hero 布局，只留下一份问候语与一套快捷动作，且落在 hero 自己的布局里。不带工作台的构建则保留门户的全部表面。探测读的是实际服务的 DOM 而非构建标志，因为门户模板会被合并到它所安装的那个构建之上。

## Alternatives considered

**保留四个预设再补两个。** 名册会同时出现 `secretary` 与 `admin` 两个名字指同一件事，且每个六角色的产品表面都要长期维护一张四到六的换算表。已拒绝：这正是要消除的重复。

**只改源码里的 id。** 只改 `ROLE_IDS`、预设目录与语言键而不动存储，会让每个既有部署在有人手工改过 `web_login.json` 之前都启不来。已拒绝，改为用脚本有意识地做这次编辑并保留备份。

**把退役 id 留在 `ROLE_IDS` 里，或在加载期映射。** schema 会继续校验一套任何表面都不展示的词表，而下一次角色变更会在积累更多历史 id 的情况下再面对同一个问题。已拒绝。

**删掉工作台的导航、保留门户的。** 工作台的导航条目是注册进主导航座位的插件贡献，也正是它们打开任务大厅、助手与团队页；删掉它们等于连页面一起去掉。已拒绝。

**用模板或 `install.mjs` 里的构建标志来判定门户是否退位。** 该标志需要与实际服务的文档分开维护，两者可能不一致。已拒绝，改用 DOM 探测，它观察的正是自己所在的那个构建。

## Consequences

现在预设文件、语言字典、侧栏、hero、团队页、助手与持久绑定里，一件事只有一个名字；改一个角色的名字只需改字典加 `preset.yml`，一次即覆盖所有表面。

代价是明确的。每个部署的 `web_login.json` 都必须在服务启动前执行迁移，且该变更不向后兼容：读迁移后文件的旧构建会遇到它不认识的 role id。`rolePending` 返回 `null` 意味着招聘、融资、营销在 Clients 域建模其工作之前不显示待办行，而它们的卡片与一键动作照常存在。门户侧，退位是对实际服务 DOM 的运行时探测，因此不带工作台的构建仍可达门户自身的表面，而两套导航、两份问候语与两套快捷动作都不可能同时可见。退位逻辑跑在重复施加门户注入的观察器里，因此晚于门户首轮注入才挂载的 hero 同样会让门户的副本退位。

## Verification

`packages/preset/agent-presets/tests` 钉住随包根目录即这六个预设及其顺序与跟随语言的文案；`packages/client/ui-agent-preset/tests` 钉住两份字典；`packages/host/web-login/tests` 钉住 `ROLE_IDS` 的接受；ui-workbench 规格钉住六角色栅格、导航子项、成员卡、助手控制器与 store 辅助函数；`apps/cli/tests/web-agent-presets.e2e.ts` 覆盖被服务的预设列表。本地部署上，迁移对 `web_login.json` 执行完毕，`pnpm run build` 重打了客户端 bundle，`node apps/web/hr-portal/install.mjs` 重新合并门户，并在浏览器中逐项断言被服务的页面：没有注入的门户导航、一条右栏、六个侧栏角色子项、六张渲染出的 `[data-role]` 卡片、没有注入的门户问候语与快捷区，且每个快捷动作恰好一个按钮。