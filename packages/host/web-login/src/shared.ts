/**
 * Route paths and wire payloads of the login surface. Host-only today; a
 * browser companion (an authenticated-shell redirect or a login widget) would
 * import this subpath verbatim.
 * @module @deepseek-ai/dsh-web-login/src/shared
 */

/** GET route serving the rendered login page. */
export const LOGIN_PAGE_ROUTE = '/login'

/** GET route reporting whether the caller carries a logged-in session. */
export const AUTH_STATUS_ROUTE = '/auth/status'

/** POST route issuing a demo SMS verification code for one phone. */
export const AUTH_SMS_SEND_ROUTE = '/auth/sms/send'

/** POST route verifying one SMS code, registering the account on first login. */
export const AUTH_SMS_VERIFY_ROUTE = '/auth/sms/verify'

/** POST route signing in with phone and password. */
export const AUTH_PASSWORD_LOGIN_ROUTE = '/auth/password/login'

/** POST route creating one account with phone and password (plus an SMS code when the deployment demands one). */
export const AUTH_REGISTER_ROUTE = '/auth/register'

/** POST route resetting one account's password with an SMS code. */
export const AUTH_PASSWORD_RESET_ROUTE = '/auth/password/reset'

/** POST route clearing the caller's session cookie. */
export const AUTH_LOGOUT_ROUTE = '/auth/logout'

/** POST route creating one member invite (owner only). */
export const TEAM_INVITES_CREATE_ROUTE = '/team/invites'

/** POST route binding the caller's phone to an invite's roles. */
export const TEAM_INVITES_REDEEM_ROUTE = '/team/invites/redeem'

/** GET route listing the member roster (owner only). */
export const TEAM_MEMBERS_ROUTE = '/team/members'

/** Prefix of the owner-managed `PUT/DELETE /team/members/:phone` routes. */
export const TEAM_MEMBERS_PHONE_PREFIX = '/team/members'

/** GET route listing every registered account, bound or not (owner only). */
export const TEAM_ACCOUNTS_ROUTE = '/team/accounts'

/** Prefix of the owner-managed `DELETE /team/accounts/:phone` route. */
export const TEAM_ACCOUNTS_PHONE_PREFIX = '/team/accounts'

/** Mainland-China mobile number: leading 1 plus ten digits. */
export const PHONE_PATTERN = /^1\d{10}$/

/** Status-route response: whether the caller is logged in, and as whom. */
export interface AuthStatusPayload {
  /** True when the session cookie names a logged-in account subject. */
  readonly authenticated: boolean
  /** The logged-in phone number; present only when authenticated. */
  readonly subject?: string
  /** The masked display name of the account; present when the account exists. */
  readonly displayName?: string
  /** The caller's bound AI-company roles; present when the caller holds any. */
  readonly roles?: readonly string[]
  /** True when the caller is the owner (the earliest registered account). */
  readonly isOwner?: boolean
}

/** SMS-send request body. */
export interface SmsSendPayload {
  readonly phone: string
}

/** SMS-send success response. */
export interface SmsSendResult {
  readonly ok: true
  /** The cooldown the client must respect before the next send, in seconds. */
  readonly cooldownSeconds: number
}

/** SMS-verify request body. */
export interface SmsVerifyPayload {
  readonly phone: string
  readonly code: string
}

/** SMS-verify success response: the browser follows `redirect`. */
export interface SmsVerifyResult {
  readonly ok: true
  /** The post-login landing path. */
  readonly redirect: string
}

/** Password-login request body. */
export interface PasswordLoginPayload {
  readonly phone: string
  readonly password: string
  /** False (or omitted) keeps the browser-session-only cookie. */
  readonly remember?: boolean
}

/** Password-login success response: the browser follows `redirect`. */
export interface PasswordLoginResult {
  readonly ok: true
  /** The post-login landing path. */
  readonly redirect: string
}

