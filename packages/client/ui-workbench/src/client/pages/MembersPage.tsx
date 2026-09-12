/**
 * The owner's members-management page: create role-granting invites, review
 * the bound roster, and unbind a member's roles. The shell renders this page
 * only when the auth status reported the caller as the owner, so the page
 * itself presents without a second gate.
 *
 * An invite grants the checked roles to whichever phone redeems it, one use,
 * expiring at the host's validity window. The redeemer enters the code on the
 * login page after signing in, which binds the roles to that phone.
 */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { ROLES, type RoleId } from '../roles.ts'
import { timeLabel } from '../time-label.ts'
import type { InviteOutcome, MembersState } from '../workbench-store.ts'
import css from './WorkbenchPages.module.css'

/** Everything the members page renders from. */
export interface MembersPageProps {
  /** Roster snapshot owned by the controller. */
  members: MembersState
  /** Create one invite granting the checked roles. */
  onCreate: (roles: readonly RoleId[]) => Promise<InviteOutcome>
  /** Unbind one member's roles; resolves to the host failure message, or null. */
  onUnbind: (phone: string) => Promise<string | null>
  /** Namespace-bound translate. */
  t: TranslateNS<'workbench'>
}

/**
 * Render the owner's members-management page.
 * @param props - the roster snapshot plus the invite and unbind actions.
 * @returns the invite form and the member roster.
 */
export function MembersPage({ members, onCreate, onUnbind, t }: MembersPageProps) {
  const [selected, setSelected] = useState<ReadonlySet<RoleId>>(() => new Set())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null)

  const toggleRole = (id: RoleId): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const submit = async (): Promise<void> => {
    if (selected.size === 0) return
    setPending(true)
    const outcome = await onCreate([...selected])
    setPending(false)
    if (!outcome.ok) {
      setError(t('members.invite.failed', { message: outcome.error }))
      return
    }
    setError(null)
    setInvite({ code: outcome.code, expiresAt: outcome.expiresAt })
  }

  const unbind = async (phone: string): Promise<void> => {
    const failure = await onUnbind(phone)
    if (failure !== null) setError(t('members.unbind.failed', { message: failure }))
  }

  return (
    <>
      <section className={css.section}>
        <div className={css.roleChecks} role="group" aria-label={t('members.roles')}>
          {ROLES.map(role => (
            <label key={role.id} className={css.roleCheck}>
              <input
                type="checkbox"
                checked={selected.has(role.id)}
                onChange={() => { toggleRole(role.id) }}
              />
              <span aria-hidden="true">{role.emoji}</span>
              {t(`nav.role.${role.id}`)}
            </label>
          ))}
        </div>
        <div className={css.submitRow}>
          <Button
            type="button"
            variant="primary"
            disabled={selected.size === 0 || pending}
            onClick={() => { void submit() }}
          >
            {pending ? t('members.invite.creating') : t('members.invite.create')}
          </Button>
        </div>
        {error !== null && <p className={css.formError} role="alert">{error}</p>}
        {invite !== null
          ? (
            <div className={css.inviteBox}>
              <span className={css.inviteLabel}>{t('members.invite.code')}</span>
              <code className={css.inviteCode}>{invite.code}</code>
              <span className={css.inviteMeta}>
                {t('members.invite.expires', { time: new Date(invite.expiresAt).toLocaleString() })}
              </span>
              <p className={css.memberEmpty}>{t('members.invite.hint')}</p>
            </div>
          )
          : <p className={css.memberEmpty}>{t('members.invite.none')}</p>}
      </section>

      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('members.list.title')}</h3>
        {members.status !== 'ready'
          ? (
            <p className={css.empty}>
              {members.status === 'error'
                ? t('members.list.error', { message: members.error ?? '' })
                : t('members.list.loading')}
            </p>
          )
          : members.members.length === 0
            ? <p className={css.empty}>{t('members.list.empty')}</p>
            : (
              <ul className={css.ledgerList}>
                {members.members.map(entry => (
                  <li key={entry.phone} className={css.memberListRow}>
                    <span className={css.memberListName}>{entry.displayName}</span>
                    <span className={css.memberListRoles}>
                      {entry.roles.map(id => t(`nav.role.${id as RoleId}`)).join(' · ')}
                    </span>
                    <span className={css.memberListMeta}>
                      {t('members.list.grantedBy', { name: entry.grantedBy })}
                      {' · '}
                      {timeLabel(entry.grantedAt, Date.now(), t)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => { void unbind(entry.phone) }}
                    >
                      {t('members.unbind')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
      </section>
    </>
  )
}
