/**
 * Workbench service behavior over the real storage stack (storage hub + json
 * backend + domain form) with doubles for the roster and session services:
 * credits balance and grants, grant validation, team aggregation
 * (online/busy/offline, broken-last), the secretary-company client master,
 * filing-obligation ledger (CRUD, validation, due-tier ladder, the current
 * year's compliance schedule), the signature-delivery ledger (CRUD,
 * follow-up ladder, longest-waiting-first queue), the follow-up center
 * (queue folding, reminder logging, refusals), and durability across a
 * service restart on the same medium — including the pre-clients medium shape.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import Storage from '@deepseek-ai/dsh-storage'
import {
  apply as storageJsonApply, Config as storageJsonConfig, inject as storageJsonInject, name as storageJsonName,
} from '@deepseek-ai/dsh-storage-json'
import {
  apply as storageDomainApply, Config as storageDomainConfig, inject as storageDomainInject, name as storageDomainName,
} from '@deepseek-ai/dsh-storage-domain'
import Workbench, {
  DELIVERY_CHASE_DAYS, DELIVERY_ESCALATE_DAYS, DELIVERY_NUDGE_DAYS,
  LEDGER_READ_LIMIT, NAR1_FILING_WINDOW_DAYS, type Config,
  type WorkbenchComplianceStatus, type WorkbenchDeliveryChannel, type WorkbenchObligationKind,
} from '../src/index.ts'
import { creditEntrySchema } from '../src/spec.ts'

/** On-disk per-record envelope the json backend writes for one ledger row. */
const ledgerFileSchema = z.object({
  version: z.number(),
  record: creditEntrySchema,
})

/** Minimal roster row (the service reads id/name/description/broken). */
interface RosterRow {
  id: string
  trust: 'system' | 'user'
  name?: string
  description?: string
  broken?: string
}

/** One session double: opaque to the service, handed back to projections. */
interface SessionDouble {
  id: string
  preset: string | null
  /** Turn boundary; lastTurn 0 means still blank. */
  lastTurn: number
  openTurnStartSeq: number | null
}

/** Harness handles. */
interface Harness {
  ctx: Context
  workbench: Workbench
  root: string
  /** Dispose just the workbench fiber (closes its domain), keeping storage. */
  stopService: () => Promise<void>
  /** Dispose the whole context. */
  dispose: () => Promise<void>
}

const roots: string[] = []

/** Boot storage + storage-domain over a temp json root, with service doubles. */
async function harness(config: Partial<Config> = {}, initial: {
  roster?: RosterRow[]
  sessions?: SessionDouble[]
  root?: string
} = {}): Promise<Harness> {
  const root = initial.root ?? await mkdtemp(join(tmpdir(), 'dsh-workbench-'))
  if (initial.root === undefined) roots.push(root)
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(
    { name: storageJsonName, inject: storageJsonInject, apply: storageJsonApply, Config: storageJsonConfig },
    { root },
  )
  await ctx.plugin(
    { name: storageDomainName, inject: storageDomainInject, apply: storageDomainApply, Config: storageDomainConfig },
    { backend: 'json' },
  )

  const roster: RosterRow[] = initial.roster ?? []
  const sessions: SessionDouble[] = initial.sessions ?? []
  ctx.provide('agentPresets', { list: async () => roster } as never)
  ctx.provide('sessions', { list: () => sessions } as never)
  ctx.provide('sessionProjections', {
    stateOf: (session: SessionDouble, key: string) => {
      if (key === 'agentPreset') return session.preset
      if (key === 'turnBoundary') {
        return { openTurnStartSeq: session.openTurnStartSeq, lastTurn: session.lastTurn }
      }
      return undefined
    },
  } as never)

  const fiber = await ctx.plugin(Workbench, { startingBalance: 0, maxGrant: 500, ...config })
  const workbench = ctx.workbench
  return {
    ctx,
    workbench,
    root,
    stopService: async () => { await fiber.dispose() },
    dispose: async () => { await ctx.fiber.dispose() },
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('workbench credits', () => {
  it('serves the configured starting balance on a fresh medium', async () => {
    const { workbench } = await harness({ startingBalance: 12 })
    const snapshot = await workbench.remoteSnapshot()
    expect(snapshot.credits.balance).toBe(12)
  })

  it('appends a ledger entry and accumulates the balance', async () => {
    const { workbench } = await harness()
    const first = await workbench.addCredits(50, '  finished a report ')
    expect(first.balance).toBe(50)
    expect(first.entry.amount).toBe(50)
    expect(first.entry.reason).toBe('finished a report')
    expect(Number.isInteger(first.entry.at)).toBe(true)
    expect(first.entry.id.length).toBeGreaterThan(0)

    const second = await workbench.addCredits(7, 'bonus')
    expect(second.balance).toBe(57)
    expect(second.entry.id).not.toBe(first.entry.id)
  })

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['fractional', 2.5],
    ['above the configured cap', 501],
  ])('rejects a %s amount without changing the balance', async (_label, amount) => {
    const { workbench } = await harness()
    await expect(workbench.addCredits(amount, 'reason')).rejects.toSatisfy((error: unknown) => {
      return error instanceof RemoteError && error.code === 'gateway/bad-request'
    })
    expect((await workbench.remoteSnapshot()).credits.balance).toBe(0)
  })

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['too long', 'x'.repeat(201)],
  ])('rejects a %s reason without changing the balance', async (_label, reason) => {
    const { workbench } = await harness()
    await expect(workbench.addCredits(10, reason)).rejects.toSatisfy((error: unknown) => {
      return error instanceof RemoteError && error.code === 'gateway/bad-request'
    })
    expect((await workbench.remoteSnapshot()).credits.balance).toBe(0)
  })

  it('persists the balance and ledger across a service restart', async () => {
    const h = await harness()
    const grant = await h.workbench.addCredits(88, 'milestone')
    await h.dispose()

    // Reopen the same medium with a different configured starting balance:
    // the stored global must win over the fresh-medium default.
    const reopened = await harness({ startingBalance: 999 }, { root: h.root })
    const snapshot = await reopened.workbench.remoteSnapshot()
    expect(snapshot.credits.balance).toBe(88)

    const entriesDir = join(reopened.root, 'workbench', 'entries')
    const files = await readdir(entriesDir)
    expect(files).toHaveLength(1)
    const fileName = files[0]
    if (fileName === undefined) throw new Error('ledger entry missing')
    expect(fileName).toBe(`${grant.entry.id}.json`)
    const parsed: unknown = JSON.parse(await readFile(join(entriesDir, fileName), 'utf8'))
    const stored = ledgerFileSchema.parse(parsed)
    expect(stored.record.amount).toBe(88)
    expect(stored.record.reason).toBe('milestone')
    await reopened.dispose()
  })
})

