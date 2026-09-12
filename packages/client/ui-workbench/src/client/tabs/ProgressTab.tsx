/**
 * Progress tab body: the current Session's subtask members.
 *
 * The child roster comes from the Session list store — rows whose origin is a
 * subagent of the mounted Session — in the store's own order. Each row is a
 * navigation button into that child Session, mirroring the workflow panel's
 * gesture. Running state is the only lifecycle split the list exposes
 * cheaply, so the dot and label distinguish working vs settled members.
 */
import type { ReactNode } from 'react'
import { IconBranchOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import { shallowEqual } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ProgressInjected } from './tab-face.ts'
import type {} from '../locales.ts'
import css from './WorkbenchTabs.module.css'

/** The body's composed props: the tab seat, its face, and its copy. */
export type ProgressTabProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & ProgressInjected
  & PropsLocale<'workbench'>

/**
 * Select one Session's subagent children in store order. The summaries
 * themselves are returned, so the tab renders each row from a defined record
 * and `shallowEqual` can keep the selection stable between list snapshots.
 * @param sessions - the Session list snapshot.
 * @param parentId - the mounted parent Session.
 * @returns subagent-origin summaries whose parent is `parentId`.
 */
export function selectSubagentChildren(
  sessions: SessionListState,
  parentId: SessionId,
): readonly SessionSummary[] {
  const children: SessionSummary[] = []
  for (const id of sessions.ids) {
    const summary = sessions.byId[id]
    if (summary === undefined || summary.origin !== 'subagent' || summary.parentId !== parentId) continue
    children.push(summary)
  }
  return children
}

/** Subtask progress: child Sessions of the mounted Session, each navigable. */
export function ProgressTab({
  openSession, sessionId, useSessions, t,
}: ProgressTabProps): ReactNode {
  const children = useSessions(
    sessions => selectSubagentChildren(sessions, sessionId),
    shallowEqual,
  )
  const body = children.length === 0
    ? <p className={css.empty}>{t('tab.progress.empty')}</p>
    : (
      <ul className={css.list}>
        {children.map(child => (
          <li key={child.id} className={css.item}>
            <button
              type="button"
              className={css.row}
              aria-label={t('tab.progress.open', { name: child.displayTitle })}
              onClick={() => { openSession(child.id) }}
            >
              <span className={css.dotSlot}><StateDot state={child.running ? 'ongoing' : 'done'} /></span>
              <span className={css.rowName}>{child.displayTitle}</span>
              <span className={css.rowStatus} data-progress-running={child.running}>
                {child.running ? t('tab.progress.running') : t('tab.progress.done')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  return (
    <div className={css.root} data-workbench-tab="progress">
      <div className={css.header}>
        <IconBranchOutline16 className={css.headerIcon} />
        <span>{t('tab.progress.type')}</span>
      </div>
      {body}
    </div>
  )
}
