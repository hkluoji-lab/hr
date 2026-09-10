/**
 * The AI team page: the preset roster as member cards, at page scale. Picking
 * a member starts a session composed for that member and leaves the page;
 * broken presets stay disabled.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { MemberCard } from '../MemberCard.tsx'
import type { WorkbenchState } from '../workbench-store.ts'
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
 * @returns the member grid, or the empty note when the deployment composes no preset.
 */
export function TeamPage({ state, onStart, t }: TeamPageProps) {
  if (state.members.length === 0) return <p className={css.empty}>{t('team.empty')}</p>
  return (
    <div className={css.memberGrid}>
      {state.members.map(member => (
        <MemberCard key={member.id} member={member} onStart={onStart} t={t} />
      ))}
    </div>
  )
}
