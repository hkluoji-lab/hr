/**
 * The workbench page surface: one `shell.overlay` entry rendering whichever
 * page the sidebar nav opened — the task hall, the task assistant, the active
 * tasks, the secretary-company clients page, the AI team, the month report, or
 * the owner's member management — over the whole frame. Closed state renders
 * null, so the overlay layer stays click-through until a page is open. Escape
 * and the header's close control both dismiss. The members page renders only
 * for the deployment owner.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  WorkbenchClientCreate, WorkbenchDeliveryChannel, WorkbenchDeliveryStatus, WorkbenchFollowUpCreate,
  WorkbenchObligationCreate,
} from '@deepseek-ai/dsh-workbench/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-layout SlotMap merge (the frame-wide overlay seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  monthReport,
  taskRows,
  type ClientsState,
  type InviteOutcome,
  type LedgerState,
  type MembersState,
  type MutationOutcome,
  type TaskRow,
  type WorkbenchPageId,
  type WorkbenchPagesState,
  type WorkbenchState,
} from './workbench-store.ts'
import { AssistantPage } from './pages/AssistantPage.tsx'
import { ClientsPage } from './pages/ClientsPage.tsx'
import { MembersPage } from './pages/MembersPage.tsx'
import { ReportPage } from './pages/ReportPage.tsx'
import { TaskHallPage } from './pages/TaskHallPage.tsx'
import { TeamPage } from './pages/TeamPage.tsx'
import { NS, type WorkbenchKey } from './locales.ts'
import type { RoleId } from './roles.ts'
import css from './WorkbenchShell.module.css'

/** Page title keys; each page reuses its nav label. */
const TITLES: Record<WorkbenchPageId, WorkbenchKey> = {
  hall: 'nav.hall',
  assistant: 'nav.assistant',
  active: 'nav.active',
  clients: 'nav.clients',
  team: 'nav.team',
  report: 'nav.report',
  members: 'nav.members',
}

/** Page subtitle keys. */
const SUBTITLES: Record<WorkbenchPageId, WorkbenchKey> = {
  hall: 'hall.subtitle',
  assistant: 'assistant.subtitle',
  active: 'active.subtitle',
  clients: 'clients.subtitle',
  team: 'team.subtitle',
  report: 'report.subtitle',
  members: 'members.subtitle',
}

/** Registration-side business face for the page surface. */
export interface WorkbenchShellInjected {
  hooks: {
    /** Open-page snapshot bound by the renderer as usePages. */
    pages: SnapshotStore<WorkbenchPagesState>
    /** Team and credits snapshot bound by the renderer as useWorkbench. */
    workbench: SnapshotStore<WorkbenchState>
    /** Credits-ledger snapshot bound by the renderer as useLedger. */
    ledger: SnapshotStore<LedgerState>
    /** Member-roster snapshot bound by the renderer as useMembers. */
    members: SnapshotStore<MembersState>
    /** Clients-page snapshot bound by the renderer as useClients. */
    clients: SnapshotStore<ClientsState>
  }
  /** Hall rows folded from the Session list; stable between list updates. */
  useTasks: () => readonly TaskRow[]
  /** Read the roster and the balance when a page opens. */
  load: () => Promise<void>
  /** Read the bounded ledger. */
  loadLedger: () => Promise<void>
  /** Read the member roster. */
  loadMembers: () => Promise<void>
  /** Read the client master, the obligation ledger, and the schedule. */
  loadClients: () => Promise<void>
  /** Create one client master row. */
  addClient: (payload: WorkbenchClientCreate) => Promise<MutationOutcome>
  /** Remove one client master row; its obligations go with it. */
  removeClient: (id: string) => Promise<MutationOutcome>
  /** Record one filing obligation against a client. */
  addObligation: (payload: WorkbenchObligationCreate) => Promise<MutationOutcome>
  /** Move one obligation between `open` and `submitted`. */
  markObligation: (id: string, status: 'open' | 'submitted') => Promise<MutationOutcome>
  /** Remove one obligation row. */
  removeObligation: (id: string) => Promise<MutationOutcome>
  /** Record one signature delivery against a client. */
  addDelivery: (payload: { clientId: string; title: string; channel: WorkbenchDeliveryChannel }) => Promise<MutationOutcome>
  /** Move one delivery along its lifecycle. */
  markDelivery: (id: string, status: WorkbenchDeliveryStatus) => Promise<MutationOutcome>
  /** Remove one delivery row. */
  removeDelivery: (id: string) => Promise<MutationOutcome>
  /** Log one follow-up reminder against an open delivery or obligation. */
  recordFollowUp: (payload: WorkbenchFollowUpCreate) => Promise<MutationOutcome>
  /** Close the open page. */
  close: () => void
  /** Select a session as current and leave the page. */
  openSession: (id: SessionId) => void
  /** Start a session composed for one member's preset, then leave the page. */
  startWithPreset: (id: string) => void
  /** Start a session for one written brief, then leave the page. */
  assignTask: (presetId: string | undefined, brief: string) => void
  /** Grant points; resolves to the host failure message, or null on success. */
  grantCredits: (amount: number, reason: string) => Promise<string | null>
  /** Create one member invite. */
  createInvite: (roles: readonly RoleId[]) => Promise<InviteOutcome>
  /** Unbind one member's roles; resolves to the host failure message, or null. */
  unbindMember: (phone: string) => Promise<string | null>
  /** Assign one registered account its whole role set; resolves to the failure message, or null. */
  assignMember: (phone: string, roles: readonly RoleId[]) => Promise<string | null>
  /** Delete one registered account; resolves to the host failure message, or null. */
  deleteAccount: (phone: string) => Promise<string | null>
}

