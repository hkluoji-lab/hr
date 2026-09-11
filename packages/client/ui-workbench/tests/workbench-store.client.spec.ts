/**
 * WorkbenchController behavior: roster-to-team derivation (online/busy/
 * offline, broken presets last, optional-service absence as empty), the
 * member-state dot fold, and the start flows (stage the preset and/or brief,
 * start the session, apply the pick and submit the brief to the blank session
 * the start lands on — once).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets/types'
import { WorkbenchController, memberDotState, taskCounts } from '../src/client/workbench-store.ts'

afterEach(() => { vi.restoreAllMocks() })

/** Mutable session-list state the controller reads and subscribes to. */
interface ListState {
  current: string | undefined
  /** List order; defaults to every key in byId when a bench omits it. */
  ids?: string[]
  byId: Record<string, {
    id: string
    blank: boolean
    projectionValues?: { agentPreset?: string | null }
  }>
}

/** Recorded test surface: remote calls plus the two navigation services. */
interface Bench {
  ctx: ReturnType<typeof makeCtx>['ctx']
  calls: string[]
  state: ListState
  notify: () => void
}

function roster(presets: AgentPresetRoster['presets']): AgentPresetRoster {
  return { presets, authorable: true }
}

/** Per-bench overrides for the Session Controller double. */
interface CtxOptions {
  /** Replace the per-session binding; `undefined` models a session that vanished. */
  binding?: (id: string) => unknown
}

function makeCtx(
  listResult:
    | { ok: true; value: AgentPresetRoster }
    | { ok: false; error: { code: string; message: string } },
  state: ListState,
  credits: number | 'unavailable' = 'unavailable',
  options: CtxOptions = {},
) {
  const calls: string[] = []
  const listeners = new Set<() => void>()
  const snapshotResult = credits === 'unavailable'
    ? { ok: false as const, error: { code: 'gateway/invocation-unavailable', message: 'no such service' } }
    : { ok: true as const, value: { credits: { balance: credits } } }
  const ctx = {
    remote: {
      agentPresets: {
        list: () => { calls.push('list'); return Promise.resolve(listResult) },
        select: (sessionId: string, presetId: string) => {
          calls.push(`select:${sessionId}:${presetId}`)
          return Promise.resolve({ ok: true as const, value: presetId })
        },
      },
      workbench: {
        snapshot: () => { calls.push('workbench.snapshot'); return Promise.resolve(snapshotResult) },
      },
    },
    sessions: {
      list: {
        getSnapshot: () => ({ ids: state.ids ?? Object.keys(state.byId), ...state }),
        subscribe: (fn: () => void) => {
          listeners.add(fn)
          return () => listeners.delete(fn)
        },
      },
      binding: options.binding ?? ((id: string) => ({
        session: {
          prompt: (content: readonly { type: string; text: string }[], mode: string) => {
            calls.push(`prompt:${id}:${mode}:${content[0]?.text ?? ''}`)
            return Promise.resolve({ ok: true as const, value: undefined })
          },
        },
      })),
    },
    uiWorkspace: {
      startSession: () => { calls.push('startSession') },
    },
    layout: {
      toggleSidebar: () => { calls.push('toggleSidebar') },
    },
  }
  return { ctx, calls, notify: () => { for (const fn of listeners) fn() } }
}

