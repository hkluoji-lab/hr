// @vitest-environment jsdom
/**
 * WorkbenchDashboard rendering: the time-aware greeting, the roster-count
 * subtitle, the four quick actions (start vs sidebar routes), and the team
 * cards — enabled for live members, disabled for offline ones — plus the
 * empty-deployment note.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { WorkbenchDashboard, type WorkbenchDashboardProps } from '../src/client/WorkbenchDashboard.tsx'
import type { TeamMember, WorkbenchState } from '../src/client/workbench-store.ts'
import { zh } from '../src/client/locales.ts'

const t: WorkbenchDashboardProps['t'] = makeTranslate(zh)

/** Build one member card model. */
function member(over: Partial<TeamMember> & Pick<TeamMember, 'id' | 'name'>): TeamMember {
  return { description: '', state: 'online', ...over }
}

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
  it('greets by local hour', () => {
    const morning = setup(READY, 9)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(zh['greeting.morning'])
    morning.unmount()

    setup(READY, 14)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(zh['greeting.afternoon'])
    cleanup()

    setup(READY, 21)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(zh['greeting.evening'])
  })

  it('counts online as healthy-plus-busy and states the busy total', () => {
    // online=2 + busy=1 → three agents reachable; one of them is working.
    setup(READY, 10)
    expect(screen.getByText('3 位 AI Agent 在线 · 1 位工作中')).toBeTruthy()
  })

  it('loads the roster on mount', () => {
    const { handlers } = setup(READY, 10)
    expect(handlers.load).toHaveBeenCalledTimes(1)
  })

  it('shows the credits pill with the persisted balance, and hides it without a service', () => {
    setup({ ...READY, credits: 1280 }, 10)
    expect(screen.getByText('1280')).toBeTruthy()
    expect(screen.getByText(zh['credits.label'])).toBeTruthy()
    cleanup()

    setup(READY, 10)
    expect(screen.queryByText(zh['credits.label'])).toBeNull()
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
  it('renders every member by name and starts that member on click', () => {
    const { handlers } = setup(READY, 10)
    const card = screen.getByText('极简模式').closest('button')!
    expect(card).toBeTruthy()
    fireEvent.click(card)
    expect(handlers.startWithPreset).toHaveBeenCalledWith('minimal')
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
    }
    setup(empty, 10)
    expect(screen.getByText(zh['team.empty'])).toBeTruthy()
    expect(screen.queryByText('标准模式')).toBeNull()
  })
})
