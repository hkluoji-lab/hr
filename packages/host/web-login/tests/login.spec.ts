/**
 * Login-surface behavior over the real stack (WebServer + Loader + storage
 * hub/json/domain) with a controllable connection stub: page rendering, the
 * trust fence passthrough, body validation, challenge cooldown/expiry/
 * attempts, auto-registration with the masked display name, the password
 * credential flows (register, password login, reset), cookie minting with the
 * remember-me persistence through the connection service, and disposal.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import Storage from '@deepseek-ai/dsh-storage'
import {
  apply as storageJsonApply, Config as storageJsonConfig, inject as storageJsonInject, name as storageJsonName,
} from '@deepseek-ai/dsh-storage-json'
import {
  apply as storageDomainApply, Config as storageDomainConfig, inject as storageDomainInject, name as storageDomainName,
} from '@deepseek-ai/dsh-storage-domain'
import * as WebLogin from '../src/index.ts'

const PHONE = '13800001234'

/** Connection stub state each test controls. */
interface TrustStub {
  /** requestRejection answer for every request (401 = unauthenticated pass). */
  rejection: 401 | 403 | undefined
  /** sessionSubject answer (undefined = no logged-in account). */
  subject: string | undefined
  /** Subjects baked into issued cookies, recorded for assertions. */
  issued: (string | undefined)[]
  /** Persistence arguments seen with each issuance (undefined = default lifetime). */
  persisted: (number | undefined)[]
}

const trust: TrustStub = {
  rejection: 401,
  subject: undefined,
  issued: [],
  persisted: [],
}

/** The connection double: fence answer + session-cookie minting/clearing. */
function connectionStub() {
  return {
    requestRejection: () => trust.rejection,
    sessionSubject: () => trust.subject,
    issueSessionCookie: (_request: unknown, subject?: string, persistenceMilliseconds?: number) => {
      trust.issued.push(subject)
      trust.persisted.push(persistenceMilliseconds)
      const maxAgeSeconds = Math.floor((persistenceMilliseconds ?? 3_600_000) / 1000)
      return {
        name: 'dsh-auth-test',
        value: `v2.test.${subject ?? ''}`,
        maxAgeSeconds,
        expiresAt: Date.now() + 3_600_000,
      }
    },
    clearSessionCookie: () => 'dsh-auth-test=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict',
  }
}

let root: string | undefined
let storageRoot: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  if (storageRoot !== undefined) await rm(storageRoot, { recursive: true, force: true })
  root = undefined
  storageRoot = undefined
  trust.rejection = 401
  trust.subject = undefined
  trust.issued = []
  trust.persisted = []
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Boot webserver + storage + web-login rows through the real Loader. */
async function boot(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'dsh-web-login-'))
  storageRoot = await mkdtemp(join(tmpdir(), 'dsh-web-login-storage-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-json'",
    '  config:',
    `    root: ${JSON.stringify(storageRoot)}`,
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    '    backend: json',
    "- name: '@deepseek-ai/dsh-web-login'",
    '  config:',
    '    codeCooldownSeconds: 60',
    '    codeValiditySeconds: 300',
    '    maxVerificationAttempts: 5',
    '',
  ].join('\n'))

  context = new Context()
  context.provide('connection', connectionStub() as never)
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-host-webserver', WebServer],
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-json', { name: storageJsonName, inject: storageJsonInject, apply: storageJsonApply, Config: storageJsonConfig }],
    ['@deepseek-ai/dsh-storage-domain', { name: storageDomainName, inject: storageDomainInject, apply: storageDomainApply, Config: storageDomainConfig }],
    ['@deepseek-ai/dsh-web-login', WebLogin],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  expect([...context.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled)).toEqual([])
  return `http://127.0.0.1:${String(context.webServer.port)}`
}

/** Send a verification code and return the response beside the console-printed code. */
async function sendCode(base: string, phone: string): Promise<{ response: Response; code: string | undefined }> {
  const log = vi.spyOn(console, 'log')
  const response = await fetch(`${base}/auth/sms/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  const logged = log.mock.calls
    .map(arguments_ => arguments_.join(' '))
    .filter(text => text.includes('[演示] 验证码'))
    .at(-1)
  log.mockRestore()
  const code = logged?.match(/验证码 (\d{6})/)?.[1]
  return { response, code }
}

/** Verify one code for one phone. */
async function verify(base: string, phone: string, code: string): Promise<Response> {
  return fetch(`${base}/auth/sms/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  })
}