describe('workbench user read', () => {
  it('reports the host account display name for the greeting', async () => {
    const { workbench } = await harness()
    const { user } = await workbench.remoteSnapshot()
    // The exact name is the test host's account; the contract is a non-empty name.
    expect(user?.name.length ?? 0).toBeGreaterThan(0)
  })

  it('prefers the web login display name over the host account', async () => {
    const { ctx, workbench } = await harness()
    // The soft read mirrors composition: web-login provides `loginSession`,
    // and a login recorded after boot must still reach the next snapshot.
    ctx.provide('loginSession', { displayName: () => '138****1234' } as never)
    expect(await workbench.remoteSnapshot().then(s => s.user)).toEqual({ name: '138****1234' })
  })
})

describe('workbench ledger read', () => {
  it('serves an empty ledger on a fresh medium', async () => {
    const { workbench } = await harness()
    expect(await workbench.remoteLedger()).toEqual({ entries: [] })
  })

  it('serves every grant with its amount, reason, and non-increasing time', async () => {
    const { workbench } = await harness()
    const granted = [
      await workbench.addCredits(5, 'first'),
      await workbench.addCredits(9, 'second'),
      await workbench.addCredits(2, 'third'),
    ]
    const { entries } = await workbench.remoteLedger()
    expect([...entries].map(entry => entry.amount).sort((a, b) => a - b)).toEqual([2, 5, 9])
    expect([...entries].map(entry => entry.reason).sort()).toEqual(['first', 'second', 'third'])
    expect(new Set(entries.map(entry => entry.id))).toEqual(
      new Set(granted.map(grant => grant.entry.id)),
    )
    const times = entries.map(entry => entry.at)
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it('bounds the page to the most recent grants', async () => {
    const { workbench } = await harness()
    for (let index = 0; index < LEDGER_READ_LIMIT + 1; index += 1) {
      await workbench.addCredits(1, `grant ${index}`)
    }
    const { entries } = await workbench.remoteLedger()
    expect(entries).toHaveLength(LEDGER_READ_LIMIT)
  })
})

describe('workbench team aggregation', () => {
  const roster: RosterRow[] = [
    { id: 'standard', trust: 'system', name: '标准模式' },
    { id: 'ptc', trust: 'system' },
    { id: 'staged-blank', trust: 'user' },
    { id: 'retired', trust: 'user', broken: 'missing plugin' },
  ]

  it('folds live sessions into online/busy/offline and sorts broken last', async () => {
    const { workbench } = await harness({}, {
      roster,
      sessions: [
        { id: 's1', preset: 'standard', lastTurn: 2, openTurnStartSeq: null },
        { id: 's2', preset: 'ptc', lastTurn: 0, openTurnStartSeq: 3 },
        // Preset staged onto a still-blank session: not work yet.
        { id: 's3', preset: 'staged-blank', lastTurn: 0, openTurnStartSeq: null },
      ],
    })
    const { team } = await workbench.remoteSnapshot()
    expect(team.busy).toBe(2)
    expect(team.offline).toBe(1)
    expect(team.online).toBe(3)
    expect(team.members.map(member => member.id))
      .toEqual(['standard', 'ptc', 'staged-blank', 'retired'])
    expect(team.members.map(member => member.status))
      .toEqual(['busy', 'busy', 'online', 'offline'])
    expect(team.members[0]!.name).toBe('标准模式')
  })

  it('reports an empty team on a rosterless deployment', async () => {
    const { workbench } = await harness()
    const { team } = await workbench.remoteSnapshot()
    expect(team).toEqual({ online: 0, busy: 0, offline: 0, members: [] })
  })
})

/** Milliseconds in one UTC day; the deadline arithmetic's unit. */
const MILLIS_PER_DAY = 86_400_000

/** The current UTC year, `YYYY`. */
function currentYear(): string {
  return String(new Date().getUTCFullYear())
}

/** The UTC calendar date `days` days from today's UTC midnight, `YYYY-MM-DD`. */
function isoDaysFromToday(days: number): string {
  const now = new Date()
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * MILLIS_PER_DAY)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/** Assert the promise rejects with a RemoteError carrying exactly `code`. */
async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    return error instanceof RemoteError && error.code === code
  })
}

