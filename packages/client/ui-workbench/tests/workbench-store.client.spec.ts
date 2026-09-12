/**
 * WorkbenchController behavior: roster-to-team derivation (online/busy/
 * offline, broken presets last, optional-service absence as empty), the
 * member-state dot fold, the start flows (stage the preset and/or brief,
 * start the session, apply the pick and submit the brief to the blank session
 * the start lands on — once), the caller's role binding read, workspace
 * scoping, and the owner's members-management round trips.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets/types'
import {
  WorkbenchController, memberDotState, taskCounts, scopedMembers, scopedRoles,
  type TeamMember,
} from '../src/client/workbench-store.ts'
import { ROLES } from '../src/client/roles.ts'

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
  fetcher: ReturnType<typeof makeCtx>['fetcher']
  state: ListState
  notify: () => void
}

function roster(presets: AgentPresetRoster['presets']): AgentPresetRoster {
  return { presets, authorable: true }
}

/** Same-origin fetch double signature matching the controller's carrier. */
type FetchDouble = (input: URL | string, init?: RequestInit) => Promise<Response>

/** Per-bench overrides for the Session Controller double. */
interface CtxOptions {
  /** Replace the per-session binding; `undefined` models a session that vanished. */
  binding?: (id: string) => unknown
  /** Replace the same-origin fetch double; default answers every route 401. */
  fetcher?: FetchDouble
}

