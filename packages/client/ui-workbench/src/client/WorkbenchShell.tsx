/**
 * The workbench page surface: one `shell.overlay` entry rendering whichever
 * page the sidebar nav opened — the task hall, the task assistant, the active
 * tasks, the AI team, or the month report — over the whole frame. Closed state
 * renders null, so the overlay layer stays click-through until a page is open.
 * Escape and the header's close control both dismiss.
 */
import { useEffect, useSyncExternalStore } from 'react'
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
  type LedgerState,
  type TaskRow,
  type WorkbenchPageId,
  type WorkbenchPagesState,
  type WorkbenchState,
} from './workbench-store.ts'
import { AssistantPage } from './pages/AssistantPage.tsx'
import { ReportPage } from './pages/ReportPage.tsx'
import { TaskHallPage } from './pages/TaskHallPage.tsx'
import { TeamPage } from './pages/TeamPage.tsx'
import { NS, type WorkbenchKey } from './locales.ts'
import css from './WorkbenchShell.module.css'

/** Page title keys; each page reuses its nav label. */
const TITLES: Record<WorkbenchPageId, WorkbenchKey> = {
  hall: 'nav.hall',
  assistant: 'nav.assistant',
  active: 'nav.active',
  team: 'nav.team',
  report: 'nav.report',
}

/** Page subtitle keys. */
const SUBTITLES: Record<WorkbenchPageId, WorkbenchKey> = {
  hall: 'hall.subtitle',
  assistant: 'assistant.subtitle',
  active: 'active.subtitle',
  team: 'team.subtitle',
  report: 'report.subtitle',
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
  }
  /** Hall rows folded from the Session list; stable between list updates. */
  useTasks: () => readonly TaskRow[]
  /** Read the roster and the balance when a page opens. */
  load: () => Promise<void>
  /** Read the bounded ledger. */
  loadLedger: () => Promise<void>
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
  usePages, useWorkbench, useLedger, useTasks,
  load, loadLedger, close, openSession, startWithPreset, assignTask, grantCredits, t,
}: WorkbenchShellProps) {
  const open = usePages(snapshot => snapshot.open)
  const team = useWorkbench(snapshot => snapshot)
  const ledger = useLedger(snapshot => snapshot)
  const tasks = useTasks()

  useEffect(() => {
    if (open === null) return
    void load()
    if (open === 'report') void loadLedger()
  }, [open, load, loadLedger])

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
          <p className={css.subtitle}>{t(SUBTITLES[open])}</p>
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
      </div>
    </div>
  )
}