describe('workbench client master', () => {
  const base = { nameCn: 'ABC 贸易有限公司', incorporationDate: '2024-03-15' }

  it('creates a row with the C-<year>-0001 id and the green default', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient(base)
    expect(client.id).toBe(`C-${currentYear()}-0001`)
    expect(client.nameCn).toBe('ABC 贸易有限公司')
    expect(client.incorporationDate).toBe('2024-03-15')
    expect(client.complianceStatus).toBe('green')
    expect(client.openObligations).toBe(0)
    expect(client.nameEn).toBeUndefined()
  })

  it('advances the serial past ids already stored for the year', async () => {
    const { workbench } = await harness()
    const first = await workbench.addClient(base)
    const second = await workbench.addClient({ ...base, nameCn: '乙公司' })
    expect(first.client.id).toBe(`C-${currentYear()}-0001`)
    expect(second.client.id).toBe(`C-${currentYear()}-0002`)
  })

  it('stores optional fields trimmed and only when non-blank', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient({
      ...base,
      nameEn: '  ABC Trading Limited ',
      brNo: '   ',
      contactEmail: ' billing@example.com ',
    })
    expect(client.nameEn).toBe('ABC Trading Limited')
    expect(client.brNo).toBeUndefined()
    expect(client.contactEmail).toBe('billing@example.com')
  })

  it.each([
    ['blank name', { nameCn: '   ' }],
    ['malformed incorporation date', { incorporationDate: '2024/03/15' }],
    ['unknown compliance status', { complianceStatus: 'purple' as WorkbenchComplianceStatus }],
    ['overlong optional field', { brNo: 'x'.repeat(121) }],
  ])('rejects a client creation with a %s', async (_label, patch) => {
    const { workbench } = await harness()
    await expectCode(workbench.addClient({ ...base, ...patch }), 'gateway/bad-request')
    expect(await workbench.remoteClients()).toEqual({ clients: [] })
  })

  it('lists clients in creation order with open-obligation and open-delivery counts', async () => {
    const { workbench } = await harness()
    const a = await workbench.addClient({ ...base, nameCn: '甲公司' })
    const b = await workbench.addClient({ ...base, nameCn: '乙公司' })
    await workbench.addObligation({ clientId: a.client.id, kind: 'NAR1', periodLabel: currentYear(), dueDate: isoDaysFromToday(10) })
    await workbench.addObligation({ clientId: a.client.id, kind: 'ITR', periodLabel: currentYear(), dueDate: isoDaysFromToday(40) })
    const ptr = await workbench.addObligation({ clientId: b.client.id, kind: 'PTR', periodLabel: currentYear(), dueDate: isoDaysFromToday(20) })
    await workbench.markObligation(ptr.obligation.id, 'submitted')
    await workbench.addDelivery({ clientId: a.client.id, title: '年报套装' })
    const signed = await workbench.addDelivery({ clientId: a.client.id, title: '变更决议' })
    await workbench.markDelivery(signed.delivery.id, 'signed')

    const { clients } = await workbench.remoteClients()
    expect(clients.map(row => [row.nameCn, row.openObligations, row.openDeliveries]))
      .toEqual([['甲公司', 2, 1], ['乙公司', 0, 0]])
  })

  it('removes a client and cascades its obligations and deliveries', async () => {
    const { workbench } = await harness()
    const removed = await workbench.addClient({ ...base, nameCn: '甲公司' })
    const kept = await workbench.addClient({ ...base, nameCn: '乙公司' })
    await workbench.addObligation({ clientId: removed.client.id, kind: 'NAR1', periodLabel: currentYear(), dueDate: isoDaysFromToday(10) })
    await workbench.addObligation({ clientId: kept.client.id, kind: 'ITR', periodLabel: currentYear(), dueDate: isoDaysFromToday(10) })
    await workbench.addDelivery({ clientId: removed.client.id, title: '年报套装' })
    await workbench.addDelivery({ clientId: kept.client.id, title: '变更决议' })

    await workbench.removeClient(removed.client.id)

    expect((await workbench.remoteClients()).clients.map(row => row.id)).toEqual([kept.client.id])
    expect((await workbench.remoteObligations()).obligations.map(row => row.clientId)).toEqual([kept.client.id])
    expect((await workbench.remoteDeliveries()).deliveries.map(row => row.clientId)).toEqual([kept.client.id])
  })

  it('rejects removing an unknown client', async () => {
    const { workbench } = await harness()
    await expectCode(workbench.removeClient('C-2020-9999'), 'workbench/client-not-found')
  })

  it('persists clients and obligations across a service restart', async () => {
    const h = await harness()
    const { client } = await h.workbench.addClient(base)
    await h.workbench.addObligation({ clientId: client.id, kind: 'AB56', periodLabel: currentYear(), dueDate: isoDaysFromToday(10) })
    await h.dispose()

    const reopened = await harness({}, { root: h.root })
    expect((await reopened.workbench.remoteClients()).clients.map(row => row.id)).toEqual([client.id])
    const { obligations } = await reopened.workbench.remoteObligations()
    expect(obligations).toHaveLength(1)
    expect(obligations[0]!.clientId).toBe(client.id)
    await reopened.dispose()
  })

  it('reads a pre-clients medium with empty client, obligation, and delivery tables', async () => {
    // The old medium shape is ledger entries plus the global with no
    // clients/obligations/deliveries documents; per-record reads treat a
    // missing declared table as empty, so the domain version stays 1.
    const h = await harness()
    await h.workbench.addCredits(20, 'pre-clients grant')
    await h.dispose()
    await expect(readdir(join(h.root, 'workbench', 'clients'))).rejects.toThrow()
    await expect(readdir(join(h.root, 'workbench', 'obligations'))).rejects.toThrow()
    await expect(readdir(join(h.root, 'workbench', 'deliveries'))).rejects.toThrow()

    const reopened = await harness({}, { root: h.root })
    expect(await reopened.workbench.remoteClients()).toEqual({ clients: [] })
    expect(await reopened.workbench.remoteObligations()).toEqual({ obligations: [] })
    expect(await reopened.workbench.remoteDeliveries()).toEqual({ deliveries: [] })
    expect((await reopened.workbench.remoteSnapshot()).credits.balance).toBe(20)
    const { client } = await reopened.workbench.addClient(base)
    expect(client.id).toBe(`C-${currentYear()}-0001`)
    await reopened.dispose()
  })
})

