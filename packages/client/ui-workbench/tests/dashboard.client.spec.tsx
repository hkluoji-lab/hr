// @vitest-environment jsdom
/**
 * WorkbenchDashboard rendering: the time-aware greeting with the user name,
 * the todo/presence subtitle, the stat strip, the four quick actions (start
 * vs sidebar routes), the role-ordered team cards — enabled for live members,
 * disabled for offline ones — the wide-viewport side-card column, and the
 * empty-deployment note.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  WorkbenchDashboard, type GreetingKey, type WorkbenchDashboardProps,
} from '../src/client/WorkbenchDashboard.tsx'
import { roleOf } from '../src/client/roles.ts'
import type { MyStatus, TeamMember, WorkbenchState } from '../src/client/workbench-store.ts'
import { zh } from '../src/client/locales.ts'

const t: WorkbenchDashboardProps['t'] = makeTranslate(zh)

/** The visitor binding every unscoped fixture shares. */
const MY_VISITOR: MyStatus = { name: null, roles: [], isOwner: false }

/** Build one member card model; role-less presets carry the generic mark. */
function member(over: Partial<TeamMember> & Pick<TeamMember, 'id' | 'name'>): TeamMember {
  return {
    description: '',
    state: 'online',
    role: roleOf(over.name) ?? undefined,
    ...over,
  }
}

/** A member carrying the named role's emoji/scope/tags metadata. */
function roleMember(id: string, name: string, state: TeamMember['state'] = 'online'): TeamMember {
  return member({ id, name, state, role: roleOf(name) })
}

/** Task counters shared by the ready fixtures. */
const COUNTS = { todayCount: 12, runningCount: 5, doneCount: 24 }

const READY: WorkbenchState = {
  status: 'ready',
  error: null,
  members: [
    member({ id: 'standard', name: '标准模式', description: '功能完整的编码 Agent', state: 'online' }),
    member({ id: 'minimal', name: '极简模式', state: 'busy' }),
    member({ id: 'broken', name: '损坏模式', description: '挂载失败', state: 'offline' }),
  ],
  online: 2,
  busy: 1,
  offline: 1,
  credits: null,
  userName: null,
  my: MY_VISITOR,
  ...COUNTS,
}

/** Pin the local clock to an hour and render the dashboard with recorder fns. */
function setup(state: WorkbenchState, hour: number) {
  vi.setSystemTime(new Date(2026, 8, 10, hour, 0, 0))
  const handlers = {
    load: vi.fn(() => Promise.resolve()),
    startTask: vi.fn(),
    startWithPreset: vi.fn(),
    viewProjects: vi.fn(),
    openPage: vi.fn(),
  }
  function useWorkbench<T>(select: (snapshot: WorkbenchState) => T): T {
    return select(state)
  }
  const props = { ...handlers, useWorkbench, t } as unknown as WorkbenchDashboardProps
  const result = render(<WorkbenchDashboard {...props} />)
  return { ...result, handlers }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('WorkbenchDashboard hero copy', () => {
  it('greets by local hour with the highlighted user name', () => {
    const expected = (hourKey: GreetingKey) =>
      `${zh[hourKey]}${zh['greeting.name']}${zh['greeting.suffix']}`

    // Deep night still greets as evening.
    const night = setup(READY, 2)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(expected('greeting.evening'))
    night.unmount()

    const early = setup(READY, 7)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(expected('greeting.early'))
    early.unmount()

    const morning = setup(READY, 9)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(expected('greeting.morning'))
    morning.unmount()

    setup(READY, 14)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(expected('greeting.afternoon'))
    cleanup()

    setup(READY, 21)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(expected('greeting.evening'))
  })

  it('greets the logged-in account when the host reports its name', () => {
    setup({ ...READY, userName: 'luoji' }, 10)
    expect(screen.getByText('luoji')).toBeTruthy()
    expect(screen.queryByText(zh['greeting.name'])).toBeNull()
  })

  it('falls back to the locale name when the host reports no account', () => {
    setup({ ...READY, userName: null }, 10)
    expect(screen.getByText(zh['greeting.name'])).toBeTruthy()
  })

  it('greets the bound member by the auth display name, ahead of the host account name', () => {
    setup({ ...READY, userName: 'luoji', my: { name: '张*三', roles: [], isOwner: false } }, 10)
    expect(screen.getByText('张*三')).toBeTruthy()
    expect(screen.queryByText('luoji')).toBeNull()
    expect(screen.queryByText(zh['greeting.name'])).toBeNull()
  })

  it('appends the bound roles to the greeting and stays silent for visitors', () => {
    const bound = setup({ ...READY, my: { name: null, roles: ['secretary', 'audit'], isOwner: false } }, 10)
    const roles = zh['greeting.roles'].replace('{roles}', 'AI 秘书 · AI 审计')
    expect(screen.getByText(roles)).toBeTruthy()
    bound.unmount()

    setup(READY, 10)
    expect(screen.queryByText(/（.*）/)).toBeNull()
  })

  it('counts today\u2019s tasks and online staff (healthy plus busy)', () => {
    // today=12; online=2 + busy=1 → three reachable agents.
    setup(READY, 10)
    expect(screen.getByText('今天有 12 项待办 · 3 位 AI Agent 在线 · 数据已本地化')).toBeTruthy()
  })

  it('renders the stat strip counts including active staff over roster size', () => {
    setup(READY, 10)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('24')).toBeTruthy()
    expect(screen.getByText('3/3')).toBeTruthy()
  })

  it('loads the roster on mount', () => {
    const { handlers } = setup(READY, 10)
    expect(handlers.load).toHaveBeenCalledTimes(1)
  })
})

