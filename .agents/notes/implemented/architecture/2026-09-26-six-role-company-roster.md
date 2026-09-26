# Agent Note: The six-role company roster

Status: implemented

English | [中文](2026-09-26-six-role-company-roster.zh.md)

## Problem

The workbench shipped four member presets — `secretary`, `accountant`, `legal`, `audit` — as the company roster: the four roles the AI-team sidebar group, the hero grid, the team page cards, the task assistant's assignee picker, and the per-role one-click actions all named. The deployment's own product surfaces and its users named six: recruiting, finance, legal, financing, admin, marketing. Two vocabularies described one team, and two of the four overlapped the six instead of complementing them — `secretary` owned the scheduling and follow-up the six call 行政, and `audit` was a review pass over legal work rather than a peer of it.

The duplication reached the served page, not only the source. The hosting portal injects its own grouped navigation and its own right bar beside the workbench's, so one column carried two menus naming the same roles and tasks, and one frame carried two right bars repeating the same credits, team-status, task-progress, and deliverables panels.

The change could not be a rename. `web_login.json` binds every member and pending invite to role ids that `packages/host/web-login` validates against `ROLE_IDS`; an id the list no longer contains makes the stored record invalid and the service refuses to start (`DomainError: stored record ... does not match its schema`). Introducing the six therefore had to migrate persisted data, not only source.

## Decision

One vocabulary, six roles, in this order: `recruiting` 🧑💼, `finance` 💰, `legal` ⚖️, `financing` 📈, `admin` 📋, `marketing` 📣.

**Presets are real built-ins, not aliases.** `packages/preset/agent-presets/presets/<id>/` ships all six: a `preset.yml` (display name, description, `order` 5/6/8/9/10) plus a full `agent.cordis.yml` composing the standard toolset with a role persona. `secretary`, `accountant`, and `audit` are deleted rather than kept as deprecated ids — a surviving `secretary` would hold a second name for 行政 in the roster list, the preset registry, and `BuiltInPresetCopyKey`.

**One client module owns the role vocabulary.** `packages/client/ui-workbench/src/client/roles.ts` declares `RoleId` as the closed six-member union, `ROLES` as the display order (emoji, `match` token, description key, four tag keys), and `ROLE_ACTIONS` as the two one-click actions each role offers. The sidebar's AI-team children, the member cards, the pending rows, the assistant's collaboration controller, and the dashboard grid all derive from those declarations. `rolePending` returns `null` for the roles whose work the Clients domain does not model yet, which a member card renders as no pending row rather than a zero count.

**Merges.** `secretary` → `admin` (schedules, minutes, follow-up), `accountant` → `finance`, `audit` → `legal` as review over legal work; `legal` keeps its id.

**Persisted bindings migrate in place.** `ROLE_IDS` in `packages/host/web-login/src/spec.ts` becomes the six, and existing `web_login.json` `members.roles` and `invites.roles` are rewritten by mapping each old id, deduping, and sorting into the declared order, with the original copied to a timestamped `.bak-roles6-*` sibling first. This is a one-shot migration per deployment rather than a loader-side compatibility path: a fallback that still accepted `secretary` would keep the retired vocabulary inside the validated schema, which is the drift this change removes.

**Layout follows the count.** The dashboard member grid leaves four-across for three-across (`repeat(3, …)`, `max-width: 1040px`, widening to `1160px` at ≥1400px), so six cards fill two balanced rows.

**The portal layer yields to the workbench.** The hosting portal (`apps/web/hr-portal/index.html`, merged into the built `apps/web/dist/index.html` by `install.mjs`) probes the served document for the workbench's own surfaces and withdraws on finding them. A `button[aria-label]` for 任务大厅, 智能任务助手, or AI 团队 that sits outside the portal's own injected container removes an injected navigation it had already built and hides its right bar, leaving one sidebar and one right bar. The workbench hero — a `[data-workbench-hero]` section that renders its own greeting, four quick cards, task stats, and member cards from locale copy and the signed-in member's own name and roles — removes the portal's injected greeting, quick-action block, and demo counts, and drops the portal's pinned hero layout, leaving one greeting and one set of quick actions inside the layout the hero owns. A build without the workbench keeps every portal surface. The probe reads the served DOM rather than a build flag because the portal template is merged over whichever build it is installed on.

## Alternatives considered

**Keep the four presets and add two.** The roster would then hold both `secretary` and `admin` for one job, and every six-role product surface would need a permanent four-to-six translation table. Rejected: this is the duplication being removed.

**Rewrite the ids as source edits only.** Editing `ROLE_IDS`, the preset folders, and the locale keys without touching storage leaves every existing deployment unable to start until its `web_login.json` is hand-edited. Rejected in favor of a scripted migration that does that edit deliberately and keeps a backup.

**Keep the retired ids inside `ROLE_IDS`, or map them at load time.** The schema would keep validating a vocabulary no surface shows, and the next role change would face the same question with more legacy ids accumulated. Rejected.

**Delete the workbench's navigation and keep the portal's.** The workbench entries are plugin registrations into the primary-sidebar seat and they are what opens the task hall, assistant, and team pages; removing them would remove those pages with them. Rejected.

**Gate the portal on a build flag in the template or in `install.mjs`.** The flag would have to be maintained separately from the document actually served, and the two could disagree. Rejected for the DOM probe, which observes the build it is running inside.

## Consequences

One name now covers one job across the preset files, the locale dictionaries, the sidebar, the hero, the team page, the assistant, and the persisted binding, and renaming a role is a dictionary-plus-`preset.yml` edit that reaches every surface at once.

The costs are explicit. Each deployment's `web_login.json` must run the migration before its service starts, and the change is not backward compatible: an older build reading a migrated file meets role ids it does not know. `rolePending` returning `null` means recruiting, financing, and marketing show no pending row until the Clients domain models their work, while their cards and one-click actions are present regardless. In the portal the withdrawal is a runtime probe over the served DOM, so the portal's own surfaces stay reachable on builds without the workbench, and neither two navigations nor two greetings nor two sets of quick actions can be visible at once. The withdrawal runs inside the observer that re-applies portal injections, so a hero that mounts after the portal's first pass still retires the portal's copy.

## Verification

`packages/preset/agent-presets/tests` pins the shipped root as the six presets with their orders and locale-owned copy; `packages/client/ui-agent-preset/tests` pins both dictionaries; `packages/host/web-login/tests` pins `ROLE_IDS` acceptance; ui-workbench specs pin the six-role grid, the navigation children, the member cards, the assistant controller, and the store helpers; `apps/cli/tests/web-agent-presets.e2e.ts` covers the served preset list. On the local deployment the migration ran against `web_login.json`, `pnpm run build` rebuilt the client bundles, `node apps/web/hr-portal/install.mjs` re-merged the portal, and the served page was asserted in a browser: no injected portal navigation, one right bar, six sidebar role children, six rendered `[data-role]` cards, no injected portal greeting or quick-action block, and exactly one button per quick action.