describe('WorkbenchController roster derivation', () => {
  it('marks healthy idle presets online and counts them', async () => {
    const bench = makeCtx({
      ok: true,
      value: roster([
        { id: 'standard', trust: 'system', isDefault: true },
        { id: 'minimal', trust: 'system', isDefault: false },
      ]),
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never)
    await controller.load()
    const snapshot = controller.store.getSnapshot()

    expect(snapshot.status).toBe('ready')
    expect(snapshot.members.map(member => member.id)).toEqual(['standard', 'minimal'])
    expect(snapshot.members.map(member => member.state)).toEqual(['online', 'online'])
    expect(snapshot).toMatchObject({ online: 2, busy: 0, offline: 0 })
  })

  it('uses the preset name and description when published, else the id', async () => {
    const bench = makeCtx({
      ok: true,
      value: roster([
        { id: 'standard', trust: 'system', isDefault: true, name: '标准模式', description: '完整工具集' },
        { id: 'bare', trust: 'user', isDefault: false },
      ]),
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never)
    await controller.load()

    const members = controller.store.getSnapshot().members
    expect(members[0]).toMatchObject({ id: 'standard', name: '标准模式', description: '完整工具集' })
    expect(members[1]).toMatchObject({ id: 'bare', name: 'bare', description: '' })
  })

  it('tags company presets with their role and leaves other presets role-less', async () => {
    const bench = makeCtx({
      ok: true,
      value: roster([
        { id: 'sec', trust: 'system', isDefault: false, name: 'AI 秘书' },
        { id: 'standard', trust: 'system', isDefault: true, name: '标准模式' },
      ]),
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never)
    await controller.load()
    const byId = Object.fromEntries(
      controller.store.getSnapshot().members.map(member => [member.id, member.role?.id]))

    expect(byId).toEqual({ sec: 'secretary', standard: undefined })
  })

  it('marks a preset busy when a live non-blank session runs it', async () => {
    const state: ListState = {
      current: 's1',
      byId: {
        s1: { id: 's1', blank: false, projectionValues: { agentPreset: 'minimal' } },
        // Blank sessions and sessions recording no preset never count as busy.
        s2: { id: 's2', blank: true, projectionValues: { agentPreset: 'standard' } },
      },
    }
    const bench = makeCtx({
      ok: true,
      value: roster([
        { id: 'standard', trust: 'system', isDefault: true },
        { id: 'minimal', trust: 'system', isDefault: false },
      ]),
    }, state)

    const controller = new WorkbenchController(bench.ctx as never)
    await controller.load()

    const byId = Object.fromEntries(
      controller.store.getSnapshot().members.map(member => [member.id, member.state]))
    expect(byId).toEqual({ standard: 'online', minimal: 'busy' })
    expect(controller.store.getSnapshot()).toMatchObject({ online: 1, busy: 1, offline: 0 })
  })

  it('renders broken presets offline and sinks them after healthy members', async () => {
    const bench = makeCtx({
      ok: true,
      value: roster([
        { id: 'broken', trust: 'system', isDefault: false, broken: 'mount failed' },
        { id: 'standard', trust: 'system', isDefault: true },
      ]),
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never)
    await controller.load()
    const snapshot = controller.store.getSnapshot()

    expect(snapshot.members.map(member => member.id)).toEqual(['standard', 'broken'])
    expect(snapshot.members[1]!.state).toBe('offline')
    expect(snapshot).toMatchObject({ online: 1, busy: 0, offline: 1 })
  })

  it('reports an empty roster as unavailable, not an error', async () => {
    const bench = makeCtx({ ok: true, value: roster([]) }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never)
    await controller.load()

    expect(controller.store.getSnapshot()).toMatchObject({ status: 'unavailable', members: [] })
  })

  it('treats a missing agent-presets service as an empty team', async () => {
    const bench = makeCtx({
      ok: false,
      error: { code: 'gateway/invocation-unavailable', message: 'no such service' },
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never)
    await controller.load()

    expect(controller.store.getSnapshot().status).toBe('unavailable')
  })

  it('surfaces other roster failures as an error and keeps the message', async () => {
    const bench = makeCtx({
      ok: false,
      error: { code: 'gateway/internal', message: 'boom' },
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never)
    await controller.load()

    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', error: 'boom' })
  })

  it('surfaces the persisted credits balance alongside the team', async () => {
    const bench = makeCtx({
      ok: true,
      value: roster([{ id: 'standard', trust: 'system', isDefault: true }]),
    }, { current: undefined, byId: {} }, 1280)

    const controller = new WorkbenchController(bench.ctx as never)
    await controller.load()

    expect(controller.store.getSnapshot().credits).toBe(1280)
  })

  it('hides credits when the host composes no workbench service', async () => {
    const bench = makeCtx({
      ok: true,
      value: roster([{ id: 'standard', trust: 'system', isDefault: true }]),
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never)
    await controller.load()

    expect(controller.store.getSnapshot().credits).toBeNull()
  })

  it('ignores a roster read that starts while one is already in flight', async () => {
    const bench = makeCtx({
      ok: true,
      value: roster([{ id: 'standard', trust: 'system', isDefault: true }]),
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never)
    const first = controller.load()
    const second = controller.load()
    await Promise.all([first, second])

    // Both callers await the same read; the duplicate start would otherwise
    // race two roster answers onto one snapshot.
    expect(bench.calls.filter(call => call === 'list')).toHaveLength(1)
  })

  it('sinks every offline member together, keeping healthy order stable', async () => {
    const bench = makeCtx({
      ok: true,
      value: roster([
        { id: 'broken-a', trust: 'system', isDefault: false, broken: 'mount failed' },
        { id: 'standard', trust: 'system', isDefault: true },
        { id: 'broken-b', trust: 'system', isDefault: false, broken: 'mount failed' },
        { id: 'minimal', trust: 'system', isDefault: false },
      ]),
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never)
    await controller.load()

    expect(controller.store.getSnapshot().members.map(member => member.id))
      .toEqual(['standard', 'minimal', 'broken-a', 'broken-b'])
  })
})

describe('memberDotState', () => {
  it('folds the three member states onto the shared presence dot', () => {
    expect(memberDotState('online')).toBe('done')
    expect(memberDotState('busy')).toBe('ongoing')
    expect(memberDotState('offline')).toBe('idle')
  })
})

describe('taskCounts', () => {
  /** Build one session row the fold reads; non-blank user sessions by default. */
  function taskSession(over: Partial<{
    blank: boolean
    origin: string
    running: boolean
    completed: boolean
  }> & { id: string; updatedAt: number }) {
    return {
      displayTitle: over.id, projectionValues: {}, blank: false, origin: 'user',
      running: false, completed: false, ...over,
    }
  }

  it('counts since local midnight and folds lifecycle states, skipping blank and subagent rows', () => {
    const today = new Date(2026, 8, 10, 9, 0, 0).getTime()
    const yesterday = new Date(2026, 8, 9, 10, 0, 0).getTime()
    const now = new Date(2026, 8, 10, 15, 0, 0).getTime()
    const snapshot = {
      ids: ['running', 'doneToday', 'doneYesterday', 'blank', 'subagent'],
      byId: {
        running: taskSession({ id: 'running', updatedAt: today, running: true }),
        doneToday: taskSession({ id: 'doneToday', updatedAt: today, completed: true }),
        doneYesterday: taskSession({ id: 'doneYesterday', updatedAt: yesterday, completed: true }),
        blank: taskSession({ id: 'blank', updatedAt: today, blank: true, completed: true }),
        subagent: taskSession({ id: 'subagent', updatedAt: today, origin: 'subagent', completed: true }),
      },
    }
    expect(taskCounts(snapshot as never, now)).toEqual({ today: 2, running: 1, done: 2 })
  })
})

describe('WorkbenchController actions', () => {
  function readyBench(state: ListState): Bench {
    const built = makeCtx({
      ok: true,
      value: roster([
        { id: 'standard', trust: 'system', isDefault: true, name: '标准模式' },
        { id: 'minimal', trust: 'system', isDefault: false, name: '极简模式' },
      ]),
    }, state)
    return { ...built, state }
  }

  it('startTask starts one session and leaves no staged preset', async () => {
    const bench = readyBench({ current: undefined, byId: {} })
    const controller = new WorkbenchController(bench.ctx as never)

    controller.startTask()
    expect(bench.calls).toEqual(['startSession'])

    // A blank session appearing afterwards must not receive any select:
    // the task opens on the deployment default composition.
    bench.state.current = 's1'
    bench.state.byId.s1 = { id: 's1', blank: true }
    bench.notify()
    await Promise.resolve()
    expect(bench.calls).not.toContainEqual(expect.stringContaining('select'))
  })

  it('applies the staged preset to the blank session a member start lands on', async () => {
    const bench = readyBench({ current: undefined, byId: {} })
    const controller = new WorkbenchController(bench.ctx as never)

    controller.startWithPreset('minimal')
    expect(bench.calls).toEqual(['startSession'])

    // The workspace connect creates the blank session; the list change is
    // what hands the staged pick to it.
    bench.state.current = 's1'
    bench.state.byId.s1 = { id: 's1', blank: true, projectionValues: { agentPreset: 'standard' } }
    bench.notify()
    await vi.waitFor(() => {
      expect(bench.calls).toContain('select:s1:minimal')
    })

    // Spent: later list movements must not re-apply the pick.
    const selects = bench.calls.filter(call => call.startsWith('select:'))
    bench.notify()
    bench.notify()
    await Promise.resolve()
    expect(bench.calls.filter(call => call.startsWith('select:'))).toEqual(selects)
  })

  it('never composes a session that already started, and re-reads the roster', async () => {
    const bench = readyBench({ current: undefined, byId: {} })
    const controller = new WorkbenchController(bench.ctx as never)

    controller.startWithPreset('minimal')
    bench.state.current = 's1'
    bench.state.byId.s1 = { id: 's1', blank: false }
    bench.notify()
    await Promise.resolve()

    expect(bench.calls.some(call => call.startsWith('select:'))).toBe(false)
  })

  it('skips the select when the new session already carries the preset', async () => {
    const bench = readyBench({ current: undefined, byId: {} })
    const controller = new WorkbenchController(bench.ctx as never)

    controller.startWithPreset('minimal')
    bench.state.current = 's1'
    bench.state.byId.s1 = { id: 's1', blank: true, projectionValues: { agentPreset: 'minimal' } }
    bench.notify()
    await Promise.resolve()

    expect(bench.calls.some(call => call.startsWith('select:'))).toBe(false)
  })

  it('stages the brief as the new session\'s first message for the named member', async () => {
    const bench = readyBench({ current: undefined, byId: {} })
    const controller = new WorkbenchController(bench.ctx as never)

    controller.assignTask('minimal', '写一份周报')
    expect(bench.calls).toEqual(['startSession'])

    bench.state.current = 's1'
    bench.state.byId.s1 = { id: 's1', blank: true, projectionValues: { agentPreset: 'standard' } }
    bench.notify()
    await vi.waitFor(() => {
      expect(bench.calls).toContain('prompt:s1:queue:写一份周报')
    })
    expect(bench.calls).toContain('select:s1:minimal')
  })

  it('keeps the deployment composition when no member is named', async () => {
    const bench = readyBench({ current: undefined, byId: {} })
    const controller = new WorkbenchController(bench.ctx as never)

    controller.assignTask(undefined, '写一份周报')
    bench.state.current = 's1'
    bench.state.byId.s1 = { id: 's1', blank: true, projectionValues: { agentPreset: 'standard' } }
    bench.notify()
    await vi.waitFor(() => {
      expect(bench.calls).toContain('prompt:s1:queue:写一份周报')
    })
    expect(bench.calls.some(call => call.startsWith('select:'))).toBe(false)
  })

  it('retires a watcher whose staged start was already spent', async () => {
    const bench = readyBench({ current: undefined, byId: {} })
    const controller = new WorkbenchController(bench.ctx as never)

    // Two starts queued before the workspace produced a session. The first
    // watcher consumes the stage; the second must retire without re-applying.
    controller.startWithPreset('minimal')
    controller.startWithPreset('minimal')
    bench.state.current = 's1'
    bench.state.byId.s1 = { id: 's1', blank: true }
    bench.notify()
    await vi.waitFor(() => { expect(bench.calls).toContain('select:s1:minimal') })

    await Promise.resolve()
    expect(bench.calls.filter(call => call.startsWith('select:'))).toEqual(['select:s1:minimal'])
  })

  it('keeps watching while no session is current', async () => {
    const bench = readyBench({ current: undefined, byId: {} })
    const controller = new WorkbenchController(bench.ctx as never)

    controller.startWithPreset('minimal')
    // The list moved while nothing was current: the stage stays pending.
    bench.notify()
    await Promise.resolve()
    expect(bench.calls.some(call => call.startsWith('select:'))).toBe(false)

    bench.state.current = 's1'
    bench.state.byId.s1 = { id: 's1', blank: true }
    bench.notify()
    await vi.waitFor(() => { expect(bench.calls).toContain('select:s1:minimal') })
  })

  it('drops the brief when the session binding is gone by the time it submits', async () => {
    const state: ListState = { current: undefined, byId: {} }
    const bench = makeCtx(
      { ok: true, value: roster([{ id: 'standard', trust: 'system', isDefault: true }]) },
      state,
      'unavailable',
      { binding: () => undefined },
    )
    const controller = new WorkbenchController(bench.ctx as never)

    controller.assignTask(undefined, '写一份周报')
    state.current = 's1'
    state.byId.s1 = { id: 's1', blank: true }
    bench.notify()
    await Promise.resolve()

    // The session closed between the start and the submit: nothing to prompt.
    expect(bench.calls.some(call => call.startsWith('prompt:'))).toBe(false)
  })

  it('reports a refused first message without failing the start', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const state: ListState = { current: undefined, byId: {} }
    const bench = makeCtx(
      { ok: true, value: roster([{ id: 'standard', trust: 'system', isDefault: true }]) },
      state,
      'unavailable',
      {
        binding: (id: string) => ({
          session: {
            prompt: () => Promise.resolve({ ok: false as const, error: { message: `${id} is closed` } }),
          },
        }),
      },
    )
    const controller = new WorkbenchController(bench.ctx as never)

    controller.assignTask(undefined, '写一份周报')
    state.current = 's1'
    state.byId.s1 = { id: 's1', blank: true }
    bench.notify()

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith('workbench assignment failed:', 's1 is closed')
    })
  })

  it('viewProjects reveals the sidebar', () => {
    const bench = readyBench({ current: undefined, byId: {} })
    new WorkbenchController(bench.ctx as never).viewProjects()
    expect(bench.calls).toEqual(['toggleSidebar'])
  })
})
