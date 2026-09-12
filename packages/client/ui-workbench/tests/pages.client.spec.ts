/**
 * Workbench page data: the hall's Session-list fold, the month tally, the
 * page-open state, and the credits ledger read and grant round trip.
 */
import { describe, expect, it } from 'vitest'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { WorkbenchController, monthReport, taskRows, type TaskRow } from '../src/client/workbench-store.ts'

/** One Session-list entry, with the summary fields `taskRows` reads. */
interface Entry {
  id: string
  displayTitle: string
  updatedAt: number
  blank?: boolean
  origin?: 'subagent'
  running?: boolean
  completed?: boolean
  projectionValues?: { agentPreset?: string | null }
}

/** Build a Session-list snapshot from the given entries, in list order. */
function list(entries: readonly Entry[]): SessionListState {
  const byId: Record<string, unknown> = {}
  for (const entry of entries) byId[entry.id] = entry
  return { ids: entries.map(entry => entry.id), byId } as unknown as SessionListState
}

describe('taskRows', () => {
  it('lists started sessions newest first, skipping blank and subagent ones', () => {
    const rows = taskRows(list([
      { id: 's1', displayTitle: '旧任务', updatedAt: 100, blank: false },
      { id: 's2', displayTitle: '草稿', updatedAt: 500, blank: true },
      { id: 's3', displayTitle: '子任务', updatedAt: 900, origin: 'subagent' },
      { id: 's4', displayTitle: '新任务', updatedAt: 700, running: true },
    ]))
    expect(rows.map(row => row.id)).toEqual(['s4', 's1'])
  })

  it('maps the lifecycle and keeps a recorded preset, absent otherwise', () => {
    const rows = taskRows(list([
      { id: 'running', displayTitle: 'A', updatedAt: 3, running: true, projectionValues: { agentPreset: 'minimal' } },
      { id: 'done', displayTitle: 'B', updatedAt: 2, completed: true },
      { id: 'idle', displayTitle: 'C', updatedAt: 1 },
    ]))
    const byId = Object.fromEntries(rows.map(row => [row.id, row]))
    expect(byId.running).toMatchObject({ status: 'running', presetId: 'minimal' })
    expect(byId.done).toMatchObject({ status: 'done', presetId: undefined })
    expect(byId.idle).toMatchObject({ status: 'idle', presetId: undefined })
  })
})

describe('monthReport', () => {
  const NOW = new Date(2026, 8, 15, 12, 0, 0).getTime()
  const JULY = new Date(2026, 6, 20, 12, 0, 0).getTime()

  function task(updatedAt: number, status: TaskRow['status']): TaskRow {
    return { id: `t${updatedAt}` as TaskRow['id'], title: 'x', presetId: undefined, status, updatedAt }
  }

  it('tallies only this local month and only credits granted inside it', () => {
    const report = monthReport(
      [task(NOW, 'running'), task(NOW, 'done'), task(JULY, 'done')],
      [{ id: 'a', amount: 30, reason: 'seed', at: NOW }, { id: 'b', amount: 90, reason: 'old', at: JULY }],
      NOW,
    )
    expect(report).toEqual({ total: 2, running: 1, done: 1, granted: 30 })
  })
})

/** One ledger read outcome, mirroring the Remote envelope. */
type LedgerRead = { ok: true; value: { entries: unknown[] } } | { ok: false; error: { message: string } }
/** One grant outcome, mirroring the Remote envelope. */
type GrantRead = { ok: true; value: { balance: number } } | { ok: false; error: { message: string } }

/** Minimal controller context: the workbench Remote plus session `open`. */
function makeCtx(ledger: LedgerRead, grant: GrantRead) {
  const calls: string[] = []
  return {
    calls,
    ctx: {
      remote: {
        workbench: {
          ledger: () => { calls.push('ledger'); return Promise.resolve(ledger) },
          addCredits: (amount: number, reason: string) => {
            calls.push(`add:${amount}:${reason}`)
            return Promise.resolve(grant)
          },
        },
      },
      sessions: { open: (id: string) => { calls.push(`open:${id}`) } },
    },
  }
}

describe('WorkbenchController pages and credits', () => {
  it('opens, toggles, and closes one page at a time, and leaves the page when a session opens', () => {
    const { ctx, calls } = makeCtx({ ok: true, value: { entries: [] } }, { ok: true, value: { balance: 0 } })
    const controller = new WorkbenchController(ctx as never)

    controller.openPage('hall')
    expect(controller.pages.getSnapshot().open).toBe('hall')

    controller.togglePage('report')
    expect(controller.pages.getSnapshot().open).toBe('report')
    controller.togglePage('report')
    expect(controller.pages.getSnapshot().open).toBeNull()

    controller.openPage('team')
    controller.openSession('s1' as never)
    expect(controller.pages.getSnapshot().open).toBeNull()
    expect(calls).toContain('open:s1')

    controller.closePage()
    expect(controller.pages.getSnapshot().open).toBeNull()
  })

  it('reads the ledger into the report snapshot and surfaces a failure', async () => {
    const entries = [{ id: 'g1', amount: 5, reason: 'seed', at: 1 }]
    const ok = makeCtx({ ok: true, value: { entries } }, { ok: true, value: { balance: 5 } })
    const controller = new WorkbenchController(ok.ctx as never)
    await controller.loadLedger()
    expect(controller.ledger.getSnapshot()).toMatchObject({ status: 'ready', error: null, entries })

    const bad = makeCtx({ ok: false, error: { message: 'boom' } }, { ok: true, value: { balance: 5 } })
    const failed = new WorkbenchController(bad.ctx as never)
    await failed.loadLedger()
    expect(failed.ledger.getSnapshot()).toMatchObject({ status: 'error', error: 'boom', entries: [] })
  })

  it('grants credits, then refreshes the balance and the ledger', async () => {
    const bench = makeCtx(
      { ok: true, value: { entries: [{ id: 'g1', amount: 20, reason: 'bonus', at: 2 }] } },
      { ok: true, value: { balance: 20 } },
    )
    const controller = new WorkbenchController(bench.ctx as never)

    const failure = await controller.grantCredits(20, 'bonus')
    expect(failure).toBeNull()
    expect(controller.store.getSnapshot().credits).toBe(20)
    expect(bench.calls).toEqual(['add:20:bonus', 'ledger'])
    expect(controller.ledger.getSnapshot().entries).toHaveLength(1)
  })

  it('returns the host message and leaves the ledger alone when a grant is refused', async () => {
    const bench = makeCtx(
      { ok: true, value: { entries: [] } },
      { ok: false, error: { message: 'amount must be positive' } },
    )
    const controller = new WorkbenchController(bench.ctx as never)

    await expect(controller.grantCredits(-1, 'nope')).resolves.toBe('amount must be positive')
    expect(controller.ledger.getSnapshot().status).toBe('idle')
  })
})
