# Agent Note: 成员导航的 owner 门禁必须放在所有 hooks 声明之后

Status: implemented

[English](2026-09-12-members-nav-owner-gate-hook-order.md) | 中文

## 问题

`WorkbenchNavAction` 曾对 `members` 目标在 `!my.isOwner` 时提前返回 `null`——位置在组件的两个 `useState` 声明**之前**。门禁值初始为 `false`（`MY_VISITOR`），并在 `/auth/status` 读取完成后翻转为 `true`。翻转发生时，同一个已挂载实例穿过门禁重新渲染并多声明了两个 hooks，React 抛出错误 #310（"Rendered more hooks than during the previous render"），`sidebar.nav` slot 条目崩溃。结果是所有工作台导航行都消失——包括 owner 自己的成员管理行——尽管 bundle、auth status 和页面本身都正确。非 owner 会话的该标志永不翻转，因此崩溃只在部署 owner 身上出现。

## 决策

owner 门禁移至 [WorkbenchNavAction.tsx](../../../../packages/client/ui-workbench/src/client/WorkbenchNavAction.tsx) 中 hooks 声明之后，组件的每次渲染都声明相同的 hooks 序列，与 `my.isOwner` 无关。[回归测试](../../../../packages/client/ui-workbench/tests/nav-action.client.spec.tsx) 对同一个已挂载的 `members` 行跨 `isOwner` 翻转重渲染，并断言行出现且无 hooks 顺序错误。

## 已考虑的替代方案

**在 JSX 内部做门禁（`{isOwner && row}`）。** 保持 hooks 顺序不变，但把条件散落到组件已有的两条返回路径（rail 与 wide）上。已否决：单一提前返回更清晰，且现已证明安全。

**给 slot 条目包一层错误边界。** 只会掩盖 bug 而不修正 hooks 顺序，且崩溃的行依然会消失。已否决。

## 后果

auth status 一报告 owner 身份，成员管理行即对 owner 出现，侧边栏其余行同时正常渲染。未来若在本组件内引入条件 hooks，必须置于所有提前返回之后，否则同类崩溃会复发。
