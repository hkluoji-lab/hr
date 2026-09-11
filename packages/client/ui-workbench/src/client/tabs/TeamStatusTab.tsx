/**
 * Team-status tab body: how many AI team members are online, working, or
 * offline, then the roster itself.
 *
 * The tab is deployment-wide, so it reads the controller snapshot the hero and
 * the team page already share. Member state is the same fold those surfaces
 * show, and the list presents the company's role roster — the same
 * `roleMembers` fold — so mode and other non-role presets stay out of the
 * team's status; the tab only renders it in a narrower column.
 */
import { useEffect, type ReactNode } from 'react'
import { IconAgentPresetOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { memberDotState, roleMembers, type TeamMemberState } from '../workbench-store.ts'
import type { TeamStatusInjected } from './tab-face.ts'
import type {} from '../locales.ts'
import css from './WorkbenchTabs.module.css'

/** The three member states the counts row tallies, in display order. */
const COUNTED_STATES: readonly TeamMemberState[] = ['online', 'busy', 'offline']

/** The body's composed props: the tab seat, its face, and its copy. */
export type TeamStatusTabProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & InjectFace<TeamStatusInjected>
  & PropsLocale<'workbench'>

/**
 * Render the AI team's live state.
 * @param props - the roster snapshot, its read, and the tab copy.
 * @returns the state counts and the member list.
 */
export function TeamStatusTab({ useWorkbench, load, t }: TeamStatusTabProps): ReactNode {
  const state = useWorkbench(snapshot => snapshot)
  const roster = roleMembers(state.members)

  useEffect(() => {
    if (state.status === 'idle') void load()
  }, [state.status, load])

  const body = state.status === 'error' && state.error !== null
    ? <p className={css.empty} role="alert">{t('tab.team.error', { message: state.error })}</p>
    : state.status === 'idle' || state.status === 'loading'
      ? <p className={css.empty}>{t('tab.team.loading')}</p>
      : roster.length === 0
        ? <p className={css.empty}>{t('tab.team.empty')}</p>
        : (
          <>
            <div className={css.counts}>
              {COUNTED_STATES.map((memberState) => {
                const count = memberState === 'online'
                  ? state.online
                  : memberState === 'busy' ? state.busy : state.offline
                return (
                  <span key={memberState} className={css.count}>
                    <StateDot state={memberDotState(memberState)} />
                    <span className={css.countValue}>{count}</span>
                    <span className={css.countLabel}>{t(`status.${memberState}`)}</span>
                  </span>
                )
              })}
            </div>
            <ul className={css.list}>
              {roster.map(member => (
                <li key={member.id} className={css.entry}>
                  <span className={css.dotSlot}><StateDot state={memberDotState(member.state)} /></span>
                  <span className={css.rowName}>{member.name}</span>
                  <span className={css.rowStatus}>{t(`status.${member.state}`)}</span>
                </li>
              ))}
            </ul>
          </>
        )
  return (
    <div className={css.root} data-workbench-tab="team-status">
      <div className={css.header}>
        <IconAgentPresetOutline16 className={css.headerIcon} />
        <span>{t('tab.team.type')}</span>
      </div>
      {body}
    </div>
  )
}