describe('workbench obligation ledger', () => {
  it('records an obligation open by default, joined with the client name and today\'s tier', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient({ nameCn: '甲公司', incorporationDate: '2024-03-15' })
    const { obligation } = await workbench.addObligation({
      clientId: client.id, kind: 'ITR', periodLabel: currentYear(), dueDate: isoDaysFromToday(3),
    })
    expect(obligation.clientId).toBe(client.id)
    expect(obligation.clientNameCn).toBe('甲公司')
    expect(obligation.status).toBe('open')
    expect(obligation.daysUntilDue).toBe(3)
    expect(obligation.dueTier).toBe('d7')
  })

  it('rejects recording against an unknown client', async () => {
    const { workbench } = await harness()
    await expectCode(
      workbench.addObligation({ clientId: 'C-2020-9999', kind: 'NAR1', periodLabel: '2026', dueDate: '2026-04-12' }),
      'workbench/client-not-found',
    )
  })

  it.each([
    ['unknown filing kind', { kind: 'XYZ' as WorkbenchObligationKind }],
    ['malformed due date', { dueDate: '2026/04/01' }],
    ['blank period label', { periodLabel: '   ' }],
  ])('rejects a recording with a %s', async (_label, patch) => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient({ nameCn: '甲公司', incorporationDate: '2024-03-15' })
    await expectCode(
      workbench.addObligation({ clientId: client.id, kind: 'NAR1', periodLabel: '2026', dueDate: '2026-04-12', ...patch }),
      'gateway/bad-request',
    )
  })

  it('lists open rows first, each group soonest due first, joined with client names', async () => {
    const { workbench } = await harness()
    const a = await workbench.addClient({ nameCn: '甲公司', incorporationDate: '2024-03-15' })
    const b = await workbench.addClient({ nameCn: '乙公司', incorporationDate: '2020-08-01' })
    await workbench.addObligation({ clientId: a.client.id, kind: 'ITR', periodLabel: '2025', dueDate: `${currentYear()}-06-30` })
    await workbench.addObligation({ clientId: b.client.id, kind: 'NAR1', periodLabel: currentYear(), dueDate: `${currentYear()}-03-15` })
    const submitted = await workbench.addObligation({ clientId: a.client.id, kind: 'PTR', periodLabel: '2024', dueDate: `${currentYear()}-01-05` })
    await workbench.markObligation(submitted.obligation.id, 'submitted')

    const { obligations } = await workbench.remoteObligations()
    expect(obligations.map(row => [row.clientNameCn, row.kind, row.status])).toEqual([
      ['乙公司', 'NAR1', 'open'],
      ['甲公司', 'ITR', 'open'],
      ['甲公司', 'PTR', 'submitted'],
    ])
  })

  it('moves an obligation between open and submitted', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient({ nameCn: '甲公司', incorporationDate: '2024-03-15' })
    const { obligation } = await workbench.addObligation({ clientId: client.id, kind: 'AB56', periodLabel: currentYear(), dueDate: isoDaysFromToday(10) })

    await workbench.markObligation(obligation.id, 'submitted')
    expect((await workbench.remoteObligations()).obligations[0]!.status).toBe('submitted')
    await workbench.markObligation(obligation.id, 'open')
    expect((await workbench.remoteObligations()).obligations[0]!.status).toBe('open')
  })

  it('rejects marking an unknown obligation', async () => {
    const { workbench } = await harness()
    await expectCode(workbench.markObligation('nope', 'submitted'), 'workbench/obligation-not-found')
  })

  it('removes an obligation', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient({ nameCn: '甲公司', incorporationDate: '2024-03-15' })
    const { obligation } = await workbench.addObligation({ clientId: client.id, kind: 'PTR', periodLabel: '2025', dueDate: isoDaysFromToday(10) })

    await workbench.removeObligation(obligation.id)
    expect(await workbench.remoteObligations()).toEqual({ obligations: [] })
    await expectCode(workbench.removeObligation(obligation.id), 'workbench/obligation-not-found')
  })
})