/** Build the same-origin fetch double: record `METHOD url` and reply once. */
function fetchReply(
  calls: string[],
  reply: (url: string, init: RequestInit | undefined) => { status: number; body: unknown },
): FetchDouble {
  return (input, init) => {
    const url = typeof input === 'string' ? input : `${input.pathname}${input.search}`
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    const { status, body } = reply(url, init)
    return Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }))
  }
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
  const fetcher = options.fetcher ?? fetchReply(calls, () => ({ status: 401, body: {} }))
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
  return { ctx, calls, fetcher, notify: () => { for (const fn of listeners) fn() } }
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

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
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

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
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

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
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

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
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

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
    await controller.load()
    const snapshot = controller.store.getSnapshot()

    expect(snapshot.members.map(member => member.id)).toEqual(['standard', 'broken'])
    expect(snapshot.members[1]!.state).toBe('offline')
    expect(snapshot).toMatchObject({ online: 1, busy: 0, offline: 1 })
  })

  it('reports an empty roster as unavailable, not an error', async () => {
    const bench = makeCtx({ ok: true, value: roster([]) }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
    await controller.load()

    expect(controller.store.getSnapshot()).toMatchObject({ status: 'unavailable', members: [] })
  })

  it('treats a missing agent-presets service as an empty team', async () => {
    const bench = makeCtx({
      ok: false,
      error: { code: 'gateway/invocation-unavailable', message: 'no such service' },
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
    await controller.load()

    expect(controller.store.getSnapshot().status).toBe('unavailable')
  })

  it('surfaces other roster failures as an error and keeps the message', async () => {
    const bench = makeCtx({
      ok: false,
      error: { code: 'gateway/internal', message: 'boom' },
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
    await controller.load()

    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', error: 'boom' })
  })

  it('surfaces the persisted credits balance alongside the team', async () => {
    const bench = makeCtx({
      ok: true,
      value: roster([{ id: 'standard', trust: 'system', isDefault: true }]),
    }, { current: undefined, byId: {} }, 1280)

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
    await controller.load()

    expect(controller.store.getSnapshot().credits).toBe(1280)
  })

  it('hides credits when the host composes no workbench service', async () => {
    const bench = makeCtx({
      ok: true,
      value: roster([{ id: 'standard', trust: 'system', isDefault: true }]),
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
    await controller.load()

    expect(controller.store.getSnapshot().credits).toBeNull()
  })

  it('ignores a roster read that starts while one is already in flight', async () => {
    const bench = makeCtx({
      ok: true,
      value: roster([{ id: 'standard', trust: 'system', isDefault: true }]),
    }, { current: undefined, byId: {} })

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
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

    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
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
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

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
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

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
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

    controller.startWithPreset('minimal')
    bench.state.current = 's1'
    bench.state.byId.s1 = { id: 's1', blank: false }
    bench.notify()
    await Promise.resolve()

    expect(bench.calls.some(call => call.startsWith('select:'))).toBe(false)
  })

  it('skips the select when the new session already carries the preset', async () => {
    const bench = readyBench({ current: undefined, byId: {} })
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

    controller.startWithPreset('minimal')
    bench.state.current = 's1'
    bench.state.byId.s1 = { id: 's1', blank: true, projectionValues: { agentPreset: 'minimal' } }
    bench.notify()
    await Promise.resolve()

    expect(bench.calls.some(call => call.startsWith('select:'))).toBe(false)
  })

  it('stages the brief as the new session\'s first message for the named member', async () => {
    const bench = readyBench({ current: undefined, byId: {} })
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

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
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

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
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

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
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

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
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

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
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

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
    new WorkbenchController(bench.ctx as never, bench.fetcher).viewProjects()
    expect(bench.calls).toEqual(['toggleSidebar'])
  })
})

describe('caller binding and workspace scoping', () => {
  /** Roster mixing the three company roles with role-less presets. */
  function teamRoster(): AgentPresetRoster {
    return roster([
      { id: 'standard', trust: 'system', isDefault: true, name: '标准模式' },
      { id: 'sec', trust: 'system', isDefault: false, name: 'AI 秘书' },
      { id: 'acc', trust: 'system', isDefault: false, name: 'AI 会计' },
      { id: 'legal', trust: 'system', isDefault: false, name: 'AI 法务' },
    ])
  }

  function authFetch(payload: unknown): FetchDouble {
    return _input => Promise.resolve(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
  }

  it('reads the caller roles and ownership from the auth status, filtering unknown ids', async () => {
    const bench = makeCtx({ ok: true, value: teamRoster() }, { current: undefined, byId: {} }, 'unavailable', {
      fetcher: authFetch({
        authenticated: true, displayName: '张*三', subject: '13800138000',
        roles: ['accountant', 'boss', 'audit'], isOwner: false,
      }),
    })
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
    await controller.load()

    expect(controller.store.getSnapshot().my).toEqual({
      name: '张*三', roles: ['accountant', 'audit'], isOwner: false,
    })
  })

  it('scopes the roster to a bound member\'s roles plus the role-less presets', async () => {
    const bench = makeCtx({ ok: true, value: teamRoster() }, { current: undefined, byId: {} }, 'unavailable', {
      fetcher: authFetch({ authenticated: true, roles: ['accountant'] }),
    })
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
    await controller.load()
    const snapshot = controller.store.getSnapshot()

    // '标准模式' stays common workspace; the other roles drop out.
    expect(snapshot.members.map(member => member.id)).toEqual(['standard', 'acc'])
    expect(snapshot).toMatchObject({ online: 1, busy: 0, offline: 0 })
  })

  it('shows the whole team to the owner and to unbound visitors', async () => {
    const owner = makeCtx({ ok: true, value: teamRoster() }, { current: undefined, byId: {} }, 'unavailable', {
      fetcher: authFetch({ authenticated: true, roles: [], isOwner: true }),
    })
    const ownerController = new WorkbenchController(owner.ctx as never, owner.fetcher)
    await ownerController.load()
    expect(ownerController.store.getSnapshot().members).toHaveLength(4)

    // The default fetch double answers 401: the visitor sees the whole team.
    const visitor = makeCtx({ ok: true, value: teamRoster() }, { current: undefined, byId: {} })
    const visitorController = new WorkbenchController(visitor.ctx as never, visitor.fetcher)
    await visitorController.load()
    expect(visitorController.store.getSnapshot().my).toEqual({ name: null, roles: [], isOwner: false })
    expect(visitorController.store.getSnapshot().members).toHaveLength(4)
  })

  it('falls back to the visitor default when the auth read fails', async () => {
    const bench = makeCtx({ ok: true, value: teamRoster() }, { current: undefined, byId: {} }, 'unavailable', {
      fetcher: () => Promise.reject(new Error('offline')),
    })
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
    await controller.load()

    expect(controller.store.getSnapshot().my).toEqual({ name: null, roles: [], isOwner: false })
    expect(controller.store.getSnapshot().status).toBe('ready')
  })

  it('scopedMembers and scopedRoles share the owner/visitor/bound rule', () => {
    const accountant: TeamMember = {
      id: 'a', name: 'AI 会计', description: '', state: 'online', role: ROLES[1],
    }
    const secretary: TeamMember = {
      id: 'b', name: 'AI 秘书', description: '', state: 'online', role: ROLES[0],
    }
    const common: TeamMember = {
      id: 'c', name: '标准模式', description: '', state: 'online', role: undefined,
    }
    const members = [accountant, secretary, common]
    const bound = { name: null, roles: ['accountant'] as const, isOwner: false }

    expect(scopedMembers(members, { ...bound, isOwner: true }).map(member => member.id)).toEqual(['a', 'b', 'c'])
    expect(scopedMembers(members, { name: null, roles: [], isOwner: false }).map(member => member.id))
      .toEqual(['a', 'b', 'c'])
    expect(scopedMembers(members, bound).map(member => member.id)).toEqual(['a', 'c'])

    expect(scopedRoles({ name: null, roles: [], isOwner: true })).toHaveLength(4)
    expect(scopedRoles({ name: null, roles: [], isOwner: false })).toHaveLength(4)
    expect(scopedRoles(bound).map(role => role.id)).toEqual(['accountant'])
  })
})

describe('members management round trips', () => {
  const ENTRY = {
    phone: '13800138000', displayName: '138****8000', roles: ['accountant'],
    grantedBy: '139****9000', grantedAt: 1,
  }

  it('reads the roster into the members snapshot and surfaces the host message on failure', async () => {
    const calls: string[] = []
    const ok = makeCtx({ ok: true, value: roster([]) }, { current: undefined, byId: {} }, 'unavailable', {
      fetcher: fetchReply(calls, () => ({ status: 200, body: { ok: true, owner: '139****9000', members: [ENTRY] } })),
    })
    const controller = new WorkbenchController(ok.ctx as never, ok.fetcher)
    await controller.loadMembers()
    expect(controller.members.getSnapshot()).toMatchObject({ status: 'ready', error: null, members: [ENTRY] })
    expect(calls).toEqual(['GET /team/members'])

    const failed = makeCtx({ ok: true, value: roster([]) }, { current: undefined, byId: {} }, 'unavailable', {
      fetcher: fetchReply([], () => ({ status: 403, body: { code: 'forbidden', message: 'owner only' } })),
    })
    const failedController = new WorkbenchController(failed.ctx as never, failed.fetcher)
    await failedController.loadMembers()
    expect(failedController.members.getSnapshot()).toMatchObject({ status: 'error', error: 'owner only' })
  })

  it('falls back to the status line when a failed roster body is not the contract JSON', async () => {
    const bench = makeCtx({ ok: true, value: roster([]) }, { current: undefined, byId: {} }, 'unavailable', {
      fetcher: () => Promise.resolve(new Response('gateway timeout', { status: 504 })),
    })
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)
    await controller.loadMembers()

    expect(controller.members.getSnapshot()).toMatchObject({ status: 'error', error: 'HTTP 504' })
  })

  it('creates an invite and reports the host refusal', async () => {
    const calls: string[] = []
    const bench = makeCtx({ ok: true, value: roster([]) }, { current: undefined, byId: {} }, 'unavailable', {
      fetcher: fetchReply(calls, () => ({ status: 200, body: { ok: true, code: 'AB_cd12', expiresAt: 99 } })),
    })
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

    await expect(controller.createInvite(['accountant'])).resolves.toEqual({ ok: true, code: 'AB_cd12', expiresAt: 99 })
    expect(calls).toEqual(['POST /team/invites'])

    const refused = makeCtx({ ok: true, value: roster([]) }, { current: undefined, byId: {} }, 'unavailable', {
      fetcher: fetchReply([], () => ({ status: 403, body: { code: 'forbidden', message: 'owner only' } })),
    })
    const refusedController = new WorkbenchController(refused.ctx as never, refused.fetcher)
    await expect(refusedController.createInvite(['legal'])).resolves.toEqual({ ok: false, error: 'owner only' })
  })

  it('unbinds a member by phone and refreshes the roster, surfacing failures', async () => {
    const calls: string[] = []
    const bench = makeCtx({ ok: true, value: roster([]) }, { current: undefined, byId: {} }, 'unavailable', {
      fetcher: fetchReply(calls, () => ({ status: 200, body: { ok: true, owner: 'o', members: [] } })),
    })
    const controller = new WorkbenchController(bench.ctx as never, bench.fetcher)

    await expect(controller.unbindMember('13800138000')).resolves.toBeNull()
    expect(calls).toEqual(['DELETE /team/members/13800138000', 'GET /team/members'])

    const refused = makeCtx({ ok: true, value: roster([]) }, { current: undefined, byId: {} }, 'unavailable', {
      fetcher: fetchReply([], () => ({ status: 403, body: { code: 'forbidden', message: 'owner only' } })),
    })
    const refusedController = new WorkbenchController(refused.ctx as never, refused.fetcher)
    await expect(refusedController.unbindMember('13800138000')).resolves.toBe('owner only')
  })
})
