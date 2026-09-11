# Agent Note: Primary sidebar navigation seat

Status: implemented

English | [中文](2026-09-11-primary-sidebar-navigation-seat.zh.md)

## Problem

The left sidebar shell had one seat a feature could fill near its top: `sidebar.footer.action`, a horizontal action strip pinned to the column's foot below the browsing region. The product's primary navigation — Task hall, Task assistant, Active tasks, AI team, Projects — belongs directly under New Session, in the column's vertical flow, where a user reads it as navigation rather than as footer actions. No seat expressed that position or meaning: placing navigation above the browsing region required the shell to know one product's entry list, and reusing the foot strip made the product's primary navigation share one contract with a deployment's own footer actions (`ui-cordis` occupies that seat).

## Decision

`ui-sidebar` declares `sidebar.nav`, a root-scope `list` slot rendered directly under the New Session control and above the browsing region, in both the expanded column and the collapsed 56px rail. The shell passes only its column state as `SidebarNavOwnerProps` (`wide`); it holds no navigation state, no entry list, and no target vocabulary, so a deployment replaces the product's primary navigation without touching the shell.

`ui-workbench` registers the five entries, one per surface, in the design's order with ids `workbench-<target>` and `order` equal to their index. Each entry owns its target and its active appearance through `navActionFace(controller, target)`: a page target toggles `controller.togglePage` and reports current while the open-page store names that page, and the Projects target calls `controller.viewProjects()` and is never current, because it reveals the sidebar rather than opening a page. The entry component renders a labelled row when `wide` and an icon-only control on the rail; the sidebar shell's rail-entry animation includes the seat.

The AI-team entry renders the design's role groups inside itself: four expandable roles from the shared `ROLES` table (AI secretary, AI accountant, AI legal, AI audit), the secretary one open by default, each listing its capability entries (AI-Service, AI-Contracts, …) that open the team page through the face's `openTeam`. The children are component output, not slot entries — the seat stays a flat five-entry list, and a deployment replacing the entry replaces its role groups with it.

## Alternatives considered

**Reuse `sidebar.footer.action`.** The workbench's entries first shipped there, and the seat needs no shell change. It is a horizontal action row pinned below the browsing region, so the five entries rendered as one horizontal strip and the seat's documented meaning is footer actions — the product's primary navigation and a deployment's footer actions would be one contract that no longer describes either. Rejected in favor of a seat named for its position and meaning.

**Render the navigation inside `sidebar.workspaces`.** The only other top-region seat is the workspace browser, which the entry would replace, conflating a feature's navigation with the Workspace and Session browser that owns the region. Rejected.

**Put the entries in `shell.overlay` like the workbench pages.** Pages are frame-wide surfaces; navigation must stay visible in the column while a page is open, and an overlay entry cannot occupy the sidebar's flow. Rejected.

**Hardcode the entry list in the shell.** The shell would own one product's navigation, and a deployment could not replace it — the same defaulting-at-the-owner rule that keeps `sidebar.brand.*` and `sidebar.settings` as seats. Rejected.

## Consequences

- `ui-sidebar` gains one public list slot; the shell keeps no navigation state, and `SidebarNavOwnerProps` (`wide`) is the only column fact a registrant receives, so each entry supplies its own rail presentation.
- The workbench's former `Workbench` entry, which cleared the current session and returned to the hero, is gone; the hero is reached by starting a new session, and the report page is reached from the hero's quick action rather than the primary navigation.
- `sidebar.footer.action` stays the footer-action seat (`ui-cordis` occupies it); both seats render in the expanded column and the rail.
- A deployment that composes out `ui-workbench` gets an empty navigation seat, and the shell renders no navigation rather than a fallback list.

## Verification

`packages/client/ui-sidebar` pins the seat: `apply.client.spec.tsx` asserts the `sidebar.nav` spec is `{ kind: 'list', scope: 'root' }` and is released on teardown, `sidebar-root.client.spec.tsx` asserts the seat renders directly after New Session and receives `wide`, and the sidebar snapshot spec pins both the expanded and the rail markup. `packages/client/ui-workbench` pins the entries: `nav-action.client.spec.tsx` covers the wide label and activation, the `aria-current` marker, the icon-only rail button, the team entry's role groups (default-open secretary children, per-role toggles, a capability child calling `openTeam`, the group chevron), and the faces (a page target toggling the open page, the Projects command revealing the sidebar, `openTeam` showing the team page without toggling); `browser-plugin.client.spec.ts` asserts the five entry ids in design order and their release on fiber teardown; `pages-view.client.spec.tsx` covers the Active-tasks filter and its idle empty note. The suites are keyless.
