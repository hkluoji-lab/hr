# Agent Note：工作台客户主档与法定申报台账

Status: implemented

[English](2026-09-12-workbench-clients-filings.md) | 中文

## 问题

阶段一秘书公司 SOP 列出十二个 Skill；其余一切都依赖的是客户主档（S-CORE-01）与法定申报台账（S-COMPL-01）。此前工作台只知道积分与团队状态：客户的注册证号散落在聊天历史里，申报截止日靠手工记录，每年的 NAR1 周年日要按客户逐个记。工作台需要一个由 host 拥有的地方存放客户与申报，还需要一个页面把它们变成带催办阶梯（d30/d15/d7/d1/overdue）的本年申报日历，供后续跟进流程行动。

## 决策

**数据放在 `workbench` 域，表就地新增。** 域 spec 在 version 1 内新增两个 per-record 表：以主档 id `C-<年份>-<序号>` 为键的 `clients`（序号越过该年已存的全部 id，id 因此稳定且可读），和以随机 UUID 为键的 `obligations`。客户行保存 SOP 主档字段——`nameCn`（必填）、`nameEn`、`brNo`、`crNo`、`incorporationDate`（必填，`YYYY-MM-DD`）、`registeredAddress`、`contactEmail`、`contactWechat`、`contactWhatsapp`（可选，非空才入库）——外加 `createdAt` 与一个 `complianceStatus` 占位（`green`），留给后续工作流使用。义务行保存 `clientId`、`kind`（`NAR1`/`AB56`/`PTR`/`ITR`）、`periodLabel`、`dueDate`、`status`（`open`/`submitted`）与 `createdAt`。版本保持 1，理由与 `web_login` 域相同：早于新表的介质把它们解析为空表，既有部署原样打开，而提升版本会让所有介质在打开时被拒。

**Remote 命名空间拥有读取、派生值与本年排期。** `clients` 按创建顺序返回全部行并折叠进 open 义务数；`obligations` 把每行 join 上客户当前名称（客户改名不会让台账陈旧）并按 open 在前、各组截止日最早在前排序；`addClient`/`removeClient`、`addObligation`/`markObligation`/`removeObligation` 是写入，全部排在域的单链上。`markObligation` 把行移到 `submitted` 即 SOP 中客户提交后的收尾步骤。每次读取都在调用时用当天 UTC 日期派生 `daysUntilDue` 与 `dueTier`——阶梯从不入库，每次读取自行重新分级，不需要清扫器。

**`complianceSchedule` 折叠本年日历；台账保持权威。** 本年到期的已登记义务是权威行（`source: 'ledger'`）。成立周年日落在本年的每个客户还会得到一行推算 NAR1（`source: 'derived'`），周年日后 `NAR1_FILING_WINDOW_DAYS`（31）天到期——除非该客户该年已登记 NAR1 义务，因此已登记的申报不会和推算行重复提醒。行按截止日最早在前排序，客户端页面在真正的义务被登记前把推算行当提示信息渲染。

**客户端页面一次读三条，只做字段级校验。** `WorkbenchController` 增加第四个快照 store；`loadClients()` 发出 `workbench.clients`、`workbench.obligations`、`workbench.complianceSchedule` 并把答案停进同一个快照，页面因此不会渲染出排期不知道的主档行，反之亦然。`ClientsPage` 在本地校验必填字段与日期格式（不满足时提交控件保持禁用），把宿主的 wire 错误码（`gateway/bad-request`、`workbench/client-not-found`、`workbench/obligation-not-found`）映射为友好文案，并把每次状态变更都当作一次宿主往返——页面自己不持有任何客户状态。第七个 `sidebar.nav` 条目打开该页面；槽位注册保持静态。

## 已考虑的替代方案

**单独的 clients/filings 包。** 台账 join 的东西本就都在 workbench 域内，拆出去会让一个存储域的 spec 摊到两个插件上却没有第二个消费者。否决；域就地扩展。

**把催办阶梯存在行上。** 存储的阶梯在日期一变时就陈旧，反正还需要清扫器或读取时重算。否决；阶梯在调用时从截止日派生。

**排期完全在客户端派生。** 页面就得重新实现 NAR1 窗口规则并在每次渲染重 join 客户名，未来任何消费者（机器人催办、月报）还得再派生一遍。否决；host 折叠是唯一答案。

**按客户/kind/期间阻断重复义务。** 真实申报会以修订、更正的形式到达；台账是记账面，不是法定事实来源。延期；去重属于后续从代理输出记录提交的工作流阶段。

## 后果

既有 `workbench` 介质以空 `clients`/`obligations` 原样打开；积分与团队状态照常工作。删除客户会连带删除其义务——台账按构造不产生孤儿行。推算的 NAR1 行是提示信息：在真正登记申报之前它每次读取都会重新出现，因此删除一条义务而不登记替代品，会让推算行复活而不是安静下去。客户与申报数据是部署级的，没有按成员的归属，与本轮的客户端侧收窄一致；合规状态在某个工作流阶段真正计算之前是固定的 `green` 占位。排期的年份是调用时的 UTC 年份。

## 测试

Workbench 宿主测试覆盖主档 CRUD（跨年 id 序号、校验、未知 id 拒绝）、义务生命周期（登记、标记、删除、客户名 join、排序）、阶梯边界的 tier 派生（含 `overdue`）、排期折叠（台账权威、周年推算、已登记抑制、年份截断）以及旧介质兼容（早于新表的介质按空表读取）。客户端测试覆盖 store 往返（`loadClients` 三连、添加/删除客户、添加/标记/删除义务）、页面渲染（排期 tier 与来源、主档行、台账行、空/加载/错误状态）、表单（仅可选字段的载荷、经禁用提交表达的本地校验、宿主拒绝的呈现）以及第七个导航条目的 browser-plugin 期望。
