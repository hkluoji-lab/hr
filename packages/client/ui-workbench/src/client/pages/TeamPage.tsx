/**
 * The AI team page: the company-role roster as member cards, at page scale —
 * the same `roleMembers` fold the hero dashboard presents, so mode and other
 * non-role presets never appear as the company's team. Picking a member starts
 * a session composed for that member and leaves the page; broken presets stay
 * disabled.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { MemberCard } from '../MemberCard.tsx'
import { roleMembers, type WorkbenchState } from '../workbench-store.ts'
import css from './WorkbenchPages.module.css'

/** Everything the team page renders from. */
export interface TeamPageProps {
  /** Roster snapshot shared with the hero dashboard. */
  state: WorkbenchState
  /** Start a session composed for one member's preset. */
  onStart: (id: string) => void
  /** Namespace-bound translate. */
  t: TranslateNS<'workbench'>
}

/**
 * Render the AI team page.
 * @param props - the roster snapshot plus the start action.
 * @returns the role-member grid, or the empty note when the deployment composes no preset.
 */
export function TeamPage({ state, onStart, t }: TeamPageProps) {
  const roster = roleMembers(state.members)
  if (roster.length === 0) return <p className={css.empty}>{t('team.empty')}</p>
  return (
    <div className={css.memberGrid}>
      {roster.map(member => (
        <MemberCard key={member.id} member={member} onStart={onStart} t={t} />
      ))}
    </div>
  )
}