/** POST one JSON body to any route. */
function postJson(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Register one phone with a password through the demo SMS flow. */
async function registerWithPassword(base: string, phone: string, password: string): Promise<void> {
  const { code } = await sendCode(base, phone)
  const reply = await postJson(base, '/auth/register', { phone, code, password })
  expect(reply.status).toBe(200)
}

describe('web-login plugin surface', () => {
  it('keeps the function-plugin runtime surface to Loader exports', () => {
    expect(Object.keys(WebLogin).sort()).toEqual(['Config', 'ROLE_IDS', 'apply', 'inject', 'name'])
  })
})

describe('login page route', () => {
  it('renders the brand wall and the four tabs behind no-store', async () => {
    const base = await boot()
    const page = await fetch(`${base}/login`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(page.headers.get('cache-control')).toBe('no-store')
    const html = await page.text()
    expect(html).toContain('星躍智')
    expect(html).toContain('AI 秘书工作台')
    expect(html).toContain('密码登录')
    expect(html).toContain('验证码登录')
    expect(html).toContain('微信扫码')
    expect(html).toContain('即将上线')
    expect(html).toContain('id="pwd-phone"')
    expect(html).toContain('id="pwd-password"')
    expect(html).toContain('id="remember"')
    expect(html).toContain('id="forgot"')
    expect(html).toContain('id="reg-code"')
    expect(html).toContain('id="reg-password"')
    expect(html).toContain('id="agree"')
    expect(html).toContain('/auth/password/login')
    expect(html).toContain('/auth/register')
    expect(html).toContain('/auth/password/reset')
    expect(html).toContain('/auth/sms/send')
    expect(html).toContain('/auth/sms/verify')

    const head = await fetch(`${base}/login`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await head.text()).toBe('')
  })

  it('passes unauthenticated callers (401) and refuses fence rejections (403)', async () => {
    const base = await boot()
    expect((await fetch(`${base}/login`)).status).toBe(200)
    trust.rejection = 403
    expect((await fetch(`${base}/login`)).status).toBe(403)
    trust.rejection = undefined
    expect((await fetch(`${base}/login`)).status).toBe(200)
  })

  it('answers 405 with allow GET on other methods', async () => {
    const base = await boot()
    const post = await fetch(`${base}/login`, { method: 'POST' })
    expect(post.status).toBe(405)
    expect(post.headers.get('allow')).toBe('GET')
  })
})

describe('auth status route', () => {
  it('reports unauthenticated without a subject and the masked name with one', async () => {
    const base = await boot()
    const { response, code } = await sendCode(base, PHONE)
    expect(response.status).toBe(200)
    expect(code).toMatch(/^\d{6}$/)
    expect(await verify(base, PHONE, code!)).toHaveProperty('status', 200)

    const anonymous = await (await fetch(`${base}/auth/status`)).json() as { authenticated: boolean }
    expect(anonymous).toEqual({ authenticated: false })

    trust.subject = PHONE
    expect(await (await fetch(`${base}/auth/status`)).json()).toEqual({
      authenticated: true,
      subject: PHONE,
      displayName: '138****1234',
      isOwner: true,
    })
  })
})

describe('SMS send route', () => {
  it('validates the wire before the challenge store', async () => {
    const base = await boot()
    const post = (body: string, contentType = 'application/json'): Promise<Response> =>
      fetch(`${base}/auth/sms/send`, { method: 'POST', headers: { 'content-type': contentType }, body })

    expect((await post('{}', 'text/plain')).status).toBe(415)
    expect((await post('not json')).status).toBe(400)
    expect((await post('[]')).status).toBe(400)
    expect((await post('{"phone": 7}')).status).toBe(400)
    expect((await post('{"phone": "23800001234"}')).status).toBe(400)
    expect((await post('{"phone": "1380000123"}')).status).toBe(400)
    expect((await post('{"phone": "1380000123a"}')).status).toBe(400)
    expect((await post('{}')).status).toBe(400)
    const wrongMethod = await fetch(`${base}/auth/sms/send`)
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('POST')
  })

  it('issues one code per send under the cooldown, logging the demo code', async () => {
    const base = await boot()
    const first = await sendCode(base, PHONE)
    expect(first.response.status).toBe(200)
    expect(await first.response.json()).toEqual({ ok: true, cooldownSeconds: 60 })
    expect(first.code).toMatch(/^\d{6}$/)

    const second = await sendCode(base, PHONE)
    expect(second.response.status).toBe(429)
    const body = await second.response.json() as { code: string; cooldownSeconds: number }
    expect(body.code).toBe('cooldown')
    expect(body.cooldownSeconds).toBeGreaterThan(0)
    expect(body.cooldownSeconds).toBeLessThanOrEqual(60)

    vi.setSystemTime(Date.now() + 61_000)
    const third = await sendCode(base, PHONE)
    expect(third.response.status).toBe(200)
    expect(third.code).toMatch(/^\d{6}$/)
  })
})

describe('SMS verify route', () => {
  it('requires a live challenge and burns attempts before destroying it', async () => {
    const base = await boot()
    expect((await verify(base, PHONE, '000000')).status).toBe(400)
    expect(await (await verify(base, PHONE, '000000')).json())
      .toEqual({ code: 'no-challenge', message: 'request a code first' })

    const { code } = await sendCode(base, PHONE)
    for (let remaining = 4; remaining >= 1; remaining -= 1) {
      const wrong = await verify(base, PHONE, '000000')
      expect(wrong.status).toBe(400)
      expect(await wrong.json())
        .toEqual({ code: 'bad-code', message: 'wrong code', remainingAttempts: remaining })
    }
    const exhausted = await verify(base, PHONE, '000000')
    expect(exhausted.status).toBe(410)
    expect(await exhausted.json()).toEqual({ code: 'exhausted', message: 'challenge exhausted' })

    // Even the correct code is gone with the destroyed challenge.
    const correct = await verify(base, PHONE, code!)
    expect(correct.status).toBe(400)
    expect(await correct.json()).toEqual({ code: 'no-challenge', message: 'request a code first' })
  })

  it('expires the challenge past the validity window', async () => {
    const base = await boot()
    const { code } = await sendCode(base, PHONE)
    vi.setSystemTime(Date.now() + 301_000)
    const expired = await verify(base, PHONE, code!)
    expect(expired.status).toBe(410)
    expect(await expired.json()).toEqual({ code: 'expired', message: 'challenge expired' })
  })

  it('rejects a malformed wire before touching challenges', async () => {
    const base = await boot()
    const post = (body: string): Promise<Response> =>
      fetch(`${base}/auth/sms/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    expect((await post('{"phone": "13800001234"}')).status).toBe(400)
    expect((await post('{"phone": "23800001234", "code": "123456"}')).status).toBe(400)
    expect((await post('{"phone": "13800001234", "code": "12345"}')).status).toBe(400)
    expect((await post('{"phone": "13800001234", "code": "12345a"}')).status).toBe(400)
  })

  it('logs in, registers the account once, and mints the subject cookie', async () => {
    const base = await boot()
    const { code } = await sendCode(base, PHONE)
    const verified = await verify(base, PHONE, code!)
    expect(verified.status).toBe(200)
    expect(await verified.json()).toEqual({ ok: true, redirect: '/' })
    expect(trust.issued).toEqual([PHONE])
    const setCookie = verified.headers.get('set-cookie')
    expect(setCookie).toContain('dsh-auth-test=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Strict')
    expect(context?.loginSession.displayName()).toBe('138****1234')
    expect(context?.loginSession.phone()).toBe(PHONE)

    // The account persisted to the domain medium (single-layout unit file).
    const stored = await readFile(join(storageRoot!, 'web_login.json'), 'utf8')
    expect(stored).toContain('138****1234')
    expect(stored).toContain(PHONE)

    // Second login (past the cooldown) updates the account, never duplicates.
    vi.setSystemTime(Date.now() + 61_000)
    const again = await sendCode(base, PHONE)
    expect(again.response.status).toBe(200)
    const second = await verify(base, PHONE, again.code!)
    expect(second.status).toBe(200)
    expect(trust.issued).toEqual([PHONE, PHONE])
    expect(context?.loginSession.displayName()).toBe('138****1234')
  })
})

describe('register route', () => {
  it('validates the wire and the password policy before any state changes', async () => {
    const base = await boot()
    const post = (body: unknown): Promise<Response> => postJson(base, '/auth/register', body)
    expect((await post({ phone: '23800001234', code: '123456', password: 'secret123' })).status).toBe(400)
    expect((await post({ phone: PHONE, code: '12345', password: 'secret123' })).status).toBe(400)
    expect((await post({ phone: PHONE, code: '123456', password: 'short1' })).status).toBe(400)
    expect((await post({ phone: PHONE, code: '123456', password: 'nodigitsatall' })).status).toBe(400)
    expect((await post({ phone: PHONE, code: '123456', password: '12345678' })).status).toBe(400)
    expect((await post({ phone: PHONE, code: '123456', password: `${'a1'.repeat(32)}x` })).status).toBe(400)
    const weak = await post({ phone: PHONE, code: '123456', password: 'short1' })
    expect(await weak.json()).toMatchObject({ code: 'weak-password' })
    // Refused before any account or credential write.
    const stored = await readFile(join(storageRoot!, 'web_login.json'), 'utf8').catch(() => '')
    expect(stored).not.toContain(PHONE)
  })

  it('refuses an already-registered phone before touching the challenge', async () => {
    const base = await boot()
    await registerWithPassword(base, PHONE, 'secret123')
    const duplicate = await postJson(base, '/auth/register', { phone: PHONE, code: '123456', password: 'secret123' })
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toMatchObject({ code: 'phone-registered' })
  })

  it('requires a live challenge and registers with a hashed credential', async () => {
    const base = await boot()
    const missing = await postJson(base, '/auth/register', { phone: PHONE, code: '123456', password: 'secret123' })
    expect(missing.status).toBe(400)
    expect(await missing.json()).toMatchObject({ code: 'no-challenge' })

    const { code } = await sendCode(base, PHONE)
    const registered = await postJson(base, '/auth/register', { phone: PHONE, code, password: 'secret123' })
    expect(registered.status).toBe(200)
    expect(await registered.json()).toEqual({ ok: true, redirect: '/' })
    expect(trust.issued).toEqual([PHONE])
    expect(registered.headers.get('set-cookie')).toContain('HttpOnly')
    expect(context?.loginSession.displayName()).toBe('138****1234')

    const stored = await readFile(join(storageRoot!, 'web_login.json'), 'utf8')
    expect(stored).toContain('passwordHash')
    expect(stored).toContain('scrypt$')

    // The credential answers the password login route immediately.
    const login = await postJson(base, '/auth/password/login', { phone: PHONE, password: 'secret123' })
    expect(login.status).toBe(200)
  })
})

describe('password login route', () => {
  it('validates the wire before reading credentials', async () => {
    const base = await boot()
    expect((await postJson(base, '/auth/password/login', { phone: '23800001234', password: 'x' })).status).toBe(400)
    expect((await postJson(base, '/auth/password/login', { phone: PHONE })).status).toBe(400)
    expect((await postJson(base, '/auth/password/login', { phone: PHONE, password: '' })).status).toBe(400)
  })

  it('refuses accounts without a credential and wrong passwords', async () => {
    const base = await boot()
    const noCredential = await postJson(base, '/auth/password/login', { phone: PHONE, password: 'secret123' })
    expect(noCredential.status).toBe(400)
    expect(await noCredential.json()).toMatchObject({ code: 'no-credential' })
    expect(context?.loginSession.phone()).toBeUndefined()

    await registerWithPassword(base, PHONE, 'secret123')
    expect(trust.issued).toEqual([PHONE])
    const wrong = await postJson(base, '/auth/password/login', { phone: PHONE, password: 'wrongpass1' })
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toMatchObject({ code: 'wrong-password' })
    // A failed login mints no cookie and keeps the earlier registration identity.
    expect(trust.issued).toEqual([PHONE])
    expect(context?.loginSession.displayName()).toBe('138****1234')
  })

  it('logs in and passes the remember flag as the cookie persistence', async () => {
    const base = await boot()
    await registerWithPassword(base, PHONE, 'secret123')
    trust.issued = []
    trust.persisted = []

    // Unchecked remember: a session cookie (persistence 0, no Max-Age).
    const session = await postJson(base, '/auth/password/login', { phone: PHONE, password: 'secret123' })
    expect(session.status).toBe(200)
    expect(await session.json()).toEqual({ ok: true, redirect: '/' })
    expect(trust.issued).toEqual([PHONE])
    expect(trust.persisted).toEqual([0])
    const sessionCookie = session.headers.get('set-cookie') ?? ''
    expect(sessionCookie).toContain('HttpOnly')
    expect(sessionCookie).not.toContain('Max-Age')

    // Checked remember: the connection default lifetime (undefined persistence).
    const persistent = await postJson(base, '/auth/password/login', {
      phone: PHONE, password: 'secret123', remember: true,
    })
    expect(persistent.status).toBe(200)
    expect(trust.persisted).toEqual([0, undefined])
    expect((persistent.headers.get('set-cookie') ?? '')).toContain('Max-Age=')
    expect(context?.loginSession.displayName()).toBe('138****1234')
  })
})

describe('password reset route', () => {
  it('refuses unknown accounts before touching the challenge', async () => {
    const base = await boot()
    const reset = await postJson(base, '/auth/password/reset', { phone: PHONE, code: '123456', password: 'secret123' })
    expect(reset.status).toBe(400)
    expect(await reset.json()).toMatchObject({ code: 'no-account' })
  })

  it('validates the password policy before the challenge', async () => {
    const base = await boot()
    await registerWithPassword(base, PHONE, 'secret123')
    const reset = await postJson(base, '/auth/password/reset', { phone: PHONE, code: '123456', password: 'short1' })
    expect(reset.status).toBe(400)
    expect(await reset.json()).toMatchObject({ code: 'weak-password' })
  })

  it('rotates the credential and logs in with the new password', async () => {
    const base = await boot()
    await registerWithPassword(base, PHONE, 'secret123')

    const { code } = await sendCode(base, PHONE)
    const reset = await postJson(base, '/auth/password/reset', { phone: PHONE, code, password: 'renewed456' })
    expect(reset.status).toBe(200)
    expect(await reset.json()).toEqual({ ok: true, redirect: '/' })
    expect(trust.issued).toEqual([PHONE, PHONE])

    const oldPassword = await postJson(base, '/auth/password/login', { phone: PHONE, password: 'secret123' })
    expect(oldPassword.status).toBe(400)
    const newPassword = await postJson(base, '/auth/password/login', { phone: PHONE, password: 'renewed456' })
    expect(newPassword.status).toBe(200)
    expect(context?.loginSession.displayName()).toBe('138****1234')
  })
})

describe('logout route', () => {
  it('clears the cookie with 204 and refuses other methods', async () => {
    const base = await boot()
    const logout = await fetch(`${base}/auth/logout`, { method: 'POST' })
    expect(logout.status).toBe(204)
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
    const wrongMethod = await fetch(`${base}/auth/logout`)
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('POST')
  })
})

describe('member invites and roster', () => {
  const OWNER = '13800001234'
  const MEMBER = '13900005678'

  /** Register/login one phone through the demo SMS flow. */
  async function register(base: string, phone: string): Promise<void> {
    const { code } = await sendCode(base, phone)
    expect(await verify(base, phone, code!)).toHaveProperty('status', 200)
  }

  /** POST one JSON body to a team route. */
  function post(base: string, path: string, body: string): Promise<Response> {
    return fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  }

  it('guards the management routes on ownership and redeem on the session', async () => {
    const base = await boot()
    // Anonymous callers answer 401 with the structured error.
    const anonymousList = await fetch(`${base}/team/members`)
    expect(anonymousList.status).toBe(401)
    expect(await anonymousList.json()).toEqual({ code: 'unauthenticated', message: 'log in first' })
    expect((await post(base, '/team/invites', '{"roles":["accountant"]}')).status).toBe(401)
    expect((await fetch(`${base}/team/members/${MEMBER}`, { method: 'DELETE' })).status).toBe(401)

    // A logged-in non-owner manages nothing (OWNER registered first is the owner).
    await register(base, OWNER)
    await register(base, MEMBER)
    trust.subject = MEMBER
    expect((await fetch(`${base}/team/members`)).status).toBe(403)
    expect((await post(base, '/team/invites', '{"roles":["accountant"]}')).status).toBe(403)
    expect((await fetch(`${base}/team/members/${OWNER}`, { method: 'DELETE' })).status).toBe(403)
  })

  it('creates an invite as the owner and the member redeems it once', async () => {
    const base = await boot()
    await register(base, OWNER)
    await register(base, MEMBER)

    trust.subject = OWNER
    const created = await post(base, '/team/invites', JSON.stringify({ roles: ['accountant'] }))
    expect(created.status).toBe(200)
    const invite = await created.json() as { ok: true; code: string; expiresAt: number }
    expect(invite.ok).toBe(true)
    expect(invite.code).toMatch(/^[A-Za-z0-9_-]{6,12}$/)
    expect(invite.expiresAt).toBeGreaterThan(Date.now())
    // The invite persisted with its roles beside the accounts.
    const stored = await readFile(join(storageRoot!, 'web_login.json'), 'utf8')
    expect(stored).toContain(invite.code)
    expect(stored).toContain('accountant')

    // Redemption always binds the session subject.
    trust.subject = MEMBER
    const redeemed = await post(base, '/team/invites/redeem', JSON.stringify({ code: invite.code }))
    expect(redeemed.status).toBe(200)
    expect(await redeemed.json()).toEqual({ ok: true, roles: ['accountant'] })
    expect(await (await fetch(`${base}/auth/status`)).json()).toEqual({
      authenticated: true,
      subject: MEMBER,
      displayName: '139****5678',
      roles: ['accountant'],
    })

    // An invite is single use; unknown codes are refused before any write.
    expect((await post(base, '/team/invites/redeem', JSON.stringify({ code: invite.code }))).status).toBe(409)
    const unknown = await post(base, '/team/invites/redeem', JSON.stringify({ code: 'no-such-code' }))
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toEqual({ code: 'bad-invite', message: 'unknown invite code' })
  })

  it('rejects invalid roles payloads with 400', async () => {
    const base = await boot()
    await register(base, OWNER)
    trust.subject = OWNER
    expect((await post(base, '/team/invites', '{"roles":[]}')).status).toBe(400)
    expect((await post(base, '/team/invites', '{"roles":["boss"]}')).status).toBe(400)
    expect((await post(base, '/team/invites', '{"roles":["secretary","secretary"]}')).status).toBe(400)
    expect((await post(base, '/team/invites', '{"roles":"accountant"}')).status).toBe(400)
    expect((await post(base, '/team/invites', '{}')).status).toBe(400)
  })

  it('expires invites past the configured validity window', async () => {
    const base = await boot()
    await register(base, OWNER)
    trust.subject = OWNER
    const created = await post(base, '/team/invites', JSON.stringify({ roles: ['legal'] }))
    const invite = await created.json() as { code: string }
    vi.setSystemTime(Date.now() + 604_801_000)
    trust.subject = MEMBER
    const expired = await post(base, '/team/invites/redeem', JSON.stringify({ code: invite.code }))
    expect(expired.status).toBe(410)
    expect(await expired.json()).toEqual({ code: 'invite-expired', message: 'invite expired' })
  })

  it('unions roles across invites and keeps the first grant time', async () => {
    const base = await boot()
    await register(base, OWNER)
    await register(base, MEMBER)

    const createCode = async (roles: string[]): Promise<string> => {
      trust.subject = OWNER
      const reply = await post(base, '/team/invites', JSON.stringify({ roles }))
      expect(reply.status).toBe(200)
      return (await reply.json() as { code: string }).code
    }
    const redeem = async (code: string): Promise<Response> => {
      trust.subject = MEMBER
      return post(base, '/team/invites/redeem', JSON.stringify({ code }))
    }
    expect((await redeem(await createCode(['accountant']))).status).toBe(200)
    expect(await (await redeem(await createCode(['legal', 'audit']))).json())
      .toEqual({ ok: true, roles: ['accountant', 'legal', 'audit'] })
    const status = await (await fetch(`${base}/auth/status`)).json() as { roles: string[] }
    expect(status.roles).toEqual(['accountant', 'legal', 'audit'])
  })

  it('lists the roster for the owner only, with grant facts', async () => {
    const base = await boot()
    await register(base, OWNER)
    await register(base, MEMBER)
    trust.subject = OWNER
    const created = await post(base, '/team/invites', JSON.stringify({ roles: ['accountant'] }))
    trust.subject = MEMBER
    await post(base, '/team/invites/redeem', JSON.stringify({ code: (await created.json() as { code: string }).code }))

    trust.subject = OWNER
    const listed = await fetch(`${base}/team/members`)
    expect(listed.status).toBe(200)
    const roster = await listed.json() as {
      ok: true
      owner: string
      members: { phone: string; displayName: string; roles: string[]; grantedBy: string; grantedAt: number }[]
    }
    expect(roster.ok).toBe(true)
    expect(roster.owner).toBe(OWNER)
    expect(roster.members).toEqual([{
      phone: MEMBER,
      displayName: '139****5678',
      roles: ['accountant'],
      grantedBy: '138****1234',
      grantedAt: roster.members[0]?.grantedAt,
    }])
  })

  it('unbinds a member and refuses the owner itself and malformed phones', async () => {
    const base = await boot()
    await register(base, OWNER)
    await register(base, MEMBER)
    trust.subject = OWNER
    const created = await post(base, '/team/invites', JSON.stringify({ roles: ['accountant'] }))
    trust.subject = MEMBER
    await post(base, '/team/invites/redeem', JSON.stringify({ code: (await created.json() as { code: string }).code }))

    trust.subject = OWNER
    const unbind = async (phone: string): Promise<Response> =>
      fetch(`${base}/team/members/${encodeURIComponent(phone)}`, { method: 'DELETE' })
    expect((await unbind('not-a-phone')).status).toBe(400)
    expect((await unbind(OWNER)).status).toBe(403)

    expect((await unbind(MEMBER)).status).toBe(204)
    trust.subject = MEMBER
    expect(await (await fetch(`${base}/auth/status`)).json()).toEqual({
      authenticated: true,
      subject: MEMBER,
      displayName: '139****5678',
    })
    trust.subject = OWNER
    const roster = await (await fetch(`${base}/team/members`)).json() as { members: unknown[] }
    expect(roster.members).toEqual([])
  })

  it('derives ownership from the earliest registration, not the newest', async () => {
    const base = await boot()
    await register(base, OWNER)
    vi.setSystemTime(Date.now() + 1000)
    await register(base, MEMBER)

    trust.subject = MEMBER
    expect((await (await fetch(`${base}/auth/status`)).json())).not.toHaveProperty('isOwner')
    trust.subject = OWNER
    const status = await (await fetch(`${base}/auth/status`)).json() as { isOwner?: boolean }
    expect(status.isOwner).toBe(true)
  })
})

describe('trust fence and disposal', () => {
  it('refuses every route on a fence rejection', async () => {
    const base = await boot()
    trust.rejection = 403
    expect((await fetch(`${base}/login`)).status).toBe(403)
    expect((await fetch(`${base}/auth/status`)).status).toBe(403)
    expect((await fetch(`${base}/auth/sms/send`, { method: 'POST' })).status).toBe(403)
    expect((await fetch(`${base}/auth/sms/verify`, { method: 'POST' })).status).toBe(403)
    expect((await fetch(`${base}/auth/password/login`, { method: 'POST' })).status).toBe(403)
    expect((await fetch(`${base}/auth/register`, { method: 'POST' })).status).toBe(403)
    expect((await fetch(`${base}/auth/password/reset`, { method: 'POST' })).status).toBe(403)
    expect((await fetch(`${base}/auth/logout`, { method: 'POST' })).status).toBe(403)
    expect((await fetch(`${base}/team/invites`, { method: 'POST' })).status).toBe(403)
    expect((await fetch(`${base}/team/invites/redeem`, { method: 'POST' })).status).toBe(403)
    expect((await fetch(`${base}/team/members`)).status).toBe(403)
    expect((await fetch(`${base}/team/members/13800001234`, { method: 'DELETE' })).status).toBe(403)
  })

  it('removes every route when the plugin fiber is disposed (HMR safety)', async () => {
    const base = await boot()
    expect((await fetch(`${base}/login`)).status).toBe(200)
    const entry = [...(context as Context).loader.entries()]
      .find(candidate => candidate.options.name === '@deepseek-ai/dsh-web-login')
    await entry?.fiber?.dispose()
    expect((await fetch(`${base}/login`)).status).toBe(404)
    expect((await fetch(`${base}/auth/status`)).status).toBe(404)
    expect((await fetch(`${base}/auth/sms/send`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/auth/sms/verify`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/auth/password/login`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/auth/register`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/auth/password/reset`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/auth/logout`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/team/invites`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/team/invites/redeem`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/team/members`)).status).toBe(404)
    expect((await fetch(`${base}/team/members/13800001234`, { method: 'DELETE' })).status).toBe(404)
  })
})
