/**
 * The task hall page: every started session as one row — title, the preset
 * that runs it, its lifecycle, and how long ago it last moved. Clicking a row
 * selects that session and leaves the page.
 */
import { StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { timeLabel } from '../time-label.ts'
import type { TaskRow, TeamMember } from '../workbench-store.ts'
import type { WorkbenchKey } from '../locales.ts'
import css from './WorkbenchPages.module.css'

/** Everything the hall renders from. */
export interface TaskHallPageProps {
  /** Task rows, newest first. */
  tasks: readonly TaskRow[]
  /** Team roster, resolving a row's preset id to its display name. */
  members: readonly TeamMember[]
  /** Reference instant for the relative-time labels. */
  now: number
  /** Select one session and leave the hall. */
  onOpen: (id: SessionId) => void
  /** Empty-state key; the active-tasks page reuses this list for running rows. */
  emptyKey?: WorkbenchKey
  /** Namespace-bound translate. */
  t: TranslateNS<'workbench'>
}

/** Status-dot state per lifecycle: running chases, finished green, idle grey. */
function dotState(status: TaskRow['status']): StateDotState {
  switch (status) {
    case 'running': return 'ongoing'
    case 'done': return 'done'
    case 'idle': return 'idle'
  }
}

/**
 * Render the task hall.
 * @param props - rows, roster, clock, the open action, and the empty-state key.
 * @returns the row list, or the empty note when no task started.
 */
export function TaskHallPage({ tasks, members, now, onOpen, emptyKey = 'hall.empty', t }: TaskHallPageProps) {
  if (tasks.length === 0) return <p className={css.empty}>{t(emptyKey)}</p>
  const names = new Map(members.map(member => [member.id, member.name]))
  return (
    <ul className={css.taskList}>
      {tasks.map(task => (
        <li key={task.id}>
          <button type="button" className={css.taskRow} onClick={() => { onOpen(task.id) }}>
            <StateDot state={dotState(task.status)} className={css.taskDot} />
            <span className={css.taskTitle}>{task.title}</span>
            <span className={css.taskPreset}>
              {task.presetId === undefined ? t('hall.defaultTeam') : names.get(task.presetId) ?? task.presetId}
            </span>
            <span className={css.taskStatus}>{t(`hall.status.${task.status}`)}</span>
            <span className={css.taskTime}>{timeLabel(task.updatedAt, now, t)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
