/**
 * The web login surface: the rendered login page and the phone + SMS-code
 * registration/login routes, plus the `loginSession` identity service other
 * host plugins read for the most recent login.
 *
 * Trust has one home, in the composition's `connection` service, and this
 * package reuses it as-is: every route asks `requestRejection` first, whose
 * 403 covers the Host/Origin fence (DNS rebinding, cross-site POSTs) and
 * whose 401 means "trusted caller, not logged in" — exactly the caller the
 * login surface exists for, so 401 passes here. A successful verification
 * mints the authenticated session through the same service
 * (`issueSessionCookie(headers, phone)`), so cookie serialization, signing,
 * and lifetime stay in one place.
 *
 * On top of that fence the POST routes validate their bodies at the wire: an
 * `application/json` media type, a 64 KiB ceiling, and exact string fields
 * (`phone` matching `^1\d{10}$`, `code` matching `^\d{6}$`). Verification
 * codes live in memory only (cooldown, expiry, and attempt ceiling are
 * Config); with no SMS provider wired, issuing prints the code on the server
 * console as an explicit `[演示]` marker — a deployment demonstrating the
 * flow, not a deliverable SMS channel.
 *
 * Accounts persist in the `web-login` storage domain (`accounts` keyed by
 * phone; the masked display name is derived at write time). First successful
 * verification registers the account — login and registration are one flow.
 *
 * On top of accounts sits the member model: the owner (the earliest
 * registered account) creates single-use role invites and manages the roster
 * (`POST /team/invites`, `GET/DELETE /team/members...`); any logged-in
 * phone redeems an invite to bind its roles (`POST /team/invites/redeem`,
 * unioned into any existing roles). `/auth/status` answers the caller's roles
 * and ownership next to the login facts, so consumers need no second source.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import z from '@deepseek-ai/schemastery'
import {
  AUTH_LOGOUT_ROUTE, AUTH_PASSWORD_LOGIN_ROUTE, AUTH_PASSWORD_RESET_ROUTE,
  AUTH_REGISTER_ROUTE, AUTH_SMS_SEND_ROUTE, AUTH_SMS_VERIFY_ROUTE,
  AUTH_STATUS_ROUTE, LOGIN_PAGE_ROUTE, PHONE_PATTERN,
  TEAM_INVITES_CREATE_ROUTE, TEAM_INVITES_REDEEM_ROUTE, TEAM_MEMBERS_PHONE_PREFIX,
  TEAM_MEMBERS_ROUTE,
  type InviteCreateResult, type InviteRedeemResult, type LoginErrorPayload,
  type MemberListResult, type PasswordLoginResult, type PasswordResetResult,
  type RegisterResult,
} from './shared.ts'
import {
  maskPhone, memberRolesSchema, passwordSchema, webLoginDomainSpec,
  type InviteRecord, type MemberRecord, type RoleId,
} from './spec.ts'
import { hashPassword, verifyPassword } from './password.ts'
import { SmsChallengeStore } from './sms.ts'
import { LoginSession } from './session.ts'
import { renderLoginPage } from './page.ts'

export type * from './shared.ts'
export type { LoginSession, LoginIdentity } from './session.ts'
export type {
  maskPhone, webLoginDomainSpec, AccountRecord, WebLoginDomainSpec,
  InviteRecord, MemberRecord, RoleId,
} from './spec.ts'
export { ROLE_IDS } from './spec.ts'

/** Cordis function-plugin name. */
export const name = 'web-login'
/** The route carrier, the trust/session fence, and the storage domain facility. */
export const inject = ['webServer', 'connection', 'storageDomain']

/** Web-login plugin configuration. */
export interface Config {
  /** Minimum gap between two sends for one phone, in seconds. */
  readonly codeCooldownSeconds: number
  /** How long one code stays verifiable, in seconds. */
  readonly codeValiditySeconds: number
  /** Wrong verifications allowed before one challenge is destroyed. */
  readonly maxVerificationAttempts: number
  /** How long one member invite stays redeemable, in seconds. */
  readonly inviteValiditySeconds: number
}

