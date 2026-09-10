/**
 * Workbench service behavior over the real storage stack (storage hub + json
 * backend + domain form) with doubles for the roster and session services:
 * credits balance and grants, grant validation, team aggregation
 * (online/busy/offline, broken-last), and durability across a service
 * restart on the same medium.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
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
import Workbench, { LEDGER_READ_LIMIT, type Config } from '../src/index.ts'
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
