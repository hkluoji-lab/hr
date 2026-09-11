/**
 * One AI team member card: the role glyph (the design emoji placeholder, or
 * the preset glyph for a role-less preset), its live presence dot, name,
 * scope line, and capability tags. Disabled (and unstartable) for a broken
 * preset. Shared by the hero roster and the team page so both surfaces present
 * a member identically.
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
  const role = member.role
  return (
    <button
      type="button"
      className={css.card}
      data-role={role?.id ?? 'generic'}
      disabled={member.state === 'offline'}
      onClick={() => { onStart(member.id) }}
      title={member.description || member.name}
    >
      <span className={css.head}>
        <span className={css.icon}>
          {role ? role.emoji : <IconAgentPresetOutline16 size={18} />}
        </span>
        <StateDot state={memberDotState(member.state)} className={css.dot} />
      </span>
      <span className={css.name}>{member.name}</span>
      <span className={css.desc}>
        {role ? t(role.descKey) : member.description || t(`status.${member.state}`)}
      </span>
      {role && (
        <span className={css.tags}>
          {role.tagKeys.map(tagKey => (
            <span key={tagKey} className={css.tag}>{t(tagKey)}</span>
          ))}
        </span>
      )}
    </button>
  )
}
