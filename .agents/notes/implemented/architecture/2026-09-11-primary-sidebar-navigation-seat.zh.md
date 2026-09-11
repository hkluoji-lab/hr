# Agent Note: Primary sidebar navigation seat

Status: implemented

[English](2026-09-11-primary-sidebar-navigation-seat.md) | 中文

## Problem

左侧侧边栏外壳在其顶部附近只有一个可供功能包填充的座位：`sidebar.footer.action`，一条固定在栏底、位于浏览区域下方的横向动作条。产品主导航——任务大厅、智能任务助手、活跃任务、AI 团队、项目——属于新会话按钮正下方、处于该栏的纵向流中，用户在那里读到的是导航而不是页脚动作。没有座位表达这一位置与含义：要把导航放在浏览区域之上，就得让外壳知道某个产品的入口列表；而复用页脚动作条则会让产品主导航与部署自身的页脚动作共用同一份契约（`ui-cordis` 占用该座位）。

## Decision

`ui-sidebar` 声明 `sidebar.nav`：一个 root scope 的 `list` 槽位，渲染在新会话控件正下方、浏览区域之上，且在展开栏与收起的 56px 轨道中都渲染。外壳只传入自身的栏状态 `SidebarNavOwnerProps`（`wide`）；它不持有导航状态、入口列表或目标词表，因此部署可以在不改动外壳的前提下替换产品主导航。

`ui-workbench` 按设计顺序注册五个入口，每个表面一个，id 为 `workbench-<target>`，`order` 等于其下标。每个入口通过 `navActionFace(controller, target)` 自行拥有目标与激活外观：页面目标切换 `controller.togglePage`，并在打开页面 store 指向该页面时报告为当前；项目目标调用 `controller.viewProjects()` 且永不报告为当前，因为它展开侧栏而非打开页面。入口组件在 `wide` 下渲染为带文字的行，在轨道上渲染为纯图标控件；侧边栏外壳的轨道入场动画包含该座位。

AI 团队条目在其自身内部渲染设计中的角色组：来自共享 `ROLES` 表的四个可展开角色（AI 秘书、AI 会计、AI 法务、AI 审计），秘书角色默认展开，每个角色列出其能力子项（AI-客服、AI-合同……），子项经 face 的 `openTeam` 打开团队页。这些子项是组件输出而非槽位条目——该座位保持为扁平的五条目列表，部署替换该入口时其角色组随之一起被替换。

## Alternatives considered

**复用 `sidebar.footer.action`。** 工作台入口最初就发布在那里，且该座位无需改动外壳。它是一条固定在浏览区域下方的横向动作行，因此五个入口渲染为一条横向控件带，而该座位的文档含义是页脚动作——产品主导航与部署的页脚动作会变成一份对两者都不再准确的契约。予以否决，改为使用按位置与含义命名的座位。

**把导航渲染进 `sidebar.workspaces`。** 顶部区域唯一的另一个座位是工作区浏览器，入口会替换它，从而把某功能的导航与拥有该区域的 Workspace/Session 浏览器混为一谈。予以否决。

**像工作台页面那样把入口放进 `shell.overlay`。** 页面是全帧表面；页面打开时导航必须仍可见于栏内，而 overlay 入口无法占据侧栏的纵向流。予以否决。

**在外壳中硬编码入口列表。** 外壳将拥有某个产品的导航，部署无法替换它——这正是让 `sidebar.brand.*` 与 `sidebar.settings` 保持为座位的同一条「不在所有者内部做默认」规则。予以否决。

## Consequences

- `ui-sidebar` 新增一个公开列表槽位；外壳不持有导航状态，`SidebarNavOwnerProps`（`wide`）是注册者能收到的唯一栏事实，因此每个入口自行提供其轨道呈现。
- 工作台原先清除当前会话并回到 hero 的 `Workbench` 入口消失；hero 通过启动新会话到达，报告页改从 hero 的快捷动作到达，而不再位于主导航。
- `sidebar.footer.action` 仍是页脚动作座位（由 `ui-cordis` 占用）；两个座位都在展开栏与轨道中渲染。
- 组合掉 `ui-workbench` 的部署得到空的导航座位，外壳渲染「无导航」而不是回退列表。

## Verification

`packages/client/ui-sidebar` 固定该座位：`apply.client.spec.tsx` 断言 `sidebar.nav` 的 spec 为 `{ kind: 'list', scope: 'root' }` 并在 teardown 时释放，`sidebar-root.client.spec.tsx` 断言该座位紧接新会话之后渲染并收到 `wide`，侧边栏快照 spec 固定展开态与轨道态两者的标记。`packages/client/ui-workbench` 固定各入口：`nav-action.client.spec.tsx` 覆盖宽栏标签与激活、`aria-current` 标记、纯图标轨道按钮、团队条目的角色组（秘书子项默认展开、逐角色切换、能力子项调用 `openTeam`、分组折叠钮），以及各 face（页面目标切换打开页面，项目命令展开侧栏，`openTeam` 打开团队页且不切换关闭）；`browser-plugin.client.spec.ts` 断言五个入口 id 按设计顺序注册并在 fiber teardown 时释放；`pages-view.client.spec.tsx` 覆盖活跃任务过滤与其空闲空状态提示。以上套件均无需密钥。
