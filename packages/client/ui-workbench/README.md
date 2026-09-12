---
description: "Web workbench surfaces: the blank-session hero dashboard (greeting, quick actions, credits, agent-preset team roster), six sidebar nav entries (Task hall, Task assistant, Active tasks, Clients & filings, AI team, Projects) plus an owner-only Members entry opening frame-wide pages, and session-scoped deliverables, subtask-progress, credits, and AI-team-status tabs in the right Sidebar; for users and maintainers of the workbench surfaces."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-workbench

English | [中文](README.zh.md)

## Summary

This package renders the workbench on the Web GUI: a blank-session hero dashboard (greeting, live-team subtitle, four quick actions, agent-preset team cards) and six `sidebar.nav` nav entries — Task hall, Task assistant, Active tasks, Clients & filings, AI team, Projects. One `agentPresets.list` read feeds the roster; five entries open frame-wide `shell.overlay` pages and Projects reveals the workspace browser. The workbench reads `/auth/status` and scopes the roster to the caller's bound roles; the owner gains an owner-only Members page (invites, roster, unbinding). Session-scoped right-Sidebar tabs show Deliverables, Progress, Credits, and AI team status.

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

The sidebar's primary navigation gains six additive entries directly under New Session without replacing any sidebar region, each rendering as a labelled row when wide and a 36px tooltip control on the rail. **Task hall** lists every started session — title, the preset that runs it, lifecycle, and how long ago it last moved — and a row selects that session. **Task assistant** is the brief form: describe the task, optionally assign one of the company's role members or leave the default team, and submit to start that session with the brief as its first user message. Flipping on **AI team collaboration** replaces the picker: the brief goes to the AI secretary prefixed with an orchestration template, and the secretary composes a workflow — triage, parallel accountant/legal/audit subagents, an audit review, and a JSON summary — whose children surface in the progress tab by label. **Active tasks** is the hall filtered to running sessions. **Clients & filings** is the stage-1 secretary-company SOP surface: the client master (record a client with its incorporation date, registry numbers, and contacts), the statutory-filing obligation ledger (record NAR1/AB56/PTR/ITR obligations with period and due date, mark them submitted, reopen, or remove them), this year's filing schedule — stored obligations plus one projected NAR1 row per client whose incorporation anniversary has no recorded filing, each row badged with its reminder tier — the signature-delivery ledger: record a file package sent to a client by email/WeChat/WhatsApp, advance it along its lifecycle (viewed → signed → returned), and read its follow-up tier (`nudge` T+3 / `chase` T+7 / `escalate` T+14) that the 催办 workflow acts on — and the follow-up center: one chase queue folding open deliveries in a chase rung and open obligations in a reminder rung (d30/d15/d7/d1/overdue), most urgent rung first, each row showing the target's facts, its rung badge, the host-drafted message (editable), the rung's suggested channel (switchable), and how many reminders have been logged, with a logging action that records the reminder on the host. **AI team** renders the company-role roster — the same cards as the hero's team section, so mode and other non-role presets stay out of the company's team — at page scale, where a card starts a session composed for that member; its nav entry also expands in place to the four role groups — AI secretary, AI accountant, AI legal, AI audit — each listing that role's capability entries (AI-Service, AI-Contracts, …) that open the team page. **Projects** reveals the workspace browser. The first five open a page that covers the app frame, and clicking the active entry again (or the page's close control, or Escape) dismisses it. **Month report** opens from the hero's quick action and tallies the local month's tasks beside the credits balance, a grant form, and the recent ledger.

"Call the AI team" and "Monthly report" on the hero open those same team and report pages.

The workbench scopes itself to the caller's member binding, read from the login surface's `/auth/status` as `{name, roles, isOwner}`. The greeting appends the bound roles (`greeting.roles`), and the roster, task-assistant member picker, and team page filter to the caller's roles plus the role-less presets — the owner and unbound visitors see the full roster, so an unbound deployment renders exactly as before. The owner additionally gets a **Members** nav entry opening a frame-wide page: check roles to mint a single-use invite code (shown with its expiry), read the roster with grant metadata, unbind a member, and delete a registered account — the account list also covers phones that never bound a role, and the owner's own account renders without a delete control; the nav entry renders only for the owner.

With a session open, the right Sidebar gains four builtin page tabs, all also offered as guide-page entries. **Deliverables** lists every file the session's successful `write`, `edit`, and mutating `str_replace_editor` calls produced, deduplicated in first-seen order; a row opens the file through the Sidebar's resource address. **Progress** lists the session's subagent children in session-store order with a running/settled dot; a row opens that child session. **Credits** shows the deployment balance and the recent grant ledger. **AI team status** counts the company's role members online, working, and offline, then lists each role member with its state dot. A tab with nothing to show renders one empty, loading, or failed-read line.

### Empty deployments

A deployment that composes no presets (or runs without the agent-presets service) still shows the greeting, quick actions, and the Task hall; the team section renders an empty note pointing at Settings → Skills & Presets instead of a card grid, and the task assistant notes that the default team will run the task.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One `WorkbenchController` backs every surface, so a nav entry and a hero shortcut drive the same page state. It holds four snapshot stores: the team/credits dashboard, the open-page id, the credits ledger, and the clients page (master rows, obligation rows, the schedule, the delivery rows, and the follow-up queue). `load()` issues one `agentPresets.list` call (treating `gateway/invocation-unavailable` as an empty roster, matching the other preset surfaces), folds the session list to mark presets with a non-blank session `busy`, and sorts broken presets last as `offline`. `startWithPreset(id)` mirrors the hero preset chip: stage the id, call `uiWorkspace.startSession()`, and on the next session-list change apply `agentPresets.select` to the new blank session — the host refuses composing a non-blank session. `assignTask(presetId, brief)` runs that same start and then submits the brief as the session's first user message once the binding exists. `loadClients()` issues the quintuple the clients page reads — `workbench.clients`, `workbench.obligations`, `workbench.complianceSchedule`, `workbench.deliveries`, `workbench.followUps` — into its snapshot; the page only validates field presence locally and maps the host's wire error codes to friendly copy. `load()` also probes the same-origin `/auth/status` once (failing silently to the unbound visitor shape), and `scopedRoles`/`scopedMembers` filter the role vocabulary and preset roster by that binding before any surface reads them.

The hero contributes one entry to the `conversation.hero.dashboard` list slot (declared by ui-conversation, scope `root`). Seven entries occupy the `sidebar.nav` list slot (declared by ui-sidebar, scope `root`), so no sidebar shell code changes: `navActionFace(controller, target)` binds a page target to `controller.togglePage` and derives the active state from the open-page store, binds Projects to `controller.viewProjects()`, which reveals the sidebar workspace browser, and binds `openTeam` to `controller.openPage('team')` for the team entry's capability children. The team entry renders the `ROLES` groups inline; expansion is row-local component state (everything ships collapsed so the seat stays short enough to reach the settings footer, and each chevron reveals on demand), and the children never become slot entries. The Members entry binds `useMy` at render time and renders null for anyone but the owner, so the slot registration stays static while the visibility follows the binding. The page surface is one entry in the `shell.overlay` list slot (declared by ui-layout, scope `root`); `WorkbenchShell` renders null while no page is open, keeping the overlay layer click-through, and dispatches to the hall, assistant, active-tasks, clients, team, members, or report page. The hall folds the Session list (skipping blank and subagent sessions) through a hook cached on the list snapshot so `useSyncExternalStore` sees a stable reference. The members page drives the login surface's published `/team` routes — create invite, list members, unbind, list accounts, delete an account — through the same fetcher the controller probes `/auth/status` with; the roster and the account list are one snapshot, read together so a single status reports either failure.

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
- [ui-sidebar](../ui-sidebar/README.md) — declares the `sidebar.nav` list slot the primary navigation entries occupy.
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
- **Workspace scoping is client-side** — role bindings filter the rendered roster, picker, and team views and gate the login surface's management routes; task and session data are not isolated server-side by role.
- **The client master is deployment-wide bookkeeping** — one shared master, filing ledger, delivery ledger, and reminder log; rows carry no per-member ownership, revision history, or audit trail, a projected NAR1 schedule row stays informational until the filing is recorded, and the ladder rungs recompute from the send/due date at every read — logged reminders annotate the queue rows but never freeze a row's grade or send anything themselves.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The member binding — the `/auth/status` read, roster scoping, and the owner-only members page — is recorded in the [team member roles Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-web-team-member-roles.md). The clients page — the host snapshot triple and its page contract — is recorded in the [clients & filings Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-workbench-clients-filings.md). The signature-delivery ledger section is recorded in the [deliveries Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-workbench-deliveries-followup.md). The follow-up center section is recorded in the [follow-up center Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-workbench-follow-up-center.md).

</details>

**Runtime invariant:** No companion is published. This package is a read-and-act UI over the existing agent-presets and workbench Remotes (including the credits grant write), the session list, and the Workspace navigation service; it emits no cordis events and owns no cross-plugin mutable state beyond its view snapshots.

