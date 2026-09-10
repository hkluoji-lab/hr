/**
 * Credits tab body: the deployment's balance above its most recent grants.
 *
 * The tab is deployment-wide, so it reads the controller snapshots the hero
 * and the report page already share instead of holding a second answer. Both
 * reads start when the tab first renders and are skipped once either has been
 * settled, so reopening the tab shows the previous answer immediately.
 */
import { useEffect, type ReactNode } from 'react'
import { IconGoalOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { timeLabel } from '../time-label.ts'
import type { CreditsInjected } from './tab-face.ts'
import type {} from '../locales.ts'
import css from './WorkbenchTabs.module.css'

/** The body's composed props: the tab seat, its face, and its copy. */
export type CreditsTabProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & InjectFace<CreditsInjected>
  & PropsLocale<'workbench'>

/**
 * Render the deployment's credits balance and its recent grants.
 * @param props - the two snapshots, their reads, and the tab copy.
 * @returns the balance line and the ledger list.
 */
export function CreditsTab({
  useWorkbench, useLedger, load, loadLedger, t,
}: CreditsTabProps): ReactNode {
  const state = useWorkbench(snapshot => snapshot)
  const ledger = useLedger(snapshot => snapshot)

  useEffect(() => {
    if (state.status === 'idle') void load()
  }, [state.status, load])

  useEffect(() => {
    if (ledger.status === 'idle') void loadLedger()
  }, [ledger.status, loadLedger])

  const reading = state.status === 'idle' || state.status === 'loading'
  const now = Date.now()
  return (
    <div className={css.root} data-workbench-tab="credits">
      <div className={css.header}>
        <IconGoalOutline16 className={css.headerIcon} />
        <span>{t('tab.credits.type')}</span>
      </div>
      {reading
        ? <p className={css.empty}>{t('tab.credits.loading')}</p>
        : (
          <>
            {state.status === 'error' && state.error !== null
              ? <p className={css.empty} role="alert">{t('tab.credits.error', { message: state.error })}</p>
              : state.credits === null
                ? <p className={css.empty}>{t('tab.credits.unavailable')}</p>
                : (
                  <p className={css.balance}>
                    {t('tab.credits.balance')}
                    <span className={css.balanceValue}>{state.credits}</span>
                  </p>
                )}
            {ledger.status === 'error' && ledger.error !== null
              ? <p className={css.empty} role="alert">{t('tab.credits.error', { message: ledger.error })}</p>
              : ledger.entries.length === 0
                ? <p className={css.empty}>{t('tab.credits.empty')}</p>
                : (
                  <ul className={css.list}>
                    {ledger.entries.map(entry => (
                      <li key={entry.id} className={css.entry}>
                        <span className={css.entryAmount}>+{entry.amount}</span>
                        <span className={css.entryReason}>{entry.reason}</span>
                        <span className={css.entryTime}>{timeLabel(entry.at, now, t)}</span>
                      </li>
                    ))}
                  </ul>
                )}
          </>
        )}
    </div>
  )
}