/** Full component props. */
export type WorkbenchShellProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & InjectFace<WorkbenchShellInjected>

/**
 * Build the hall's task-row hook. Rows are recomputed only when the Session
 * list snapshot changes, so `useSyncExternalStore` sees a stable reference
 * between list updates.
 * @param ctx - the browser plugin context carrying the Session Controller.
 * @returns a hook reading the current task rows.
 */
export function createTaskRowsHook(ctx: ClientContext): () => readonly TaskRow[] {
  let source: SessionListState | undefined
  let rows: readonly TaskRow[] = []
  const read = (): readonly TaskRow[] => {
    const snapshot = ctx.sessions.list.getSnapshot()
    if (snapshot !== source) {
      source = snapshot
      rows = taskRows(snapshot)
    }
    return rows
  }
  return () => useSyncExternalStore(listener => ctx.sessions.list.subscribe(listener), read)
}

/**
 * Render the workbench page surface.
 * @param props - the page stores plus the page actions.
 * @returns the page element tree, or null while no page is open.
 */
export function WorkbenchShell({
  usePages, useWorkbench, useLedger, useMembers, useClients, useTasks,
  load, loadLedger, loadMembers, loadClients, close, openSession, startWithPreset, assignTask,
  grantCredits, createInvite, unbindMember, assignMember, deleteAccount,
  addClient, removeClient, addObligation, markObligation, removeObligation,
  addDelivery, markDelivery, removeDelivery, recordFollowUp, t,
}: WorkbenchShellProps) {
  const open = usePages(snapshot => snapshot.open)
  const team = useWorkbench(snapshot => snapshot)
  const ledger = useLedger(snapshot => snapshot)
  const roster = useMembers(snapshot => snapshot)
  const clientsPage = useClients(snapshot => snapshot)
  const tasks = useTasks()

  useEffect(() => {
    if (open === null) return
    void load()
    if (open === 'report') void loadLedger()
    if (open === 'members') void loadMembers()
    if (open === 'clients') void loadClients()
  }, [open, load, loadLedger, loadMembers, loadClients])

  useEffect(() => {
    if (open === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, close])

  if (open === null) return null

  const now = Date.now()
  return (
    <div className={css.root} role="region" aria-label={t(TITLES[open])}>
      <header className={css.header}>
        <div className={css.heading}>
          <h2 className={css.title}>{t(TITLES[open])}</h2>
          {(open !== 'members' || team.my.isOwner)
            && <p className={css.subtitle}>{t(SUBTITLES[open])}</p>}
        </div>
        <button type="button" className={css.close} aria-label={t('shell.close')} onClick={() => { close() }}>
          <IconCloseOutline16 size={16} />
        </button>
      </header>
      <div className={css.body}>
        {open === 'hall' && (
          <TaskHallPage tasks={tasks} members={team.members} now={now} onOpen={openSession} t={t} />
        )}
        {open === 'active' && (
          <TaskHallPage
            tasks={tasks.filter(task => task.status === 'running')}
            members={team.members}
            now={now}
            onOpen={openSession}
            emptyKey="active.empty"
            t={t}
          />
        )}
        {open === 'assistant' && (
          <AssistantPage state={team} onAssign={assignTask} t={t} />
        )}
        {open === 'clients' && (
          <ClientsPage
            clients={clientsPage}
            onAddClient={addClient}
            onRemoveClient={removeClient}
            onAddObligation={addObligation}
            onMarkObligation={markObligation}
            onRemoveObligation={removeObligation}
            onAddDelivery={addDelivery}
            onMarkDelivery={markDelivery}
            onRemoveDelivery={removeDelivery}
            onRecordFollowUp={recordFollowUp}
            t={t}
          />
        )}
        {open === 'team' && (
          <TeamPage state={team} onStart={startWithPreset} t={t} />
        )}
        {open === 'report' && (
          <ReportPage
            ledger={ledger}
            report={monthReport(tasks, ledger.entries, now)}
            credits={team.credits}
            now={now}
            onGrant={grantCredits}
            t={t}
          />
        )}
        {open === 'members' && team.my.isOwner && (
          <MembersPage
            members={roster}
            onCreate={createInvite}
            onUnbind={unbindMember}
            onAssign={assignMember}
            onDelete={deleteAccount}
            t={t}
          />
        )}
      </div>
    </div>
  )
}
