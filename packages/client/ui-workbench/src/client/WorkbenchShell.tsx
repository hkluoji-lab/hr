/**
 * The workbench page surface: one `shell.overlay` entry rendering whichever
 * page the sidebar nav opened — the task hall, the task assistant, the active
 * tasks, the AI team, the month report, or the owner's member management —
 * beside the frame's sidebar, which stays visible and clickable (the 3088
 * conversation work mode). Closed state renders null, so the overlay layer
 * stays click-through until a page is open. Escape and the header's close
 * control both dismiss. The members page renders only for the deployment
 * owner.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
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
  type TaskRow,
  type WorkbenchPageId,
  type WorkbenchPagesState,
  type WorkbenchState,
} from './workbench-store.ts'
import { AssistantPage } from './pages/AssistantPage.tsx'
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
  team: 'nav.team',
  report: 'nav.report',
  members: 'nav.members',
}

/** Page subtitle keys. */
const SUBTITLES: Record<WorkbenchPageId, WorkbenchKey> = {
  hall: 'hall.subtitle',
  assistant: 'assistant.subtitle',
  active: 'active.subtitle',
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
    /** Client-data snapshot bound by the renderer as useClients. */
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
  /** Read the client data the team page folds into each role's pending line. */
  loadClients: () => Promise<void>
  /** Close the open page. */
  close: () => void
  /** Start a fresh default-composition task and leave the page. */
  startTask: () => void
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
 * The sidebar-tracked left offset of the open page: the frame's first grid
 * track width, so the page starts at the sidebar's right edge and the sidebar
 * stays visible and clickable behind it. The page edge rides the track's
 * animated width (collapse, rail, drag) by observing the sidebar column, whose
 * per-frame resize drives a rAF-throttled re-measure of the resolved
 * `grid-template-columns`. A bare render (tests, unexpected DOM) keeps the
 * full-bleed fallback at 0.
 * @param open - the currently open page, or null when closed.
 * @returns the page root ref and the left offset in px.
 */
function useSidebarOffset(open: WorkbenchPageId | null): { rootRef: RefObject<HTMLDivElement>; offset: number } {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [offset, setOffset] = useState(0)
  useLayoutEffect(() => {
    if (open === null) return
    // The page root's ancestors are the slot wrapper → the overlay layer → the
    // frame (AppFrame's grid). The frame is the nearest ancestor whose grid
    // resolves to a multi-track column layout, so finding it by layout rather
    // than a fixed hop count survives slot-wrapper changes.
    let frame = rootRef.current?.parentElement ?? null
    while (frame !== null && frame !== document.body) {
      if (getComputedStyle(frame).gridTemplateColumns.split(' ').length > 1) break
      frame = frame.parentElement
    }
    if (frame === null || frame === document.body) return
    let raf: number | null = null
    const measure = (): void => {
      const first = Number.parseFloat(getComputedStyle(frame).gridTemplateColumns)
      setOffset(Number.isFinite(first) ? first : 0)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        measure()
      })
    })
    const sidebar = frame.firstElementChild
    if (sidebar !== null) observer.observe(sidebar)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [open])
  return { rootRef, offset }
}

/**
 * Render the workbench page surface.
 * @param props - the page stores plus the page actions.
 * @returns the page element tree, or null while no page is open.
 */
export function WorkbenchShell({
  usePages, useWorkbench, useLedger, useMembers, useClients, useTasks,
  load, loadLedger, loadMembers, loadClients, close, startTask, openSession, startWithPreset, assignTask,
  grantCredits, createInvite, unbindMember, assignMember, deleteAccount, t,
}: WorkbenchShellProps) {
  const open = usePages(snapshot => snapshot.open)
  const team = useWorkbench(snapshot => snapshot)
  const ledger = useLedger(snapshot => snapshot)
  const roster = useMembers(snapshot => snapshot)
  const clientsPage = useClients(snapshot => snapshot)
  const tasks = useTasks()
  const { rootRef, offset } = useSidebarOffset(open)

  useEffect(() => {
    if (open === null) return
    void load()
    if (open === 'report') void loadLedger()
    if (open === 'members') void loadMembers()
    if (open === 'team') void loadClients()
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
    <div
      ref={rootRef}
      className={css.root}
      role="region"
      aria-label={t(TITLES[open])}
      style={{ left: offset }}
    >
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
          <TaskHallPage
            tasks={tasks}
            members={team.members}
            now={now}
            onOpen={openSession}
            onStartTask={startTask}
            t={t}
          />
        )}
        {open === 'active' && (
          <TaskHallPage
            tasks={tasks.filter(task => task.status === 'running')}
            members={team.members}
            now={now}
            onOpen={openSession}
            onStartTask={startTask}
            emptyKey="active.empty"
            t={t}
          />
        )}
        {open === 'assistant' && (
          <AssistantPage state={team} onAssign={assignTask} t={t} />
        )}
        {open === 'team' && (
          <TeamPage state={team} clients={clientsPage} onStart={startWithPreset} onAction={assignTask} t={t} />
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
