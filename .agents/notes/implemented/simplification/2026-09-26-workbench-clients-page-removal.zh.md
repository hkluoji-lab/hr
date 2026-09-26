# Agent Note: 客户与申报页离开工作台

Status: implemented

[English](2026-09-26-workbench-clients-page-removal.md) | 中文

## Problem

[客户主档与申报台账 Agent Note](../feature/2026-09-12-workbench-clients-filings.zh.md) 上线了第七个侧栏入口——客户与申报——打开秘书公司 SOP 的页面：客户主档、法定申报义务台账、本年合规排期、文件签转台账与催办中心，各自带登记、编辑与推进动作。

它的内容有两处归属。AI 团队页已经通过 `rolePending` 把同一批宿主数据折叠为每张角色卡的待办行——行政的 open 催办队列、财务的 open 义务、法务的临期义务——因此侧栏里七个岗位分组与下方六个任务入口把同一份工作命名了两次，部署的使用者要求删掉客户页的入口。

该页的数据并不只属于该页。`TeamPage` 读取 `ClientsState` 并在其上调用 `rolePending`，因此领域、Remote 与那次六连读取必须比最初催生它们的表面活得更久。

## Decision

**表面删除，数据读取保留。** 删除：`sidebar.nav` 的 `workbench-clients` 条目及其 `clients` 目标、`WorkbenchPageId` 的 `'clients'` 成员、`TITLES`/`SUBTITLES`/`NAV_TARGETS` 中的对应项、约 950 行的 `ClientsPage` 组件、两份字典块（`nav.clients` 与全部 `clients.*` 键，中英各一）、九个写方法（`addClient`、`removeClient`、`addObligation`、`markObligation`、`removeObligation`、`addDelivery`、`markDelivery`、`removeDelivery`、`recordFollowUp`）、`setReportMonth`、`MutationOutcome` 类型、`WorkbenchPages.module.css` 中仅供客户页使用的规则，以及 `client/index.ts` 里 `shellInjected` 的写入面。

保留：`ClientsState`、`CLIENTS_INITIAL`、`rolePending`、控制器把六次读取写入 `clients` 快照的 `loadClients()`，以及 shell face 的 `clients`/`loadClients` 绑定。`WorkbenchShell` 现在只在团队页打开时触发该读取，因为那是它唯一的消费者。

**删除模块，而不是隐藏它。** 入口已从 `NAV_TARGETS` 移除，任何配置都无法把该页带回来；想要客户记账的部署直接写宿主 Remote，或重新交付该表面。

**文案与 CSS 随表面一并离开。** 两份字典都删掉客户块；`WorkbenchPages.module.css` 删掉只有 `ClientsPage` 使用的排期、主档、台账、签转、催办与报告控件规则。其他页面共享的类（`.section`、`.sectionTitle`、`.ledgerList`、`.field`、`.formError` 等）保留。

## Alternatives considered

**连同该页一起删除宿主领域、其 Remote 与 `loadClients()`。** 看起来是最干净的删除，且会连根去掉 workbench 领域的客户、义务、签转与提醒表。被否决：这六次读取正是每张 AI 团队角色卡待办行所折叠的数据，删除它等于同时删掉按角色的待办汇总——那是需求没有提到的第二个功能。

**用配置开关或隐藏路由保留该页。** 部署可变的入口需要新增一个经校验的 `Config` 字段，而页面的组件、文案与 CSS 无论如何都会随包发布。被否决：不需要的表面应当删除而不是加闸——开关只会让死代码存活，并招来同一个需求第二次。

**把主档的编辑表单搬到 AI 团队页。** 被否决：角色卡是「开始工作」的摘要，把它改成 CRUD 表面是没人要求的重新设计；名册需要的是待办行这一层摘要。

**改个标题、保留页面。** 抱怨指向入口与其背后的工作，而不是它的叫法。被否决。

## Consequences

侧栏为六个入口——任务大厅、智能任务助手、活跃任务、AI 团队、项目，以及 owner 的成员管理——而领域仍在存储的客户记账数据只被读取一次，由团队页作为角色待办行的输入。现在没有任何表面可以登记客户、义务或签转，标记申报完成，或登记催办；这些写入的宿主 Remote 仍然对外提供服务，只是没有浏览器消费者。

页面与其写方法删除后 `MutationOutcome` 已无消费者，因此该类型被删除，而不是为将来某个表面留着。

## Verification

`pnpm run typecheck` 覆盖客户端程序；ui-workbench 各 spec 固定了六个侧栏入口、shell 打开团队页时的客户读取、`rolePending` 的折叠，以及页面切换用例中客户页的移除（158 个测试）。部署后在浏览器中核对：`pnpm run build`、`node apps/web/hr-portal/install.mjs` 与重启 `dsh-web.service` 之后，侧栏列出六个入口且不含「客户与申报」，各任务页照常打开，AI 团队卡仍带各自的待办行。