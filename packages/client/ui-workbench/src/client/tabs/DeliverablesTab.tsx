/**
 * Deliverables tab body: every file the current Session successfully produced,
 * deduplicated in first-seen order across all of its turns.
 *
 * The path fold is ui-deliverables' vocabulary (delivered through the injected
 * Hook); this component only renders rows and turns a click into the owner
 * Sidebar's `openResource` with the same session-relative address the Files tab
 * uses. A Session with no successful mutation shows one empty-state line.
 */
import type { ReactNode } from 'react'
import {
  DocumentFileIcon, IconDataOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProducedFileEntry } from '@deepseek-ai/dsh-client-ui-deliverables/client'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { DeliverablesInjected } from './tab-face.ts'
import type {} from '../locales.ts'
import css from './WorkbenchTabs.module.css'

/** The body's composed props: the tab seat, its face, and its copy. */
export type DeliverablesTabProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & DeliverablesInjected
  & PropsLocale<'workbench'>

/** Session deliverables: produced file chips over the live event fold. */
export function DeliverablesTab({
  useProducedPaths, useTabInfo, sessionId, useSessions, t,
}: DeliverablesTabProps): ReactNode {
  const paths = useProducedPaths()
  const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
  const { tab } = useTabInfo()
  const body = paths.length === 0
    ? <p className={css.empty}>{t('tab.deliverables.empty')}</p>
    : (
      <ul className={css.list}>
        {paths.map((file: ProducedFileEntry) => {
          const open = (): void => { tab.actions.openResource(fileAddressFor(sessionId, cwd, file.path)) }
          return (
            <li key={file.path} className={css.item}>
              <button
                type="button"
                className={css.row}
                title={file.path}
                aria-label={t('tab.deliverables.open', { name: file.path })}
                onClick={open}
              >
                <DocumentFileIcon className={css.rowIcon} />
                <span className={css.rowName}>{file.name}</span>
              </button>
            </li>
          )
        })}
      </ul>
    )
  return (
    <div className={css.root} data-workbench-tab="deliverables">
      <div className={css.header}>
        <IconDataOutline16 className={css.headerIcon} />
        <span>{t('tab.deliverables.type')}</span>
      </div>
      {body}
    </div>
  )
}