describe('workbench due tiers', () => {
  it.each([
    [31, 'ok'],
    [30, 'd30'],
    [16, 'd30'],
    [15, 'd15'],
    [8, 'd15'],
    [7, 'd7'],
    [2, 'd7'],
    [1, 'd1'],
    [0, 'd1'],
  ])('sits a due-in-%i-days row in the %s tier', async (days, tier) => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient({ nameCn: '甲公司', incorporationDate: '2024-03-15' })
    const { obligation } = await workbench.addObligation({ clientId: client.id, kind: 'ITR', periodLabel: currentYear(), dueDate: isoDaysFromToday(days) })
    expect(obligation.daysUntilDue).toBe(days)
    expect(obligation.dueTier).toBe(tier)
  })

  it('marks a past-due row overdue with negative days', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient({ nameCn: '甲公司', incorporationDate: '2024-03-15' })
    const { obligation } = await workbench.addObligation({ clientId: client.id, kind: 'ITR', periodLabel: currentYear(), dueDate: isoDaysFromToday(-2) })
    expect(obligation.daysUntilDue).toBe(-2)
    expect(obligation.dueTier).toBe('overdue')
  })
})

describe('workbench compliance schedule', () => {
  it('keeps an empty schedule on a fresh medium', async () => {
    const { workbench } = await harness()
    const schedule = await workbench.remoteComplianceSchedule()
    expect(schedule.year).toBe(currentYear())
    expect(schedule.rows).toEqual([])
  })

  it('projects the NAR1 anniversary filing beside stored obligations due in the year', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient({ nameCn: '甲公司', incorporationDate: `${Number(currentYear()) - 6}-03-01` })
    await workbench.addObligation({ clientId: client.id, kind: 'ITR', periodLabel: '2025', dueDate: `${currentYear()}-06-30` })

    const { rows } = await workbench.remoteComplianceSchedule()
    expect(rows.map(row => [row.kind, row.source, row.dueDate])).toEqual([
      // The anniversary lands on March 1; the statutory window adds 42 days.
      ['NAR1', 'derived', `${currentYear()}-04-12`],
      ['ITR', 'ledger', `${currentYear()}-06-30`],
    ])
    expect(rows[0]!.clientNameCn).toBe('甲公司')
    expect(rows[0]!.periodLabel).toBe(currentYear())
    expect(rows[0]!.status).toBe('open')
  })

  it('prefers a recorded NAR1 obligation over the anniversary projection', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient({ nameCn: '甲公司', incorporationDate: `${Number(currentYear()) - 6}-03-01` })
    await workbench.addObligation({ clientId: client.id, kind: 'NAR1', periodLabel: currentYear(), dueDate: `${currentYear()}-05-20` })

    const { rows } = await workbench.remoteComplianceSchedule()
    expect(rows.map(row => [row.kind, row.source, row.dueDate])).toEqual([['NAR1', 'ledger', `${currentYear()}-05-20`]])
  })

  it('keeps a submitted ledger row while the projection stays suppressed', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient({ nameCn: '甲公司', incorporationDate: `${Number(currentYear()) - 6}-03-01` })
    const { obligation } = await workbench.addObligation({ clientId: client.id, kind: 'NAR1', periodLabel: currentYear(), dueDate: `${currentYear()}-04-12` })
    await workbench.markObligation(obligation.id, 'submitted')

    const { rows } = await workbench.remoteComplianceSchedule()
    expect(rows.map(row => [row.source, row.status])).toEqual([['ledger', 'submitted']])
  })

  it('skips the projection when the anniversary window overflows the year', async () => {
    const { workbench } = await harness()
    // December 20 plus the 42-day window lands on January 31 of the next year.
    await workbench.addClient({ nameCn: '甲公司', incorporationDate: `${Number(currentYear()) - 1}-12-20` })
    const { rows } = await workbench.remoteComplianceSchedule()
    expect(rows).toEqual([])
  })

  it('excludes stored obligations due outside the year', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient({ nameCn: '甲公司', incorporationDate: '2020-12-05' })
    await workbench.addObligation({ clientId: client.id, kind: 'ITR', periodLabel: '2024', dueDate: `${Number(currentYear()) - 1}-06-30` })
    await workbench.addObligation({ clientId: client.id, kind: 'ITR', periodLabel: String(Number(currentYear()) + 1), dueDate: `${Number(currentYear()) + 1}-03-01` })

    const { rows } = await workbench.remoteComplianceSchedule()
    expect(rows).toEqual([])
  })

  it('derives the window from the fixed statutory constant', async () => {
    expect(NAR1_FILING_WINDOW_DAYS).toBe(42)
  })
})