/** Register request body. */
export interface RegisterPayload {
  readonly phone: string
  /**
   * The SMS code; required only when the deployment sets
   * `requireRegistrationCode`. Omitted (or empty) in deployments that
   * register from a phone and a password alone.
   */
  readonly code?: string
  readonly password: string
}

/** Register success response: the account is created and logged in. */
export interface RegisterResult {
  readonly ok: true
  /** The post-registration landing path. */
  readonly redirect: string
}

/** Password-reset request body. */
export interface PasswordResetPayload {
  readonly phone: string
  readonly code: string
  readonly password: string
}

/** Password-reset success response: the password is set and the caller logged in. */
export interface PasswordResetResult {
  readonly ok: true
  /** The post-reset landing path. */
  readonly redirect: string
}

/** Structured JSON error body every 4xx/5xx answer carries. */
export interface LoginErrorPayload {
  readonly code: 'bad-request' | 'bad-phone' | 'bad-code' | 'no-challenge'
    | 'expired' | 'exhausted' | 'cooldown' | 'unsupported-media-type'
    | 'payload-too-large' | 'authority-unavailable'
    | 'unauthenticated' | 'forbidden' | 'bad-invite' | 'invite-used' | 'invite-expired'
    | 'wrong-password' | 'no-credential' | 'phone-registered' | 'no-account' | 'weak-password'
  readonly message: string
  /** Wrong-code attempts left before the challenge is destroyed. */
  readonly remainingAttempts?: number
  /** Seconds until the next send is allowed (cooldown) or the next send may be attempted. */
  readonly cooldownSeconds?: number
}

/** Invite-create request body. */
export interface InviteCreatePayload {
  /** The roles the redeemer will be granted; at least one, no duplicates. */
  readonly roles: readonly string[]
}

/** Invite-create success response. */
export interface InviteCreateResult {
  readonly ok: true
  /** The single-use invite code to relay to the member. */
  readonly code: string
  /** Instant the invite expires, epoch milliseconds. */
  readonly expiresAt: number
}

/** Invite-redeem request body. */
export interface InviteRedeemPayload {
  /** The invite code received from the owner. */
  readonly code: string
}

/** Invite-redeem success response. */
export interface InviteRedeemResult {
  readonly ok: true
  /** The roles now bound to the redeemer's phone. */
  readonly roles: readonly string[]
}

/** One roster row of the members-list response. */
export interface MemberListEntry {
  /** The member's phone number (owner-only management surface). */
  readonly phone: string
  /** The member's masked display name. */
  readonly displayName: string
  /** The bound AI-company roles. */
  readonly roles: readonly string[]
  /** Masked phone of the granting owner. */
  readonly grantedBy: string
  /** Grant time, epoch milliseconds. */
  readonly grantedAt: number
}

/** Members-list success response. */
export interface MemberListResult {
  readonly ok: true
  /** The owner's phone number. */
  readonly owner: string
  /** The roster, ordered by grant time. */
  readonly members: readonly MemberListEntry[]
}

/** Member-assign request body: the owner sets one member's whole role set. */
export interface MemberAssignPayload {
  /** The roles the member will hold after the call; at least one, no duplicates. */
  readonly roles: readonly string[]
}

/** Member-assign success response: the binding now matches the request. */
export interface MemberAssignResult {
  readonly ok: true
  /** The assigned member's phone number. */
  readonly phone: string
  /** The role set now bound to the phone. */
  readonly roles: readonly string[]
}

/** One registered account of the accounts-list response. */
export interface AccountEntry {
  /** The account's phone number (owner-only management surface). */
  readonly phone: string
  /** The account's masked display name. */
  readonly displayName: string
  /** Registration time, epoch milliseconds. */
  readonly createdAt: number
  /** Most recent login time, epoch milliseconds. */
  readonly lastLoginAt: number
}

/** Accounts-list success response. */
export interface AccountListResult {
  readonly ok: true
  /** The owner's phone number. */
  readonly owner: string
  /** Every registered account, ordered by registration time. */
  readonly accounts: readonly AccountEntry[]
}