/** Runtime schema for the plugin config. */
export const Config: z<Config> = z.object({
  codeCooldownSeconds: z.natural().min(1).max(600).default(60),
  codeValiditySeconds: z.natural().min(5).max(3600).default(300),
  maxVerificationAttempts: z.natural().min(1).max(10).default(5),
  inviteValiditySeconds: z.natural().min(60).max(2_592_000).default(604_800),
})

/** Session-cookie shape issued by the composition's connection service. */
interface IssuedCookie {
  readonly name: string
  readonly value: string
  readonly maxAgeSeconds: number
  readonly expiresAt: number
}

/** Trust/session surface consumed here; the browser-side connection package owns the full type. */
interface LoginConnection {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
  issueSessionCookie(
    request: { readonly headers: IncomingMessage['headers'] },
    subject?: string,
    persistenceMilliseconds?: number,
  ): IssuedCookie | undefined
  clearSessionCookie(request: { readonly headers: IncomingMessage['headers'] }): string | undefined
  sessionSubject(request: { readonly headers: IncomingMessage['headers'] }): string | undefined
}

/** The composition's connection service (typed locally: its package is browser-side). */
function connectionOf(ctx: Context): LoginConnection {
  return Reflect.get(ctx, 'connection') as LoginConnection
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Identity of the most recent login this process life. */
    loginSession: LoginSession
  }
}

/** POST bodies are tiny JSON objects; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024

/** JSON response (no-store: session, challenge, and status facts are live). */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/** Structured login error response. */
function sendError(
  res: ServerResponse,
  status: number,
  error: LoginErrorPayload,
): void {
  sendJson(res, status, error)
}

/** 405 with the route's one supported method. */
function sendMethodNotAllowed(res: ServerResponse, allow: 'GET' | 'POST' | 'DELETE'): void {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.end()
}

/** Collect a bounded request body as UTF-8 text; null past the ceiling (stream drained). */
async function readBoundedBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.byteLength
    if (total > MAX_BODY_BYTES) {
      req.resume()
      return null
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, total).toString('utf8')
}

/** Parse one JSON object body, or null for anything else. */
function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const body: unknown = JSON.parse(text)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
    return body as Record<string, unknown>
  } catch {
    // Swallows the parse error: a non-JSON body is exactly the null case.
    return null
  }
}

/** Read one required string field from a parsed body. */
function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  return typeof value === 'string' ? value : undefined
}