/** Backdate every stored delivery's send time by `days` directly on the medium. */
async function backdateDeliveries(root: string, days: number): Promise<void> {
  const dir = join(root, 'workbench', 'deliveries')
  for (const file of await readdir(dir)) {
    const path = join(dir, file)
    const envelope = JSON.parse(await readFile(path, 'utf8')) as { record: { createdAt: number } }
    envelope.record.createdAt -= days * MILLIS_PER_DAY
    await writeFile(path, JSON.stringify(envelope))
  }
}

describe('workbench delivery ledger', () => {
  const BASE = { nameCn: '甲公司', incorporationDate: '2024-03-15' }

  it('records a delivery sent now with the default channel and today\'s tier', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient(BASE)
    const { delivery } = await workbench.addDelivery({ clientId: client.id, title: '2026 年报 NAR1 套装' })
    expect(delivery.clientId).toBe(client.id)
    expect(delivery.clientNameCn).toBe('甲公司')
    expect(delivery.status).toBe('sent')
    expect(delivery.channel).toBe('email')
    expect(delivery.daysSinceSent).toBe(0)
    expect(delivery.followUpTier).toBe('fresh')
  })

  it('keeps an explicit channel', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient(BASE)
    const { delivery } = await workbench.addDelivery({ clientId: client.id, title: '章程修订', channel: 'whatsapp' })
    expect(delivery.channel).toBe('whatsapp')
  })

  it('rejects recording against an unknown client', async () => {
    const { workbench } = await harness()
    await expectCode(workbench.addDelivery({ clientId: 'C-2020-9999', title: '年报套装' }), 'workbench/client-not-found')
  })

  it.each([
    ['blank title', { title: '   ' }],
    ['unknown channel', { channel: 'fax' as WorkbenchDeliveryChannel }],
  ])('rejects a recording with a %s', async (_label, patch) => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient(BASE)
    await expectCode(workbench.addDelivery({ clientId: client.id, title: '年报套装', ...patch }), 'gateway/bad-request')
    expect(await workbench.remoteDeliveries()).toEqual({ deliveries: [] })
  })

  it('lists open rows first, longest waiting first, closed rows last, joined with client names', async () => {
    const { workbench } = await harness()
    const a = await workbench.addClient(BASE)
    const b = await workbench.addClient({ ...BASE, nameCn: '乙公司' })
    await workbench.addDelivery({ clientId: a.client.id, title: '年报套装' })
    await workbench.addDelivery({ clientId: b.client.id, title: '变更决议' })
    const third = await workbench.addDelivery({ clientId: a.client.id, title: '股权转让文件' })
    await workbench.markDelivery(third.delivery.id, 'signed')

    const { deliveries } = await workbench.remoteDeliveries()
    expect(deliveries.map(row => [row.clientNameCn, row.title, row.status])).toEqual([
      ['甲公司', '年报套装', 'sent'],
      ['乙公司', '变更决议', 'sent'],
      ['甲公司', '股权转让文件', 'signed'],
    ])
  })

  it('moves a delivery along the sent → viewed → signed → returned lifecycle', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient(BASE)
    const { delivery } = await workbench.addDelivery({ clientId: client.id, title: '年报套装' })

    await workbench.markDelivery(delivery.id, 'viewed')
    expect((await workbench.remoteDeliveries()).deliveries[0]!.status).toBe('viewed')
    await workbench.markDelivery(delivery.id, 'signed')
    expect((await workbench.remoteDeliveries()).deliveries[0]!.status).toBe('signed')
    await workbench.markDelivery(delivery.id, 'returned')
    expect((await workbench.remoteDeliveries()).deliveries[0]!.status).toBe('returned')
  })

  it('rejects marking an unknown delivery', async () => {
    const { workbench } = await harness()
    await expectCode(workbench.markDelivery('nope', 'signed'), 'workbench/delivery-not-found')
  })

  it('removes a delivery', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient(BASE)
    const { delivery } = await workbench.addDelivery({ clientId: client.id, title: '年报套装' })

    await workbench.removeDelivery(delivery.id)
    expect(await workbench.remoteDeliveries()).toEqual({ deliveries: [] })
    await expectCode(workbench.removeDelivery(delivery.id), 'workbench/delivery-not-found')
  })

  it.each([
    [DELIVERY_NUDGE_DAYS, 'nudge'],
    [DELIVERY_CHASE_DAYS, 'chase'],
    [DELIVERY_ESCALATE_DAYS, 'escalate'],
  ])('sits a sent-%i-days-ago row in the %s tier after a restart', async (days, tier) => {
    const h = await harness()
    const { client } = await h.workbench.addClient(BASE)
    await h.workbench.addDelivery({ clientId: client.id, title: '签转文件' })
    await h.dispose()
    await backdateDeliveries(h.root, days)

    const reopened = await harness({}, { root: h.root })
    const { deliveries } = await reopened.workbench.remoteDeliveries()
    expect(deliveries[0]!.daysSinceSent).toBe(days)
    expect(deliveries[0]!.followUpTier).toBe(tier)
    await reopened.dispose()
  })

  it('reads a closed backdated row as done', async () => {
    const h = await harness()
    const { client } = await h.workbench.addClient(BASE)
    const { delivery } = await h.workbench.addDelivery({ clientId: client.id, title: '签转文件' })
    await h.workbench.markDelivery(delivery.id, 'signed')
    await h.dispose()
    await backdateDeliveries(h.root, 30)

    const reopened = await harness({}, { root: h.root })
    const { deliveries } = await reopened.workbench.remoteDeliveries()
    expect(deliveries[0]!.followUpTier).toBe('done')
    await reopened.dispose()
  })

  it('derives the ladder from the fixed SOP constants', () => {
    expect(DELIVERY_NUDGE_DAYS).toBe(3)
    expect(DELIVERY_CHASE_DAYS).toBe(7)
    expect(DELIVERY_ESCALATE_DAYS).toBe(14)
  })
})

