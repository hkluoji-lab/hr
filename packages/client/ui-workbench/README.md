---
description: "Web workbench surfaces: the blank-session hero dashboard (greeting, quick actions, credits, agent-preset team roster), five sidebar-foot nav entries opening frame-wide Task hall, Task assistant, AI team, and Monthly report pages, and session-scoped deliverables, subtask-progress, credits, and AI-team-status tabs in the right Sidebar; for users and maintainers of the workbench surfaces."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

English | [中文](README.zh.md)

## Summary

This package renders the workbench on the Web GUI: a blank-session hero dashboard (time-aware greeting, live-team subtitle, four quick-action cards, agent-preset team cards) and five sidebar-foot nav entries: Workbench, Task hall, Task assistant, AI team, and Monthly report. One `agentPresets.list` Remote read feeds the roster (busy, online, or offline); a card stages its preset. The nav entries open frame-wide `shell.overlay` pages: cross-session task rows, the brief form that assigns work to a member, the team grid, and the month report with its credits balance, grant form, and ledger. Session-scoped right-Sidebar tabs show Deliverables, Progress, Credits, and AI team status.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin alongside the runtime; with no current session the hero then shows the dashboard between the headline chrome and the workspace row. "New task" starts a fresh session on the deployment default composition, "View projects" reveals the sidebar workspace browser, and each team-member card starts a session composed for that member's preset. Broken presets render as offline and are not clickable. When the host workbench service exists, the subtitle shows the credits balance.

The sidebar footer gains five additive entries without replacing any sidebar region, each rendering as a labelled row when wide and a 36px tooltip circle on the rail. **Workbench** clears the current session and lands on the hero; the other four open a page that covers the app frame, and clicking the active entry again (or the page's close control, or Escape) dismisses it. **Task hall** lists every started session — title, the preset that runs it, lifecycle, and how long ago it last moved — and a row selects that session. **Task assistant** is the brief form: describe the task, optionally assign one member or leave the default team, and submit to start that session with the brief as its first user message. **AI team** renders the preset roster at page scale, where a card starts a session composed for that member. **Monthly report** tallies the local month's tasks beside the credits balance, a grant form, and the recent ledger.

"Call the AI team" and "Monthly report" on the hero open those same team and report pages.

With a session open, the right Sidebar gains four builtin page tabs, all also offered as guide-page entries. **Deliverables** lists every file the session's successful `write`, `edit`, and mutating `str_replace_editor` calls produced, deduplicated in first-seen order; a row opens the file through the Sidebar's resource address. **Progress** lists the session's subagent children in session-store order with a running/settled dot; a row opens that child session. **Credits** shows the deployment balance and the recent grant ledger. **AI team status** counts the members online, working, and offline, then lists each member with its state dot. A tab with nothing to show renders one empty, loading, or failed-read line.

### Empty deployments

A deployment that composes no presets (or runs without the agent-presets service) still shows the greeting, quick actions, and the Task hall; the team section renders an empty note pointing at Settings → Skills & Presets instead of a card grid, and the task assistant notes that the default team will run the task.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One `WorkbenchController` backs every surface, so a nav entry and a hero shortcut drive the same page state. It holds three snapshot stores: the team/credits dashboard, the open-page id, and the credits ledger. `load()` issues one `agentPresets.list` call (treating `gateway/invocation-unavailable` as an empty roster, matching the other preset surfaces), folds the session list to mark presets with a non-blank session `busy`, and sorts broken presets last as `offline`. `startWithPreset(id)` mirrors the hero preset chip: stage the id, call `uiWorkspace.startSession()`, and on the next session-list change apply `agentPresets.select` to the new blank session — the host refuses composing a non-blank session. `assignTask(presetId, brief)` runs that same start and then submits the brief as the session's first user message once the binding exists.

The hero contributes one entry to the `conversation.hero.dashboard` list slot (declared by ui-conversation, scope `root`). Five entries occupy the existing `sidebar.footer.action` list slot (declared by ui-sidebar, scope `root`), so no sidebar shell code changes: `navActionFace(sessions, controller, target)` binds `home` to `sessions.clear()` plus a page close, binds a page target to `controller.togglePage`, and derives the active state from both the open-page store and the session-list snapshot. The page surface is one entry in the `shell.overlay` list slot (declared by ui-layout, scope `root`); `WorkbenchShell` renders null while no page is open, keeping the overlay layer click-through, and dispatches to the hall, assistant, team, or report page. The hall folds the Session list (skipping blank and subagent sessions) through a hook cached on the list snapshot so `useSyncExternalStore` sees a stable reference.

The report page reads the bounded ledger through the host workbench `ledger` Remote and grants through `addCredits`, refreshing the balance and the ledger from the host's own answer. `monthReport` tallies the local calendar month from the same hall rows and ledger entries.

Four more contributions register through ui-sidebar-right's public two-stage path: a `SidebarRightTabDefinition` each (builtin priority, guide entry), then a body in the keyed `sidebar.right.pane.tab` seat (scope `session`, so the bodies exist only while a session is open). The deliverables face memoizes a fold of the session's event window on its revision through ui-deliverables' optional `sessionDeliverables` Cordis service — no cross-plugin value import; with that plugin composed out the tab renders its empty state. Rows open through the tab's `openResource` with the same session file address the Files tab uses (`dsh-util-workspace-path`). The progress face holds no data: a selector over the standard session-list store filters `origin: 'subagent'` rows by `parentId`, and clicks call `sessions.open(childId)`. The credits face and the team-status face bind the controller's ledger and dashboard snapshots — both deployment-wide, so they show the same balance, ledger, roster, and member states as the hero and the report page.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the dashboard is not enough.

- [ui-agent-preset](../ui-agent-preset/README.md) — the preset roster management section and the hero preset chip sharing the same roster.
- [ui-workspace](../ui-workspace/README.md) — the Workspace navigation service (`startSession`) the quick actions drive.
- [ui-conversation](../ui-conversation/README.md) — declares the `conversation.hero.dashboard` slot this package occupies.
- [ui-sidebar](../ui-sidebar/README.md) — declares the `sidebar.footer.action` list slot the nav entries occupy.
- [ui-layout](../ui-layout/README.md) — declares the `shell.overlay` list slot the frame-wide pages occupy.
- [ui-sidebar-right](../ui-sidebar-right/README.md) — owns the tab registry and the keyed `sidebar.right.pane.tab` seat the four tabs occupy.
- [ui-deliverables](../ui-deliverables/README.md) — owns the produced-file vocabulary the Deliverables tab calls through its `sessionDeliverables` service.
- [Web client architecture](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package renders human-facing surfaces from host roster, session, and credits state and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the current surfaces. They are current package constraints, not a roadmap comparison.

- **Team state is presence, not real workload** — `busy` only means a non-blank session currently carries the preset; there is no run-level task count, and the Progress tab lists direct subagent children rather than a workflow-run phase tree.
- **The hall is the session list, not a task model** — rows are started sessions folded from the Session list; there is no host-side task entity, assignment, or queue.
- **The task assistant starts one session per brief** — the brief becomes that session's first user message and the page keeps no draft, history, or queue.
- **The month report reads the bounded ledger** — credits granted outside the host's read limit are not counted, and the tally covers the local calendar month only.
- **Tabs are session views, not cross-session reports** — Deliverables folds only the open session's loaded event window (deduplicated within it), and all four tabs mount only while a session is selected.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This package is a read-and-act UI over the existing agent-presets and workbench Remotes (including the credits grant write), the session list, and the Workspace navigation service; it emits no cordis events and owns no cross-plugin mutable state beyond its view snapshots.

