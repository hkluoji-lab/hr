/**
 * Workbench plugin, browser half: the blank-session hero's
 * `conversation.hero.dashboard` entry (greeting, quick actions, team roster),
 * additive `sidebar.nav` entries (task hall, task assistant, active tasks, the
 * secretary-company clients page, AI team, projects, and the owner-only
 * members management), and the `shell.overlay` page surface they open. One controller backs all of them so
 * a nav entry and a hero shortcut drive the same page state, and the
 * right-Sidebar tabs read the same snapshots. The roster arrives through one
 * `agentPresets.list` Remote call, the caller's role binding through one
 * same-origin `/auth/status` read; quick actions drive the Workspace
 * navigation service, member cards stage the member's preset onto the blank
 * session the start creates, a written assignment additionally submits its
 * brief as that session's first message, and the report page reads and grants
 * credits through the host workbench Remote. Roster, nav role groups, and the
 * assignment picker scope to the caller's bound roles; the members page and
 * its nav row render only for the deployment owner.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the Session Controller service merge (ctx.sessions).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (the hero dashboard seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the right-Sidebar tab registry merge and its tab SlotMap seat.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the two brand seats).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { SidebarBrandMark, SidebarBrandName } from './SidebarBrand.tsx'
import { WorkbenchDashboard } from './WorkbenchDashboard.tsx'
import type { WorkbenchInjected } from './WorkbenchDashboard.tsx'
import { WorkbenchNavAction, navActionFace, type WorkbenchNavTarget } from './WorkbenchNavAction.tsx'
import { WorkbenchShell, createTaskRowsHook, type WorkbenchShellInjected } from './WorkbenchShell.tsx'
import {
  CREDITS_ID, DELIVERABLES_ID, PROGRESS_ID, TEAM_STATUS_ID,
  creditsDefinition, deliverablesDefinition, progressDefinition, teamStatusDefinition,
} from './tabs/tab-definitions.ts'
import { creditsFace, deliverablesFace, progressFace, teamStatusFace } from './tabs/tab-face.ts'
import { CreditsTab } from './tabs/CreditsTab.tsx'
import { DeliverablesTab } from './tabs/DeliverablesTab.tsx'
import { ProgressTab } from './tabs/ProgressTab.tsx'
import { TeamStatusTab } from './tabs/TeamStatusTab.tsx'
import { WorkbenchController } from './workbench-store.ts'
import { en, NS, zh, type WorkbenchKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Workbench dashboard copy. */
    'workbench': WorkbenchKey
  }
}

export type { WorkbenchDashboardProps, WorkbenchInjected } from './WorkbenchDashboard.tsx'
export type { WorkbenchNavActionProps, WorkbenchNavInjected, WorkbenchNavTarget } from './WorkbenchNavAction.tsx'
export type { WorkbenchShellProps, WorkbenchShellInjected } from './WorkbenchShell.tsx'
export type {
  ClientsState, InviteOutcome, LedgerState, MembersState, MonthReport, MutationOutcome, MyStatus,
  TaskRow, WorkbenchPageId, WorkbenchPagesState,
} from './workbench-store.ts'
export type { TeamMember, TeamMemberState, WorkbenchState } from './workbench-store.ts'
export type { CreditsTabProps } from './tabs/CreditsTab.tsx'
export type { DeliverablesTabProps } from './tabs/DeliverablesTab.tsx'
export type { ProgressTabProps } from './tabs/ProgressTab.tsx'
export type { TeamStatusTabProps } from './tabs/TeamStatusTab.tsx'

/** Required services (cordis fiber inject). */
export const inject = [
  'slots', 'locale', 'remote', 'remote.agentPresets', 'remote.workbench',
  'sessions', 'uiWorkspace', 'layout', 'sidebarRightTabs',
]

/** Sidebar nav entries in the design's display order; each id is `workbench-<target>`. */
const NAV_TARGETS: readonly WorkbenchNavTarget[] = ['hall', 'assistant', 'active', 'clients', 'team', 'projects', 'members']