describe('workbench follow-up center', () => {
  const BASE = { nameCn: '甲公司', incorporationDate: '2024-03-15' }

  it('hides fresh deliveries and far-out obligations from the queue', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient(BASE)
    await workbench.addDelivery({ clientId: client.id, title: '年报套装' })
    await workbench.addObligation({ clientId: client.id, kind: 'NAR1', periodLabel: currentYear(), dueDate: isoDaysFromToday(60) })
    expect(await workbench.remoteFollowUps()).toEqual({ followUps: [] })
  })

  it('queues a nudge-rung delivery with the suggested channel and the drafted message', async () => {
    const h = await harness()
    const { client } = await h.workbench.addClient(BASE)
    const { delivery } = await h.workbench.addDelivery({ clientId: client.id, title: '年报套装' })
    await h.dispose()
    await backdateDeliveries(h.root, DELIVERY_NUDGE_DAYS)

    const reopened = await harness({}, { root: h.root })
    const { followUps } = await reopened.workbench.remoteFollowUps()
    expect(followUps).toHaveLength(1)
    const row = followUps[0]!
    expect(row.id).toBe(`delivery:${delivery.id}`)
    expect(row.targetKind).toBe('delivery')
    expect(row.clientNameCn).toBe('甲公司')
    expect(row.title).toBe('年报套装')
    expect(row.tier).toBe('nudge')
    expect(row.suggestedChannel).toBe('whatsapp')
    expect(row.days).toBe(DELIVERY_NUDGE_DAYS)
    expect(row.dueDate).toBeUndefined()
    expect(row.message).toContain('年报套装')
    expect(row.message).toContain(`于 ${DELIVERY_NUDGE_DAYS} 天前`)
    expect(row.reminderCount).toBe(0)
    expect(row.lastReminderAt).toBeUndefined()
    await reopened.dispose()
  })

  it('queues an overdue obligation with the positive overdue day count in its message', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient(BASE)
    await workbench.addObligation({ clientId: client.id, kind: 'PTR', periodLabel: '2025/26', dueDate: isoDaysFromToday(-5) })

    const { followUps } = await workbench.remoteFollowUps()
    expect(followUps).toHaveLength(1)
    const row = followUps[0]!
    expect(row.targetKind).toBe('obligation')
    expect(row.title).toBe('PTR 2025/26')
    expect(row.tier).toBe('overdue')
    expect(row.suggestedChannel).toBe('email')
    expect(row.days).toBe(-5)
    expect(row.dueDate).toBe(isoDaysFromToday(-5))
    expect(row.message).toContain('逾期 5 天')
    expect(row.message).toContain('PTR 2025/26')
  })

  it('sorts most urgent rung first across the reminder ladder', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient(BASE)
    await workbench.addObligation({ clientId: client.id, kind: 'NAR1', periodLabel: currentYear(), dueDate: isoDaysFromToday(30) })
    await workbench.addObligation({ clientId: client.id, kind: 'ITR', periodLabel: currentYear(), dueDate: isoDaysFromToday(1) })
    await workbench.addObligation({ clientId: client.id, kind: 'AB56', periodLabel: '2025/26', dueDate: isoDaysFromToday(7) })

    const { followUps } = await workbench.remoteFollowUps()
    expect(followUps.map(row => row.tier)).toEqual(['d1', 'd7', 'd30'])
  })

  it('logs a reminder with the derived tier, suggested channel, and drafted message by default', async () => {
    const h = await harness()
    const { client } = await h.workbench.addClient(BASE)
    const { delivery } = await h.workbench.addDelivery({ clientId: client.id, title: '年报套装' })
    await h.dispose()
    await backdateDeliveries(h.root, DELIVERY_CHASE_DAYS)
    const reopened = await harness({}, { root: h.root })

    const { reminder } = await reopened.workbench.recordFollowUp({ targetKind: 'delivery', targetId: delivery.id })
    expect(reminder.targetKind).toBe('delivery')
    expect(reminder.targetId).toBe(delivery.id)
    expect(reminder.tier).toBe('chase')
    expect(reminder.channel).toBe('wechat')
    expect(reminder.message).toContain('已发出')
    expect(reminder.createdAt).toBeGreaterThan(0)

    const { followUps } = await reopened.workbench.remoteFollowUps()
    expect(followUps[0]!.reminderCount).toBe(1)
    expect(followUps[0]!.lastReminderAt).toBe(reminder.createdAt)
    await reopened.dispose()
  })

  it('accepts the secretary channel and message overrides on a logged reminder', async () => {
    const h = await harness()
    const { client } = await h.workbench.addClient(BASE)
    await h.workbench.addObligation({ clientId: client.id, kind: 'NAR1', periodLabel: currentYear(), dueDate: isoDaysFromToday(1) })
    const { obligations } = await h.workbench.remoteObligations()

    const { reminder } = await h.workbench.recordFollowUp({
      targetKind: 'obligation',
      targetId: obligations[0]!.id,
      channel: 'email',
      message: '已电话确认，客户明日提交。',
    })
    expect(reminder.tier).toBe('d1')
    expect(reminder.channel).toBe('email')
    expect(reminder.message).toBe('已电话确认，客户明日提交。')
    await h.dispose()
  })

  it('rejects logging against an unknown target with the target ledger code', async () => {
    const { workbench } = await harness()
    await expectCode(workbench.recordFollowUp({ targetKind: 'delivery', targetId: 'nope' }), 'workbench/delivery-not-found')
    await expectCode(workbench.recordFollowUp({ targetKind: 'obligation', targetId: 'nope' }), 'workbench/obligation-not-found')
  })

  it('rejects logging against a closed target', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient(BASE)
    const { delivery } = await workbench.addDelivery({ clientId: client.id, title: '年报套装' })
    await workbench.markDelivery(delivery.id, 'signed')
    await expectCode(
      workbench.recordFollowUp({ targetKind: 'delivery', targetId: delivery.id }),
      'workbench/follow-up-not-open',
    )

    const { obligation } = await workbench.addObligation({ clientId: client.id, kind: 'AB56', periodLabel: '2025/26', dueDate: isoDaysFromToday(-3) })
    await workbench.markObligation(obligation.id, 'submitted')
    await expectCode(
      workbench.recordFollowUp({ targetKind: 'obligation', targetId: obligation.id }),
      'workbench/follow-up-not-open',
    )
  })

  it('rejects logging against a target that has not entered its ladder', async () => {
    const { workbench } = await harness()
    const { client } = await workbench.addClient(BASE)
    const { delivery } = await workbench.addDelivery({ clientId: client.id, title: '年报套装' })
    await expectCode(workbench.recordFollowUp({ targetKind: 'delivery', targetId: delivery.id }), 'gateway/bad-request')

    const { obligation } = await workbench.addObligation({ clientId: client.id, kind: 'NAR1', periodLabel: currentYear(), dueDate: isoDaysFromToday(60) })
    await expectCode(workbench.recordFollowUp({ targetKind: 'obligation', targetId: obligation.id }), 'gateway/bad-request')
  })

  it('keeps logged reminders across a restart', async () => {
    const h = await harness()
    const { client } = await h.workbench.addClient(BASE)
    await h.workbench.addObligation({ clientId: client.id, kind: 'PTR', periodLabel: '2025/26', dueDate: isoDaysFromToday(-2) })
    const { obligations } = await h.workbench.remoteObligations()
    await h.workbench.recordFollowUp({ targetKind: 'obligation', targetId: obligations[0]!.id })
    await h.dispose()

    const reopened = await harness({}, { root: h.root })
    const { followUps } = await reopened.workbench.remoteFollowUps()
    expect(followUps[0]!.reminderCount).toBe(1)
    expect(followUps[0]!.lastReminderAt).toBeGreaterThan(0)
    await reopened.dispose()
  })
})
