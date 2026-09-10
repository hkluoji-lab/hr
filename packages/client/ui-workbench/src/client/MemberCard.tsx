/**
 * One AI team member card: the preset's glyph, its live presence dot, name,
 * and description. Disabled (and unstartable) for a broken preset. Shared by
 * the hero roster and the team page so both surfaces present a member
 * identically.
 */
import { IconAgentPresetOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { memberDotState, type TeamMember } from './workbench-store.ts'
import css from './MemberCard.module.css'

/** Everything one member card renders from. */
export interface MemberCardProps {
  /** The member to present. */
  member: TeamMember
  /** Start a session composed for this member's preset. */
  onStart: (id: string) => void
  /** Namespace-bound translate. */
  t: TranslateNS<'workbench'>
}

/**
 * Render one team member card.
 * @param props - the member, the start action, and the translate seat.
 * @returns the member button.
 */
export function MemberCard({ member, onStart, t }: MemberCardProps) {
  return (
    <button
      type="button"
      className={css.card}
      disabled={member.state === 'offline'}
      onClick={() => { onStart(member.id) }}
      title={member.description || member.name}
    >
      <span className={css.head}>
        <span className={css.icon}><IconAgentPresetOutline16 size={18} /></span>
        <StateDot state={memberDotState(member.state)} className={css.dot} />
      </span>
      <span className={css.name}>{member.name}</span>
      <span className={css.desc}>{member.description || t(`status.${member.state}`)}</span>
    </button>
  )
}
