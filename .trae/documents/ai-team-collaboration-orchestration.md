# 「AI 团队协作」自动跨角色编排实施计划

## Context

设计图愿景是「秘书接单后自动派给会计/法务/审计并汇总」，但目前跨角色协作只能用户手动开多个会话，或模型自行决定调用 subagent。用户已拍板方案：

- **引擎**：复用现有 `dsh-workflow` 能力——模型在 AI 秘书会话内编写编排脚本（分诊 → `parallel` 并行派发会计/法务/审计 → 审计复核 → 汇总 JSON）。
- **入口**：智能任务助手加「AI 团队协作」模式开关；开启后 brief 提交给秘书预设，首条消息前拼编排模板指令，成员选择器隐藏（角色由 workflow 驱动）。

**已核实的关键事实**（决定实现形态）：
1. workflow `agent(prompt, opts)` 只接受 `label/phase/schema/provider/model`（[runtime.ts L349-380](file:///Users/apple/Documents/hr/packages/workflow/workflow-worker-thread/src/runtime.ts)，未知键抛 `UNSUPPORTED_OPTION`）——**无 persona 覆盖**。四个角色预设组合本就只差人设前缀，因此角色指令写入 prompt 文本即可，功能等价；`label` 用于右栏「子任务进度」展示（会计/法务/审计/审计复核）。
2. [secretary 预设](file:///Users/apple/Documents/hr/packages/preset/agent-presets/presets/secretary/agent.cordis.yml) L223-229 已挂载 `workflow-worker-thread` + `tool-workflow`——**零预设/引擎改动**。
3. 提交复用 `assignTask(presetId, brief)`（[workbench-store.ts L381-408, L471-522](file:///Users/apple/Documents/hr/packages/client/ui-workbench/src/client/workbench-store.ts)）——**store 无需改动**。

**硬约束**：不改 agent-loop / 核心布局；全走插件扩展点；UI 文案走 locale 字典（`verify-client-ui-i18n`）；strict TS + JSDoc；双语 README + 一篇 Agent Note。

## 改动清单

### 1. locale 字典 — `packages/client/ui-workbench/src/client/locales.ts`

zh（约 L90 段）与 en（约 L224 段）对称新增：

- `assistant.collaboration`：开关文案「AI 团队协作」/ "AI team collaboration"
- `assistant.collaborationHint`：一句说明（开启后成员由编排自动派发）
- `assistant.collaborationTemplate`：首条消息模板（带 `{brief}` 参数，经 `t(key, { brief })` 插值；模型收到的是单条用户消息，满足 Model-visible ⟺ logged）。模板结构：
  1. `phase('分诊')` → 1 个 `agent()` 分诊，把简报拆成会计/法务/审计三份具体工作说明
  2. `parallel([...])` 并行 3 个 `agent()`，`label` 为「会计」「法务」「审计」，prompt = 分诊产出对应说明 + 角色指令（会计：账务/报表；法务：合同/合规；审计：凭据核验/抽检）
  3. 1 个 `agent()`（label「审计复核」）复核三份结果并给修改意见
  4. `return` JSON：`{ summary, findings: [{role, title, detail}], openIssues }`
  5. 声明：脚本只编排，不执行实际工作

### 2. AssistantPage — `packages/client/ui-workbench/src/client/pages/AssistantPage.tsx`

- 新增 `collab` state（默认 `false`）；成员选择区上方渲染开关（`role="switch"` + `aria-checked`，样式同级于 `css.memberChip`），旁挂 hint 文案
- 协作开启时隐藏成员选择区；解析 `secretaryId = roster.find(m => m.role?.id === 'secretary')?.id`，找不到则开关禁用（UI 可见层 fail loud）
- 提交：`onAssign(collab ? secretaryId : selected, collab ? t('assistant.collaborationTemplate', { brief: trimmed }) : trimmed)`
- JSDoc 更新 props 契约；无新增 `any`

### 3. 测试 — `packages/client/ui-workbench/tests/pages-view.client.spec.tsx`

现有 `describe('AssistantPage')` 内追加：
1. 开关默认关，现有行为不变
2. 开启后成员选择区不可见
3. 开启后提交：`onAssign` 收到秘书 id + 含 `workflow`/`parallel` 关键词的模板拼接文本（`{brief}` 已插值）
4. roster 无秘书角色时开关禁用

### 4. 文档

- [README.md](file:///Users/apple/Documents/hr/packages/client/ui-workbench/README.md) / README.zh.md：任务助手一节补协作模式行为（zh 行 ~30 与 en 行 ~30）
- Agent Note 双语三件套：`.agents/notes/implemented/architecture/2026-09-11-assistant-collaboration-workflow-mode.md`（+ `.zh.md` + `.i18n.yaml` 经 `--write` 重录）
  - Problem：跨角色任务需手动逐个派发；workflow 子代理不支持 persona 注入
  - Decision：客户端首消息模板驱动秘书用 tool-workflow 自编排；角色指令入 prompt 而非 persona
  - Alternatives considered：给 workflow `agent()` 加 persona 选项（需打通 worker 协议 + subagent persona capability，改动面大）；新建独立编排预设（与现有四预设组合重复）
  - Consequences：子代理人格靠 prompt 文本区分；进度右栏按 label 追踪；模板文案受 locale 门禁约束

## 验证

1. `pnpm exec vitest run packages/client/ui-workbench`（114+ 用例全过）
2. `pnpm --filter @deepseek-ai/dsh-client-ui-workbench bundle`（无 watch 构建）
3. `pnpm run typecheck`
4. `pnpm run verify-translation-pairing --write packages/client/ui-workbench/README.md` + Agent Note pair；`pnpm run test:docs`（16 门禁）
5. 浏览器（`http://127.0.0.1:3080/?token=...`）：开关切换、成员区隐藏、提交后秘书会话首条消息含模板；有 `DEEPSEEK_API_KEY` 时观察 workflow 运行与右栏子任务 label（无 key 则止步于消息发出）

## 不做的事

- 不改 workbench-store / agent-loop / workflow 引擎 / 预设 yml
- 不做宿主多会话编排引擎（用户已否决）