/**
 * Mount the workbench dashboard on the blank-session hero.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workbench: dictionaries')

  // One data owner for every workbench surface: the hero, the page surface,
  // and the deployment-wide right-Sidebar tabs all read these snapshots.
  const controller = new WorkbenchController(ctx)

  // Session-scoped right-Sidebar pages: session deliverables (files the
  // session produced), subtask progress (its subagent children), the
  // deployment's credits, and the AI team's live state. The tab bodies mount
  // in the keyed `sidebar.right.pane.tab` seat, so they exist only while a
  // Session is open — never on the blank-session hero.
  ctx.inject(['slots', 'locale', 'sidebarRightTabs', 'sessions'], (scope: ClientContext) => {
    const t = scope.locale.bind(NS)
    scope.effect(() => scope.sidebarRightTabs.register(deliverablesDefinition(t)), 'ui-workbench: deliverables type')
    scope.effect(() => scope.sidebarRightTabs.register(progressDefinition(t)), 'ui-workbench: progress type')
    scope.effect(() => scope.sidebarRightTabs.register(creditsDefinition(t)), 'ui-workbench: credits type')
    scope.effect(() => scope.sidebarRightTabs.register(teamStatusDefinition(t)), 'ui-workbench: team status type')
    scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register(
      { name: 'sidebar.right.pane.tab', key: DELIVERABLES_ID, locale: NS, inject: deliverablesFace(scope) },
      DeliverablesTab,
    )), 'ui-workbench: deliverables tab body')
    scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register(
      { name: 'sidebar.right.pane.tab', key: PROGRESS_ID, locale: NS, inject: progressFace(scope) },
      ProgressTab,
    )), 'ui-workbench: progress tab body')
    scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register(
      { name: 'sidebar.right.pane.tab', key: CREDITS_ID, locale: NS, inject: creditsFace(controller) },
      CreditsTab,
    )), 'ui-workbench: credits tab body')
    scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register(
      { name: 'sidebar.right.pane.tab', key: TEAM_STATUS_ID, locale: NS, inject: teamStatusFace(controller) },
      TeamStatusTab,
    )), 'ui-workbench: team status tab body')
  })

  // Deployment branding: replace the sidebar shell's fish/generic-text brand
  // fallbacks with the design's 星躍智 tile and wordmark (text placeholders
  // until image assets land). The `single` slots exist in both the expanded
  // brand row and the collapsed rail, so one registration covers both.
  ctx.inject(['slots'], (scope: ClientContext) => {
    scope.effect(() => scope.slots.register({
      name: 'sidebar.brand.mark',
      locale: NS,
    }, SidebarBrandMark), 'ui-workbench: sidebar brand mark')
    scope.effect(() => scope.slots.register({
      name: 'sidebar.brand.name',
      locale: NS,
    }, SidebarBrandName), 'ui-workbench: sidebar brand name')
  })

  // The sidebar nav, the frame-wide page surface, and the hero dashboard share
  // the controller above, so a nav entry and a hero shortcut open the same page.
  ctx.inject(['slots', 'conversation', 'sessions', 'uiWorkspace', 'layout'], (scope: ClientContext) => {
    // Rows are cached between Session-list snapshots; the hook must be built
    // once so that stable reference survives every render.
    const useTasks = createTaskRowsHook(scope)

    const heroInjected = (): WorkbenchInjected => ({
      hooks: { workbench: controller.store },
      load: () => controller.load(),
      startTask: () => { controller.startTask() },
      startWithPreset: (id: string) => { controller.startWithPreset(id) },
      viewProjects: () => { controller.viewProjects() },
      openPage: (page) => { controller.openPage(page) },
    })

    const shellInjected = (): WorkbenchShellInjected => ({
      hooks: {
        pages: controller.pages,
        workbench: controller.store,
        ledger: controller.ledger,
        members: controller.members,
        clients: controller.clients,
      },
      useTasks,
      load: () => controller.load(),
      loadLedger: () => controller.loadLedger(),
      loadMembers: () => controller.loadMembers(),
      loadClients: () => controller.loadClients(),
      close: () => { controller.closePage() },
      openSession: (id) => { controller.openSession(id) },
      startWithPreset: (id: string) => { controller.startWithPreset(id) },
      assignTask: (presetId, brief) => { controller.assignTask(presetId, brief) },
      grantCredits: (amount, reason) => controller.grantCredits(amount, reason),
      createInvite: roles => controller.createInvite(roles),
      unbindMember: phone => controller.unbindMember(phone),
      assignMember: (phone, roles) => controller.assignMember(phone, roles),
      deleteAccount: phone => controller.deleteAccount(phone),
      addClient: payload => controller.addClient(payload),
      removeClient: id => controller.removeClient(id),
      addObligation: payload => controller.addObligation(payload),
      markObligation: (id, status) => controller.markObligation(id, status),
      removeObligation: id => controller.removeObligation(id),
      addDelivery: payload => controller.addDelivery(payload),
      markDelivery: (id, status) => controller.markDelivery(id, status),
      removeDelivery: id => controller.removeDelivery(id),
      recordFollowUp: payload => controller.recordFollowUp(payload),
    })

    scope.effect(() => {
      // A preset composed from another surface (settings, the hero chip)
      // moves team states; reconnect re-reads the roster too.
      const refresh = (): void => { void controller.load() }
      const offReset = scope.on('connection/reset', refresh)
      const stopSessions = scope.sessions.list.subscribe(() => {
        // Session presence decides busy vs online; refold on roster change
        // only when already loaded once to avoid racing the initial read.
        if (controller.store.getSnapshot().status !== 'idle') void controller.load()
      })
      const dispose = scope.slots.register({
        name: 'conversation.hero.dashboard',
        id: 'workbench',
        locale: NS,
        inject: heroInjected,
      }, WorkbenchDashboard)
      return () => {
        offReset()
        stopSessions()
        dispose()
      }
    }, 'ui-workbench: hero dashboard')

    // Additive sidebar navigation entries — one per workbench surface, in the
    // design's order. They take the `sidebar.nav` list, so the sidebar shell
    // keeps its brand row, New Session control, and browsing region.
    scope.effect(() => scope.slots.inject('sidebar.nav', function* () {
      for (const [order, target] of NAV_TARGETS.entries()) {
        yield scope.slots.register({
          name: 'sidebar.nav',
          id: `workbench-${target}`,
          order,
          locale: NS,
          inject: () => navActionFace(controller, target),
        }, WorkbenchNavAction)
      }
    }), 'ui-workbench: sidebar nav')

    // Frame-wide page surface: the sidebar nav opens one page at a time; a
    // closed state renders nothing, keeping the overlay layer click-through.
    scope.effect(() => scope.slots.register({
      name: 'shell.overlay',
      id: 'workbench-pages',
      locale: NS,
      inject: shellInjected,
    }, WorkbenchShell), 'ui-workbench: page surface')
  })
}

