/**
 * The hero's right-side card stack: bounty credits, AI-team presence, task
 * progress, and deliverables. The app frame only mounts the right column for
 * an open session, so on the blank-session hero this stack is the hero grid's
 * second column on wide viewports and stays hidden on narrow ones. Presence
 * and the credits balance read the shared workbench snapshot; the month-left
 * figure, progress rows, and deliverables are typed placeholders
 * (hero-demo.ts) reproducing the design pending their data seams, and carry a
 * demo-data chip so they never read as live numbers.
 */
import type { ReactNode } from 'react'
import { IconChevronDownOutline14, IconDownloadOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import {
  DEMO_CREDITS_MONTH_LEFT, DEMO_DELIVERABLE_KEYS, DEMO_PROGRESS,
} from './hero-demo.ts'
import type { TeamMemberState, WorkbenchState } from './workbench-store.ts'
import css from './HeroSideCards.module.css'

/** Props for the hero side stack. */
export interface HeroSideCardsProps {
  /** Presence counts and credits balance from the shared workbench snapshot. */
  state: Pick<WorkbenchState, 'online' | 'busy' | 'offline' | 'credits'>
  /** Namespace-bound translate. */
  t: TranslateNS<'workbench'>
}

/** Presence rows in design order; the label keys stay latin in both locales. */
const STATUS_ROWS: ReadonlyArray<{ key: TeamMemberState; labelKey: 'right.team.online' | 'right.team.busy' | 'right.team.offline' }> = [
  { key: 'online', labelKey: 'right.team.online' },
  { key: 'busy', labelKey: 'right.team.busy' },
  { key: 'offline', labelKey: 'right.team.offline' },
]

/** Format a points amount with thousands separators. */
function points(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * Render the four stacked hero cards.
 * @param props - the snapshot slice and the translate seat.
 * @returns the hero grid's side-card column.
 */
export function HeroSideCards({ state, t }: HeroSideCardsProps): ReactNode {
  // The balance is the shared snapshot's number, or an em dash while the host
  // workbench service is unreachable; the month-left seam is still pending.
  const balance = state.credits
  const counts: Record<TeamMemberState, number> = {
    online: state.online, busy: state.busy, offline: state.offline,
  }
  return (
    <aside className={css.root} aria-label={t('right.credits.title')}>
      <section className={css.creditsCard} data-workbench-card="credits">
        <div className={css.creditsHead}>
          <span className={css.cardTitle}>{t('right.credits.title')}</span>
          <span className={css.minus} aria-hidden="true">−</span>
        </div>
        <div className={css.balanceValue}>{balance === null ? '—' : points(balance)}</div>
        <div className={css.creditsSub}>
          <span>{t('right.credits.available')}</span>
          <span className={css.dotSep} aria-hidden="true">·</span>
          <span>{t('right.credits.monthLeft', { n: balance === null ? '—' : points(DEMO_CREDITS_MONTH_LEFT) })}</span>
        </div>
        {balance === null && <span className={css.demoChip}>{t('right.credits.demo')}</span>}
      </section>

      <section className={css.card} data-workbench-card="team-status">
        <div className={css.cardHead}>
          <span className={css.cardTitle}>{t('right.team.title')}</span>
          <IconChevronDownOutline14 className={css.chevron} />
        </div>
        <ul className={css.statusList}>
          {STATUS_ROWS.map(row => (
            <li key={row.key} className={css.statusRow}>
              <span className={`${css.statusDot} ${css[row.key]}`} aria-hidden="true" />
              <span className={css.statusLabel}>{t(row.labelKey)}</span>
              <span className={css.statusCount}>{counts[row.key]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={css.card} data-workbench-card="progress">
        <div className={css.cardHead}>
          <span className={css.cardTitle}>{t('right.progress.title')}</span>
          <span className={css.demoChip}>{t('right.credits.demo')}</span>
        </div>
        <div className={css.progressList}>
          {DEMO_PROGRESS.map(row => (
            <div key={row.labelKey} className={css.progressRow}>
              <div className={css.progressLine}>
                <span className={css.progressLabel}>{t(row.labelKey)}</span>
                <span className={css.progressValue}>{row.percent}%</span>
              </div>
              <div className={css.progressTrack}>
                <div className={css.progressFill} style={{ width: `${row.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={css.card} data-workbench-card="deliverables">
        <div className={css.cardHead}>
          <span className={css.cardTitle}>{t('right.deliverables.title')}</span>
          <span className={css.demoChip}>{t('right.credits.demo')}</span>
        </div>
        <ul className={css.fileList}>
          {DEMO_DELIVERABLE_KEYS.map((key) => {
            const name = t(key)
            return (
              <li key={key}>
                <button
                  type="button"
                  className={css.fileRow}
                  aria-label={t('right.deliverables.download', { name })}
                  title={name}
                >
                  <span className={css.fileName}>{name}</span>
                  <IconDownloadOutline16 className={css.fileIcon} />
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </aside>
  )
}
