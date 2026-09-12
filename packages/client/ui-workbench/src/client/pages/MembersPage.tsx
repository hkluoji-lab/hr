/**
 * The owner's members-management page: assign roles to a registered account
 * directly, create role-granting invites for members who prefer to redeem a
 * code themselves, review the bound roster, and unbind a member's roles. The
 * shell renders this page only when the auth status reported the caller as
 * the owner, so the page itself presents without a second gate.
 *
 * Direct assignment replaces the target account's whole role set in one
 * decision. An invite instead grants the checked roles to whichever phone
 * redeems it, one use, expiring at the host's validity window; the redeemer
 * enters the code on the login page after signing in.
 *
 * A third section lists every registered account, which is how an account
 * that never bound a role — and so has no roster row — stays reachable for
 * deletion. Deleting removes the credential and the binding with the account;
 * the host refuses the owner's own account, and the row renders without a
 * button instead.
 */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { PHONE_PATTERN } from '@deepseek-ai/dsh-web-login/shared'
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
  /** Assign one registered account its whole role set; resolves to the failure message, or null. */
  onAssign: (phone: string, roles: readonly RoleId[]) => Promise<string | null>
  /** Delete one registered account with its credential and binding; resolves to the failure message, or null. */
  onDelete: (phone: string) => Promise<string | null>
  /** Namespace-bound translate. */
  t: TranslateNS<'workbench'>
}

/**
 * Render the owner's members-management page.
 * @param props - the roster snapshot plus the assign, invite, unbind, and delete actions.
 * @returns the direct-assignment form, the invite form, the member roster, and the account list.
 */
export function MembersPage({ members, onCreate, onUnbind, onAssign, onDelete, t }: MembersPageProps) {
  const [selected, setSelected] = useState<ReadonlySet<RoleId>>(() => new Set())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null)
  const [phone, setPhone] = useState('')
  const [assignRoles, setAssignRoles] = useState<ReadonlySet<RoleId>>(() => new Set())
  const [assignPending, setAssignPending] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [deletingPhone, setDeletingPhone] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  const toggleAssignRole = (id: RoleId): void => {
    setAssignRoles((prev) => {
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

  const submitAssign = async (): Promise<void> => {
    const trimmed = phone.trim()
    if (!PHONE_PATTERN.test(trimmed) || assignRoles.size === 0) return
    setAssignPending(true)
    const failure = await onAssign(trimmed, [...assignRoles])
    setAssignPending(false)
    if (failure !== null) {
      setAssignError(t('members.assign.failed', { message: failure }))
      return
    }
    setAssignError(null)
    setPhone('')
    setAssignRoles(new Set())
  }

  const unbind = async (phone: string): Promise<void> => {
    const failure = await onUnbind(phone)
    if (failure !== null) setError(t('members.unbind.failed', { message: failure }))
  }

  const remove = async (phone: string): Promise<void> => {
    setDeletingPhone(phone)
    const failure = await onDelete(phone)
    setDeletingPhone(null)
    setDeleteError(failure === null ? null : t('members.accounts.delete.failed', { message: failure }))
  }

  // The roster carries the granted roles; the account list does not repeat
  // them, so the page joins the two by phone for the account rows.
  const rolesByPhone = new Map(members.members.map(entry => [entry.phone, entry.roles]))

  const roleChecks = (label: string, checked: ReadonlySet<RoleId>, toggle: (id: RoleId) => void) => (
    <div className={css.roleChecks} role="group" aria-label={label}>
      {ROLES.map(role => (
        <label key={role.id} className={css.roleCheck}>
          <input
            type="checkbox"
            checked={checked.has(role.id)}
            onChange={() => { toggle(role.id) }}
          />
          <span aria-hidden="true">{role.emoji}</span>
          {t(`nav.role.${role.id}`)}
        </label>
      ))}
    </div>
  )

  return (
    <>
      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('members.assign.title')}</h3>
        {roleChecks(t('members.assign.title'), assignRoles, toggleAssignRole)}
        <div className={css.submitRow}>
          <input
            className={css.phoneInput}
            type="tel"
            inputMode="numeric"
            placeholder={t('members.assign.phonePlaceholder')}
            aria-label={t('members.assign.phone')}
            value={phone}
            onChange={(event) => { setPhone(event.target.value) }}
          />
          <Button
            type="button"
            variant="primary"
            disabled={!PHONE_PATTERN.test(phone.trim()) || assignRoles.size === 0 || assignPending}
            onClick={() => { void submitAssign() }}
          >
            {assignPending ? t('members.assign.submitting') : t('members.assign.submit')}
          </Button>
        </div>
        {assignError !== null && <p className={css.formError} role="alert">{assignError}</p>}
        <p className={css.memberEmpty}>{t('members.assign.hint')}</p>
      </section>

      <section className={css.section}>
        {roleChecks(t('members.roles'), selected, toggleRole)}
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

      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('members.accounts.title')}</h3>
        {members.status !== 'ready'
          ? (
            <p className={css.empty}>
              {members.status === 'error'
                ? t('members.accounts.error', { message: members.error ?? '' })
                : t('members.accounts.loading')}
            </p>
          )
          : members.accounts.length === 0
            ? <p className={css.empty}>{t('members.accounts.empty')}</p>
            : (
              <ul className={css.ledgerList}>
                {members.accounts.map((entry) => {
                  const bound = rolesByPhone.get(entry.phone) ?? []
                  return (
                    <li key={entry.phone} className={css.memberListRow}>
                      <span className={css.memberListName}>{entry.displayName}</span>
                      <span className={css.memberListRoles}>
                        {bound.length === 0
                          ? t('members.accounts.unbound')
                          : bound.map(id => t(`nav.role.${id as RoleId}`)).join(' · ')}
                      </span>
                      <span className={css.memberListMeta}>
                        {t('members.accounts.registeredAt', { time: timeLabel(entry.createdAt, Date.now(), t) })}
                        {' · '}
                        {t('members.accounts.lastLoginAt', { time: timeLabel(entry.lastLoginAt, Date.now(), t) })}
                      </span>
                      {entry.phone === members.owner
                        ? <span className={css.memberListMeta}>{t('members.accounts.selfHint')}</span>
                        : (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={deletingPhone === entry.phone}
                            onClick={() => { void remove(entry.phone) }}
                          >
                            {deletingPhone === entry.phone
                              ? t('members.accounts.deleting')
                              : t('members.accounts.delete')}
                          </Button>
                        )}
                    </li>
                  )
                })}
              </ul>
            )}
        {deleteError !== null && <p className={css.formError} role="alert">{deleteError}</p>}
        <p className={css.memberEmpty}>{t('members.accounts.hint')}</p>
      </section>
    </>
  )
}
