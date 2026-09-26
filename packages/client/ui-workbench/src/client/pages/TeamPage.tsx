/**
 * The AI team page: the company-role roster as workbench cards, at page scale —
 * the same `roleMembers` fold the hero dashboard presents, so mode and other
 * non-role presets never appear as the company's team. Each role card carries
 * the business the role must act on next (folded from the clients page's data,
 * hidden until that read is ready) and the preset one-click actions that start
 * a session with the action's brief; the card head still starts a plain
 * session for that member. Broken presets stay disabled throughout.
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { IconAgentPresetOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { ROLE_ACTIONS } from '../roles.ts'
import {
  memberDotState, roleMembers, rolePending,
  type ClientsState, type RolePending, type TeamMember, type WorkbenchState,
} from '../workbench-store.ts'
import css from './WorkbenchPages.module.css'

/** Everything the team page renders from. */
export interface TeamPageProps {
  /** Roster snapshot shared with the hero dashboard. */
  state: WorkbenchState
  /** Clients-page snapshot folded into each role's pending summary. */
  clients: ClientsState
  /** Start a session composed for one member's preset. */
  onStart: (id: string) => void
  /** Start a session for one role action's preset and brief. */
  onAction: (presetId: string, brief: string) => void
  /** Namespace-bound translate. */
  t: TranslateNS<'workbench'>
}

/** Everything one role workbench card renders from. */
interface RoleCardProps {
  /** The member to present. */
  member: TeamMember
  /** The pending summary, or null while the clients read is not ready. */
  pending: RolePending | null
  /** Start a plain session composed for this member's preset. */
  onStart: (id: string) => void
  /** Start a session for one action's preset and brief. */
  onAction: (presetId: string, brief: string) => void
  /** Namespace-bound translate. */
  t: TranslateNS<'workbench'>
}

/**
 * Render one role's workbench card: the member identity head (a button that
 * starts a plain session), the pending line the clients read answers, and the
 * preset action buttons that start a session with that action's brief.
 * @param props - the member, the pending summary, and the start actions.
 * @returns the role workbench card.
 */
function RoleCard({ member, pending, onStart, onAction, t }: RoleCardProps) {
  const role = member.role
  return (
    <div className={css.workbenchCard} data-role={role?.id ?? 'generic'}>
      <button
        type="button"
        className={css.workbenchHead}
        disabled={member.state === 'offline'}
        title={member.description || member.name}
        onClick={() => { onStart(member.id) }}
      >
        <span className={css.head}>
          <span className={css.icon}>
            {role ? role.emoji : <IconAgentPresetOutline16 size={18} />}
          </span>
          {member.state === 'busy'
            ? <span className={css.busy}>{t('status.busy')}</span>
            : <StateDot state={memberDotState(member.state)} className={css.dot} />}
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
      {role && pending && (
        <p className={css.pending}>{t(pending.labelKey, { n: pending.count })}</p>
      )}
      {role && (
        <span className={css.actions}>
          {ROLE_ACTIONS[role.id].map(action => (
            <button
              key={action.id}
              type="button"
              className={css.action}
              disabled={member.state === 'offline'}
              onClick={() => { onAction(member.id, t(action.briefKey)) }}
            >
              {t(action.labelKey)}
            </button>
          ))}
        </span>
      )}
    </div>
  )
}

/**
 * Render the AI team page.
 * @param props - the roster snapshot, the clients snapshot, plus the start actions.
 * @returns the role workbench grid, or the empty note when the deployment composes no preset.
 */
export function TeamPage({ state, clients, onStart, onAction, t }: TeamPageProps) {
  const roster = roleMembers(state.members)
  if (roster.length === 0) return <p className={css.empty}>{t('team.empty')}</p>
  const ready = clients.status === 'ready'
  return (
    <div className={css.memberGrid}>
      {roster.map(member => (
        <RoleCard
          key={member.id}
          member={member}
          pending={ready && member.role ? rolePending(clients, member.role.id) : null}
          onStart={onStart}
          onAction={onAction}
          t={t}
        />
      ))}
    </div>
  )
}