/** The request's media-type essence, lowercased; '' when absent. */
function mediaEssence(req: IncomingMessage): string {
  return (req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

/**
 * Full `Set-Cookie` value for an issued session cookie (attributes mirror the
 * authenticator's). `maxAgeSeconds: 0` marks a browser-session cookie: no
 * `Max-Age`/`Expires` attributes, so the cookie dies with the browser session
 * while the signed payload keeps its full validity.
 */
function issuedCookieHeader(cookie: IssuedCookie): string {
  const persistence = cookie.maxAgeSeconds > 0
    ? `Max-Age=${String(cookie.maxAgeSeconds)}; Expires=${new Date(cookie.expiresAt).toUTCString()}; `
    : ''
  return `${cookie.name}=${cookie.value}; ${persistence}Path=/; HttpOnly; SameSite=Strict`
}

/**
 * Validate a wire phone number.
 * @returns the phone, or undefined after answering 400 `bad-phone`.
 */
function wirePhone(res: ServerResponse, raw: string | undefined): string | undefined {
  if (raw !== undefined && PHONE_PATTERN.test(raw)) return raw
  sendError(res, 400, { code: 'bad-phone', message: 'phone must match ^1\\d{10}$' })
  return undefined
}

/**
 * Validate a wire 6-digit verification code.
 * @returns the code, or undefined after answering 400 `bad-code`.
 */
function wireCode(res: ServerResponse, raw: string | undefined): string | undefined {
  if (raw !== undefined && /^\d{6}$/.test(raw)) return raw
  sendError(res, 400, { code: 'bad-code', message: 'code must be 6 digits' })
  return undefined
}

/**
 * Read one POST's JSON object body, answering every wire rejection (method,
 * media type, size ceiling, parse). Returns undefined when the response was
 * already answered.
 */
async function readPostObject(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | undefined> {
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, 'POST')
    return undefined
  }
  if (mediaEssence(req) !== 'application/json') {
    sendError(res, 415, { code: 'unsupported-media-type', message: 'content-type must be application/json' })
    return undefined
  }
  let text: string | null
  try {
    text = await readBoundedBody(req)
  } catch {
    // Swallows connection errors mid-body: there is nothing left to answer precisely.
    sendError(res, 400, { code: 'bad-request', message: 'request body unreadable' })
    return undefined
  }
  if (text === null) {
    sendError(res, 413, { code: 'payload-too-large', message: 'request body is too large' })
    return undefined
  }
  const body = parseJsonObject(text)
  if (body === null) {
    sendError(res, 400, { code: 'bad-request', message: 'request body must be a JSON object' })
    return undefined
  }
  return body
}

/** Read one required non-empty string-array field from a parsed body. */
function stringArrayField(body: Record<string, unknown>, key: string): readonly string[] | undefined {
  const value = body[key]
  if (!Array.isArray(value)) return undefined
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/** Read one POST's required string fields, answering every wire rejection. */
async function readPostFields(
  req: IncomingMessage,
  res: ServerResponse,
  keys: readonly string[],
): Promise<string[] | undefined> {
  const body = await readPostObject(req, res)
  if (body === undefined) return undefined
  const values: string[] = []
  for (const key of keys) {
    const value = stringField(body, key)
    if (value === undefined) {
      sendError(res, 400, { code: 'bad-request', message: `field "${key}" must be a string` })
      return undefined
    }
    values.push(value)
  }
  return values
}

/**
 * Register the login page, the auth status/SMS routes, and the `loginSession`
 * service. The plugin owns the `web-login` storage domain for its lifetime.
 * @param ctx - plugin context.
 * @param config - validated plugin config.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const connection = connectionOf(ctx)
  const domain: Domain<ReturnType<typeof webLoginDomainSpec>> = await ctx.storageDomain.open(webLoginDomainSpec())
  ctx.effect(() => async () => { await domain.close() }, 'web-login.domainClose')
  const accounts = domain.table('accounts')
  const members = domain.table('members')
  const invites = domain.table('invites')
  const credentials = domain.table('credentials')
  const challenges = new SmsChallengeStore({
    cooldownMilliseconds: config.codeCooldownSeconds * 1000,
    validityMilliseconds: config.codeValiditySeconds * 1000,
    maxAttempts: config.maxVerificationAttempts,
  })
  const loginSession = new LoginSession()
  ctx.provide('loginSession', loginSession)

  /**
   * The owner's phone: the earliest registered account, ties broken by phone
   * order. Derived per call — ownership follows the accounts table without a
   * second source of truth to keep in sync.
   * @returns the owner's phone, or undefined before the first registration.
   */
  const ownerPhone = (): string | undefined => {
    let owner: { phone: string; createdAt: number } | undefined
    for (const [phone, account] of accounts.entries()) {
      if (owner === undefined
        || account.createdAt < owner.createdAt
        || (account.createdAt === owner.createdAt && phone < owner.phone)) {
        owner = { phone, createdAt: account.createdAt }
      }
    }
    return owner?.phone
  }

  /**
   * Guard for owner-only management routes: answers 401 (no session subject)
   * or 403 (not the owner); true means the response was already answered.
   */
  const rejectNonOwner = (req: IncomingMessage, res: ServerResponse): boolean => {
    const subject = connection.sessionSubject(req)
    if (subject === undefined) {
      sendError(res, 401, { code: 'unauthenticated', message: 'log in first' })
      return true
    }
    if (ownerPhone() !== subject) {
      sendError(res, 403, { code: 'forbidden', message: 'owner only' })
      return true
    }
    return false
  }

  /**
   * Validate a roles array from the wire against the member-role schema.
   * @returns the validated roles, or undefined after answering 400.
   */
  const rejectInvalidRoles = (res: ServerResponse, raw: readonly string[] | undefined): RoleId[] | undefined => {
    const parsed = memberRolesSchema.safeParse(raw)
    if (!parsed.success) {
      sendError(res, 400, { code: 'bad-request', message: 'roles must be a non-duplicated non-empty array of known role ids' })
      return undefined
    }
    return parsed.data
  }

  /**
   * Validate a password from the wire against the policy schema.
   * @returns the password, or undefined after answering 400 `weak-password`.
   */
  const rejectWeakPassword = (res: ServerResponse, raw: string | undefined): string | undefined => {
    if (raw !== undefined && passwordSchema.safeParse(raw).success) return raw
    sendError(res, 400, {
      code: 'weak-password',
      message: 'password must be 8-64 characters with at least one letter and one digit',
    })
    return undefined
  }

  /**
   * Read the register/reset wire triple (`phone`, `code`, `password`), answering
   * every field and policy rejection.
   * @returns `[phone, code, validPassword]`, or undefined when answered.
   */
  const readCredentialFields = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<[phone: string, code: string, validPassword: string] | undefined> => {
    const fields = await readPostFields(req, res, ['phone', 'code', 'password'])
    if (fields === undefined) return undefined
    const phone = wirePhone(res, fields[0])
    if (phone === undefined) return undefined
    const code = wireCode(res, fields[1])
    if (code === undefined) return undefined
    const validPassword = rejectWeakPassword(res, fields[2])
    if (validPassword === undefined) return undefined
    return [phone, code, validPassword]
  }

  /**
   * Verify one SMS challenge and answer every failure branch. Consumes the
   * challenge on success and on the terminal failures (`expired`/`exhausted`).
   * @returns true when the code is valid; false when the response was answered.
   */
  const verifyChallenge = (res: ServerResponse, phone: string, code: string): boolean => {
    const outcome = challenges.verify(phone, code, Date.now())
    if (outcome.outcome === 'ok') return true
    if (outcome.outcome === 'no-challenge') {
      sendError(res, 400, { code: 'no-challenge', message: 'request a code first' })
      return false
    }
    if (outcome.outcome === 'expired' || outcome.outcome === 'exhausted') {
      sendError(res, 410, { code: outcome.outcome, message: `challenge ${outcome.outcome}` })
      return false
    }
    sendError(res, 400, {
      code: 'bad-code',
      message: 'wrong code',
      remainingAttempts: outcome.remainingAttempts,
    })
    return false
  }

  /**
   * Mint and set the authenticated session cookie for one logged-in phone.
   * @param persistenceMilliseconds - browser-persistence window; omitted keeps
   *   the default, 0 issues a browser-session cookie.
   * @returns true on success; false after answering 500 (no request authority).
   */
  const issueLoginCookie = (
    req: IncomingMessage,
    res: ServerResponse,
    phone: string,
    persistenceMilliseconds?: number,
  ): boolean => {
    const cookie = connection.issueSessionCookie(req, phone, persistenceMilliseconds)
    if (cookie === undefined) {
      // The passed fence guarantees a parsable Host, so this is unreachable
      // in composition; the typed surface still allows it.
      sendError(res, 500, { code: 'authority-unavailable', message: 'no request authority to bind the session to' })
      return false
    }
    res.setHeader('set-cookie', issuedCookieHeader(cookie))
    return true
  }

  /** Upsert the login facts, record the identity, mint the cookie, answer the redirect. */
  const completeLogin = async (
    req: IncomingMessage,
    res: ServerResponse,
    phone: string,
    persistenceMilliseconds?: number,
  ): Promise<boolean> => {
    const now = Date.now()
    const existing = accounts.get(phone)
    const displayName = existing?.displayName ?? maskPhone(phone)
    await accounts.put(phone, {
      displayName,
      createdAt: existing?.createdAt ?? now,
      lastLoginAt: now,
    })
    loginSession.record({ phone, displayName })
    if (!issueLoginCookie(req, res, phone, persistenceMilliseconds)) return false
    sendJson(res, 200, { ok: true, redirect: '/' } satisfies PasswordLoginResult)
    return true
  }

  /**
   * Answer an untrusted request; true when it was rejected. The fence's 401
   * (trusted caller, not logged in) is the login surface's success case and
   * passes; only the trust rejection (403) refuses.
   */
  const rejected = (req: IncomingMessage, res: ServerResponse): boolean => {
    const rejection = connection.requestRejection(req)
    if (rejection === undefined || rejection === 401) return false
    res.statusCode = rejection
    res.end()
    return true
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: LOGIN_PAGE_ROUTE,
    handler: (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendMethodNotAllowed(res, 'GET')
        return
      }
      res.statusCode = 200
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.setHeader('referrer-policy', 'no-referrer')
      res.end(req.method === 'HEAD' ? undefined : renderLoginPage())
    },
  }), `web-login: GET ${LOGIN_PAGE_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: AUTH_STATUS_ROUTE,
    handler: (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendMethodNotAllowed(res, 'GET')
        return
      }
      const subject = connection.sessionSubject(req)
      const account = subject === undefined ? undefined : accounts.get(subject)
      const member = subject === undefined ? undefined : members.get(subject)
      sendJson(res, 200, {
        authenticated: subject !== undefined,
        ...(subject === undefined ? {} : { subject }),
        ...(account === undefined ? {} : { displayName: account.displayName }),
        ...(member === undefined ? {} : { roles: member.roles }),
        ...(subject !== undefined && subject === ownerPhone() ? { isOwner: true } : {}),
      })
    },
  }), `web-login: GET ${AUTH_STATUS_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: AUTH_SMS_SEND_ROUTE,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      const fields = await readPostFields(req, res, ['phone'])
      if (fields === undefined) return
      const phone = wirePhone(res, fields[0])
      if (phone === undefined) return
      const issued = challenges.issue(phone, Date.now())
      if (!issued.sent) {
        sendError(res, 429, {
          code: 'cooldown',
          message: `next send allowed in ${String(issued.cooldownSeconds)}s`,
          cooldownSeconds: issued.cooldownSeconds,
        })
        return
      }
      // Demo mode: no SMS provider is wired, so the code surfaces on the
      // server console under an explicit marker — never through the response.
      // Raw console output, not ctx.logger: the shipped web composition
      // registers no logger exporter, and this line is operator-facing
      // startup-style output like the `dsh web:` URL line.
      console.log(`[dsh-web-login] [演示] 验证码 ${issued.code}（${maskPhone(phone)}）`)
      sendJson(res, 200, { ok: true, cooldownSeconds: config.codeCooldownSeconds })
    },
  }), `web-login: POST ${AUTH_SMS_SEND_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: AUTH_SMS_VERIFY_ROUTE,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      const fields = await readPostFields(req, res, ['phone', 'code'])
      if (fields === undefined) return
      const phone = wirePhone(res, fields[0])
      if (phone === undefined) return
      const code = wireCode(res, fields[1])
      if (code === undefined) return
      if (!verifyChallenge(res, phone, code)) return
      await completeLogin(req, res, phone)
    },
  }), `web-login: POST ${AUTH_SMS_VERIFY_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: AUTH_LOGOUT_ROUTE,
    handler: (req, res) => {
      if (rejected(req, res)) return
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'POST')
        return
      }
      const cleared = connection.clearSessionCookie(req)
      res.statusCode = 204
      if (cleared !== undefined) res.setHeader('set-cookie', cleared)
      res.end()
    },
  }), `web-login: POST ${AUTH_LOGOUT_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: AUTH_PASSWORD_LOGIN_ROUTE,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      const body = await readPostObject(req, res)
      if (body === undefined) return
      const phone = wirePhone(res, stringField(body, 'phone'))
      if (phone === undefined) return
      const password = stringField(body, 'password')
      if (password === undefined || password.length === 0) {
        sendError(res, 400, { code: 'bad-request', message: 'field "password" must be a non-empty string' })
        return
      }
      const credential = credentials.get(phone)
      if (credential === undefined) {
        sendError(res, 400, { code: 'no-credential', message: 'this account has no password; sign in with an SMS code' })
        return
      }
      if (!verifyPassword(password, credential.passwordHash)) {
        sendError(res, 400, { code: 'wrong-password', message: 'wrong phone or password' })
        return
      }
      await completeLogin(req, res, phone, body.remember === true ? undefined : 0)
    },
  }), `web-login: POST ${AUTH_PASSWORD_LOGIN_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: AUTH_REGISTER_ROUTE,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      const wire = await readCredentialFields(req, res)
      if (wire === undefined) return
      const [phone, code, validPassword] = wire
      if (accounts.get(phone) !== undefined) {
        sendError(res, 409, { code: 'phone-registered', message: 'this phone is already registered; sign in instead' })
        return
      }
      if (!verifyChallenge(res, phone, code)) return
      const now = Date.now()
      const displayName = maskPhone(phone)
      await accounts.put(phone, { displayName, createdAt: now, lastLoginAt: now })
      await credentials.put(phone, {
        passwordHash: hashPassword(validPassword),
        createdAt: now,
        updatedAt: now,
      })
      loginSession.record({ phone, displayName })
      if (!issueLoginCookie(req, res, phone)) return
      const reply: RegisterResult = { ok: true, redirect: '/' }
      sendJson(res, 200, reply)
    },
  }), `web-login: POST ${AUTH_REGISTER_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: AUTH_PASSWORD_RESET_ROUTE,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      const wire = await readCredentialFields(req, res)
      if (wire === undefined) return
      const [phone, code, validPassword] = wire
      const existing = accounts.get(phone)
      if (existing === undefined) {
        // Refused before the challenge is touched, so probing for accounts
        // cannot consume another phone's verification attempts.
        sendError(res, 400, { code: 'no-account', message: 'this phone is not registered' })
        return
      }
      if (!verifyChallenge(res, phone, code)) return
      const now = Date.now()
      const current = credentials.get(phone)
      await credentials.put(phone, {
        passwordHash: hashPassword(validPassword),
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      })
      await accounts.put(phone, { ...existing, lastLoginAt: now })
      loginSession.record({ phone, displayName: existing.displayName })
      if (!issueLoginCookie(req, res, phone)) return
      const reply: PasswordResetResult = { ok: true, redirect: '/' }
      sendJson(res, 200, reply)
    },
  }), `web-login: POST ${AUTH_PASSWORD_RESET_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TEAM_INVITES_CREATE_ROUTE,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (rejectNonOwner(req, res)) return
      const body = await readPostObject(req, res)
      if (body === undefined) return
      const roles = rejectInvalidRoles(res, stringArrayField(body, 'roles'))
      if (roles === undefined) return
      const now = Date.now()
      const owner = maskPhone(ownerPhone() ?? '')
      const code = randomBytes(6).toString('base64url')
      const record: InviteRecord = {
        roles,
        createdBy: owner,
        createdAt: now,
        expiresAt: now + config.inviteValiditySeconds * 1000,
      }
      await invites.put(code, record)
      const reply: InviteCreateResult = { ok: true, code, expiresAt: record.expiresAt }
      sendJson(res, 200, reply)
    },
  }), `web-login: POST ${TEAM_INVITES_CREATE_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TEAM_INVITES_REDEEM_ROUTE,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      const subject = connection.sessionSubject(req)
      if (subject === undefined) {
        sendError(res, 401, { code: 'unauthenticated', message: 'log in first' })
        return
      }
      const body = await readPostObject(req, res)
      if (body === undefined) return
      const code = stringField(body, 'code')
      if (code === undefined || code.length === 0) {
        sendError(res, 400, { code: 'bad-invite', message: 'field "code" must be a non-empty string' })
        return
      }
      const invite = invites.get(code)
      if (invite === undefined) {
        sendError(res, 400, { code: 'bad-invite', message: 'unknown invite code' })
        return
      }
      if (invite.acceptedAt !== undefined) {
        sendError(res, 409, { code: 'invite-used', message: 'invite already redeemed' })
        return
      }
      const now = Date.now()
      if (now > invite.expiresAt) {
        sendError(res, 410, { code: 'invite-expired', message: 'invite expired' })
        return
      }
      const existing = members.get(subject)
      const roles = [...new Set([...(existing?.roles ?? []), ...invite.roles])]
      const record: MemberRecord = {
        roles,
        grantedBy: invite.createdBy,
        grantedAt: existing?.grantedAt ?? now,
      }
      await members.put(subject, record)
      await invites.put(code, { ...invite, acceptedAt: now })
      const reply: InviteRedeemResult = { ok: true, roles: record.roles }
      sendJson(res, 200, reply)
    },
  }), `web-login: POST ${TEAM_INVITES_REDEEM_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TEAM_MEMBERS_ROUTE,
    handler: (req, res) => {
      if (rejected(req, res)) return
      if (rejectNonOwner(req, res)) return
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendMethodNotAllowed(res, 'GET')
        return
      }
      const owner = ownerPhone() ?? ''
      const roster = [...members.entries()]
        .map(([phone, member]) => ({
          phone,
          displayName: accounts.get(phone)?.displayName ?? maskPhone(phone),
          roles: member.roles,
          grantedBy: member.grantedBy,
          grantedAt: member.grantedAt,
        }))
        .sort((a, b) => a.grantedAt - b.grantedAt || (a.phone < b.phone ? -1 : 1))
      const reply: MemberListResult = { ok: true, owner, members: roster }
      sendJson(res, 200, reply)
    },
  }), `web-login: GET ${TEAM_MEMBERS_ROUTE}`)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: TEAM_MEMBERS_PHONE_PREFIX,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      if (rejectNonOwner(req, res)) return
      if (req.method !== 'DELETE') {
        sendMethodNotAllowed(res, 'DELETE')
        return
      }
      const rest = req.url?.slice(TEAM_MEMBERS_PHONE_PREFIX.length) ?? ''
      const tail = (rest.startsWith('/') ? rest.slice(1) : rest).split('?', 1)[0] ?? ''
      let phone = ''
      try {
        phone = decodeURIComponent(tail)
      } catch {
        // Swallows the decode error: malformed percent-encoding is the reject case.
        sendError(res, 400, { code: 'bad-phone', message: 'phone must match ^1\\d{10}$' })
        return
      }
      if (!PHONE_PATTERN.test(phone)) {
        sendError(res, 400, { code: 'bad-phone', message: 'phone must match ^1\\d{10}$' })
        return
      }
      if (phone === ownerPhone()) {
        // The owner derives from the accounts table, so unbinding their roles
        // would not revoke ownership — refusing keeps that mismatch invisible.
        sendError(res, 403, { code: 'forbidden', message: 'the owner cannot be unbound' })
        return
      }
      await members.delete(phone)
      res.statusCode = 204
      res.end()
    },
  }), `web-login: DELETE ${TEAM_MEMBERS_PHONE_PREFIX}:phone`)
}