describe('WorkbenchDashboard right-side cards', () => {
  it('shows the snapshot credits balance and marks the pending month seam as demo', () => {
    setup({ ...READY, credits: 1280 }, 10)
    expect(screen.getByText('1,280')).toBeTruthy()
    expect(screen.getByText(/87,420/)).toBeTruthy()
    expect(screen.getAllByText(zh['right.credits.demo']).length).toBeGreaterThanOrEqual(2)
  })

  it('falls back to an em dash and a demo chip while the credits read is null', () => {
    setup({ ...READY, credits: null }, 10)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.queryByText('100,000')).toBeNull()
    expect(screen.getAllByText(zh['right.credits.demo']).length).toBeGreaterThanOrEqual(3)
  })

  it('lists presence counts, progress rows, and deliverables', () => {
    setup(READY, 10)
    // online 2, busy 1, offline 1.
    expect(screen.getByText(zh['right.team.online'])).toBeTruthy()
    expect(screen.getByText(zh['right.deliverables.file1'])).toBeTruthy()
    expect(screen.getByText('60%')).toBeTruthy()
  })
})

describe('WorkbenchDashboard quick actions', () => {
  it('renders exactly the four quick cards', () => {
    setup(READY, 10)
    for (const key of ['quick.newTask', 'quick.callTeam', 'quick.viewProjects', 'quick.monthlyReport'] as const) {
      expect(screen.getByRole('button', { name: zh[key] })).toBeTruthy()
    }
  })

  it('routes new tasks to startSession, the team and report cards to their pages, and projects to the sidebar', () => {
    const { handlers } = setup(READY, 10)
    fireEvent.click(screen.getByRole('button', { name: zh['quick.newTask'] }))
    expect(handlers.startTask).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: zh['quick.callTeam'] }))
    expect(handlers.openPage).toHaveBeenCalledWith('team')

    fireEvent.click(screen.getByRole('button', { name: zh['quick.monthlyReport'] }))
    expect(handlers.openPage).toHaveBeenCalledWith('report')
    expect(handlers.openPage).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: zh['quick.viewProjects'] }))
    expect(handlers.viewProjects).toHaveBeenCalledTimes(1)
    expect(handlers.startTask).toHaveBeenCalledTimes(1)
  })
})

describe('WorkbenchDashboard team cards', () => {
  it('renders role-less presets when the deployment composes no company roles', () => {
    const { handlers } = setup(READY, 10)
    const card = screen.getByText('极简模式').closest('button')!
    expect(card).toBeTruthy()
    fireEvent.click(card)
    expect(handlers.startWithPreset).toHaveBeenCalledWith('minimal')
  })

  it('presents the four roles in design order and hides non-role presets', () => {
    const roleState: WorkbenchState = {
      ...READY,
      members: [
        member({ id: 'standard', name: '标准模式' }),
        roleMember('audit', 'AI 审计'),
        roleMember('secretary', 'AI 秘书'),
        roleMember('accountant', 'AI 会计'),
        roleMember('legal', 'AI 法务'),
      ],
    }
    setup(roleState, 10)
    expect(screen.queryByText('标准模式')).toBeNull()
    const cards = screen.getAllByText(/^AI (秘书|会计|法务|审计)$/).map(node => node.textContent)
    expect(cards).toEqual(['AI 秘书', 'AI 会计', 'AI 法务', 'AI 审计'])
    // Every role card renders its capability tags.
    expect(screen.getByText(zh['role.secretary.tag.service'])).toBeTruthy()
    expect(screen.getByText(zh['role.audit.tag.report'])).toBeTruthy()
  })

  it('disables offline members so their preset cannot be started', () => {
    setup(READY, 10)
    const broken = screen.getByText('损坏模式').closest('button')!
    expect(broken.hasAttribute('disabled')).toBe(true)
    fireEvent.click(broken)
    // The handler is bound to live cards only; a disabled button fires nothing.
    expect(screen.getByText('标准模式')).toBeTruthy()
  })

  it('shows the empty-team note instead of cards when no presets exist', () => {
    const empty: WorkbenchState = {
      status: 'unavailable', error: null, members: [], online: 0, busy: 0, offline: 0, credits: null,
      userName: null,
      my: MY_VISITOR,
      ...COUNTS,
    }
    setup(empty, 10)
    expect(screen.getByText(zh['team.empty'])).toBeTruthy()
    expect(screen.queryByText('标准模式')).toBeNull()
  })
})
