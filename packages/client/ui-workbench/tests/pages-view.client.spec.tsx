// @vitest-environment jsdom
/**
 * The workbench page surface: the hall's rows, the active-tasks filter, the
 * task assistant's brief form, the team grid, the report's
 * metrics/ledger/grant form, and the shell that hosts them — closed state,
 * Escape/close dismissal, and the reads an open page triggers.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  WorkbenchShell, createTaskRowsHook, type WorkbenchShellProps,
} from '../src/client/WorkbenchShell.tsx'
import { AssistantPage, type AssistantPageProps } from '../src/client/pages/AssistantPage.tsx'
import { TaskHallPage, type TaskHallPageProps } from '../src/client/pages/TaskHallPage.tsx'
import { TeamPage } from '../src/client/pages/TeamPage.tsx'
import { ReportPage, type ReportPageProps } from '../src/client/pages/ReportPage.tsx'
import type {
  LedgerState, TaskRow, TeamMember, WorkbenchPagesState, WorkbenchState,
} from '../src/client/workbench-store.ts'
import { ROLES } from '../src/client/roles.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh) as TaskHallPageProps['t']

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const MEMBERS: readonly TeamMember[] = [
  { id: 'standard', name: '标准模式', description: '完整工具集', state: 'online', role: undefined },
  { id: 'minimal', name: '极简模式', description: '', state: 'busy', role: undefined },
]

const READY: WorkbenchState = {
  status: 'ready', error: null, members: MEMBERS, online: 1, busy: 1, offline: 0, credits: 1280,
  todayCount: 2, runningCount: 1, doneCount: 1,
}

/** One hall row shaped like the fold's product. */
function row(over: Partial<TaskRow> & Pick<TaskRow, 'id' | 'title'>): TaskRow {
  return { presetId: undefined, status: 'done', updatedAt: 0, ...over }
}

describe('TaskHallPage', () => {
  it('shows the empty note before any task started', () => {
    render(<TaskHallPage tasks={[]} members={MEMBERS} now={0} onOpen={vi.fn()} t={t} />)
    expect(screen.getByText(zh['hall.empty'])).toBeTruthy()
  })

  it('resolves a row preset to its member name and opens the session on click', () => {
    const onOpen = vi.fn()
    const now = 1_000_000
    render(
      <TaskHallPage
        tasks={[
          row({ id: 's1' as never, title: '写一份周报', presetId: 'minimal', status: 'running', updatedAt: now }),
          row({ id: 's2' as never, title: '默认任务', updatedAt: now }),
        ]}
        members={MEMBERS}
        now={now}
        onOpen={onOpen}
        t={t}
      />,
    )
    expect(screen.getByText('写一份周报')).toBeTruthy()
    expect(screen.getByText('极简模式')).toBeTruthy()
    expect(screen.getByText(zh['hall.defaultTeam'])).toBeTruthy()
    expect(screen.getByText(zh['hall.status.running'])).toBeTruthy()

    fireEvent.click(screen.getByText('写一份周报').closest('button')!)
    expect(onOpen).toHaveBeenCalledWith('s1')
  })

  it('marks an idle row and falls back to the raw preset id a dropped roster no longer names', () => {
    render(
      <TaskHallPage
        tasks={[row({ id: 's3' as never, title: '归档任务', presetId: 'retired', status: 'idle' })]}
        members={MEMBERS}
        now={1}
        onOpen={vi.fn()}
        t={t}
      />,
    )
    expect(screen.getByText('retired')).toBeTruthy()
    expect(screen.getByText(zh['hall.status.idle'])).toBeTruthy()
  })
})

describe('TeamPage', () => {
  it('shows the empty note without presets, else one card per member', () => {
    const empty = { ...READY, members: [] } as WorkbenchState
    render(<TeamPage state={empty} onStart={vi.fn()} t={t} />)
    expect(screen.getByText(zh['team.empty'])).toBeTruthy()
    cleanup()

    const onStart = vi.fn()
    render(<TeamPage state={READY} onStart={onStart} t={t} />)
    fireEvent.click(screen.getByText('极简模式').closest('button')!)
    expect(onStart).toHaveBeenCalledWith('minimal')
  })

  it('hides non-role presets once the deployment composes the company roles', () => {
    const roster: readonly TeamMember[] = [
      { id: 'standard', name: '标准模式', description: '完整工具集', state: 'online', role: undefined },
      { id: 'crew', name: '经营团队', description: '', state: 'online', role: undefined },
      { id: 'secretary', name: 'AI 秘书', description: '', state: 'online', role: ROLES[0] },
      { id: 'audit', name: 'AI 审计', description: '', state: 'busy', role: ROLES[3] },
    ]
    const onStart = vi.fn()
    render(<TeamPage state={{ ...READY, members: roster }} onStart={onStart} t={t} />)
    expect(screen.getByText('AI 秘书')).toBeTruthy()
    expect(screen.getByText('AI 审计')).toBeTruthy()
    expect(screen.queryByText('标准模式')).toBeNull()
    expect(screen.queryByText('经营团队')).toBeNull()
    expect(screen.queryByText('PTC模式')).toBeNull()

    fireEvent.click(screen.getByText('AI 秘书').closest('button')!)
    expect(onStart).toHaveBeenCalledWith('secretary')
  })
})

describe('AssistantPage', () => {
  const assistantT = makeTranslate(zh) as AssistantPageProps['t']
  const submit = () => screen.getByRole<HTMLButtonElement>('button', { name: zh['assistant.submit'] })

  it('assigns the trimmed brief to the default team', () => {
    const onAssign = vi.fn()
    render(<AssistantPage state={READY} onAssign={onAssign} t={assistantT} />)

    expect(submit().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(zh['assistant.brief']), { target: { value: '  写一份周报  ' } })
    fireEvent.click(submit())
    expect(onAssign).toHaveBeenCalledWith(undefined, '写一份周报')
  })

  it('assigns to the member the brief names', () => {
    const onAssign = vi.fn()
    render(<AssistantPage state={READY} onAssign={onAssign} t={assistantT} />)

    fireEvent.click(screen.getByRole('button', { name: '极简模式' }))
    fireEvent.change(screen.getByLabelText(zh['assistant.brief']), { target: { value: '写一份周报' } })
    fireEvent.click(submit())
    expect(onAssign).toHaveBeenCalledWith('minimal', '写一份周报')
  })

  it('returns to the deployment default after a member was picked', () => {
    const onAssign = vi.fn()
    render(<AssistantPage state={READY} onAssign={onAssign} t={assistantT} />)

    fireEvent.click(screen.getByRole('button', { name: '极简模式' }))
    fireEvent.click(screen.getByRole('button', { name: zh['hall.defaultTeam'] }))
    fireEvent.change(screen.getByLabelText(zh['assistant.brief']), { target: { value: '写一份周报' } })
    fireEvent.click(submit())
    expect(onAssign).toHaveBeenCalledWith(undefined, '写一份周报')
  })

  it('submits nothing for a blank brief', () => {
    const onAssign = vi.fn()
    render(<AssistantPage state={READY} onAssign={onAssign} t={assistantT} />)

    const form = submit().closest('form')!
    fireEvent.change(screen.getByLabelText(zh['assistant.brief']), { target: { value: '   ' } })
    fireEvent.submit(form)
    expect(onAssign).not.toHaveBeenCalled()
  })

  it('refuses to assign to an offline member', () => {
    const offline: WorkbenchState = {
      ...READY,
      members: [{ id: 'broken', name: '失效预设', description: '挂了', state: 'offline', role: undefined }],
    }
    render(<AssistantPage state={offline} onAssign={vi.fn()} t={assistantT} />)

    const chip = screen.getByRole('button', { name: '失效预设' }) as HTMLButtonElement
    expect(chip.disabled).toBe(true)
    expect(chip.title).toBe('挂了')
  })

  it('notes a deployment that ships no presets', () => {
    render(<AssistantPage state={{ ...READY, members: [] }} onAssign={vi.fn()} t={assistantT} />)
    expect(screen.getByText(zh['assistant.empty'])).toBeTruthy()
  })

  it('hides non-role presets from the picker once the deployment composes the company roles', () => {
    const roster: readonly TeamMember[] = [
      { id: 'standard', name: '标准模式', description: '', state: 'online', role: undefined },
      { id: 'secretary', name: 'AI 秘书', description: '', state: 'online', role: ROLES[0] },
      { id: 'legal', name: 'AI 法务', description: '', state: 'busy', role: ROLES[2] },
    ]
    render(<AssistantPage state={{ ...READY, members: roster }} onAssign={vi.fn()} t={assistantT} />)

    expect(screen.getByRole('button', { name: 'AI 秘书' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'AI 法务' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '标准模式' })).toBeNull()
    // The default-team chip stays first regardless of the roster.
    expect(screen.getByRole('button', { name: zh['hall.defaultTeam'] })).toBeTruthy()
  })

  it('keeps the picker visible and the switch enabled while the deployment composes the roles', () => {
    const roster: readonly TeamMember[] = [
      { id: 'standard', name: '标准模式', description: '', state: 'online', role: undefined },
      { id: 'secretary', name: 'AI 秘书', description: '', state: 'online', role: ROLES[0] },
    ]
    render(<AssistantPage state={{ ...READY, members: roster }} onAssign={vi.fn()} t={assistantT} />)
    const collaboration = screen.getByRole('switch', { name: zh['assistant.collaboration'] })
    expect(collaboration.getAttribute('aria-checked')).toBe('false')
    expect((collaboration as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(zh['assistant.member'])).toBeTruthy()
  })

  it('hides the picker in collaboration mode and submits the orchestration brief to the secretary', () => {
    const roster: readonly TeamMember[] = [
      { id: 'standard', name: '标准模式', description: '', state: 'online', role: undefined },
      { id: 'secretary', name: 'AI 秘书', description: '', state: 'online', role: ROLES[0] },
    ]
    const onAssign = vi.fn()
    render(<AssistantPage state={{ ...READY, members: roster }} onAssign={onAssign} t={assistantT} />)

    fireEvent.click(screen.getByRole('switch', { name: zh['assistant.collaboration'] }))
    expect(screen.queryByText(zh['assistant.member'])).toBeNull()
    expect(screen.queryByRole('button', { name: zh['hall.defaultTeam'] })).toBeNull()
    expect(screen.getByText(zh['assistant.collaborationHint'])).toBeTruthy()

    fireEvent.change(screen.getByLabelText(zh['assistant.brief']), { target: { value: '季度结算并检查合同' } })
    fireEvent.click(submit())
    expect(onAssign).toHaveBeenCalledTimes(1)
    const [presetId, brief] = onAssign.mock.calls[0] as [string | undefined, string]
    expect(presetId).toBe('secretary')
    expect(brief).toContain('季度结算并检查合同')
    expect(brief).toContain('workflow')
    expect(brief).toContain('parallel')
    expect(brief).not.toContain('{brief}')
  })

  it('falls back to manual assignment after the switch turns off again', () => {
    const onAssign = vi.fn()
    render(<AssistantPage state={READY} onAssign={onAssign} t={assistantT} />)

    const collaboration = screen.getByRole('switch', { name: zh['assistant.collaboration'] })
    fireEvent.click(collaboration)
    fireEvent.click(collaboration)
    expect(screen.getByText(zh['assistant.member'])).toBeTruthy()

    fireEvent.change(screen.getByLabelText(zh['assistant.brief']), { target: { value: '写一份周报' } })
    fireEvent.click(submit())
    expect(onAssign).toHaveBeenCalledWith(undefined, '写一份周报')
  })

  it('disables the switch when the deployment ships no secretary role', () => {
    const roster: readonly TeamMember[] = [
      { id: 'standard', name: '标准模式', description: '', state: 'online', role: undefined },
    ]
    render(<AssistantPage state={{ ...READY, members: roster }} onAssign={vi.fn()} t={assistantT} />)

    const collaboration = screen.getByRole('switch', { name: zh['assistant.collaboration'] }) as HTMLButtonElement
    expect(collaboration.disabled).toBe(true)
  })
})

describe('ReportPage', () => {
  const LEDGER: LedgerState = {
    status: 'ready',
    error: null,
    entries: [{ id: 'g1', amount: 20, reason: 'bonus', at: 0 }],
  }

  function props(over: Partial<ReportPageProps> = {}): ReportPageProps {
    return {
      ledger: LEDGER,
      report: { total: 3, running: 1, done: 2, granted: 20 },
      credits: 1280,
      now: 0,
      onGrant: vi.fn(() => Promise.resolve(null)),
      t,
      ...over,
    }
  }

  it('renders the month metrics, the balance, and the ledger', () => {
    render(<ReportPage {...props()} />)
    expect(screen.getByText(zh['report.metric.tasks'])).toBeTruthy()
    expect(screen.getByText('1280')).toBeTruthy()
    expect(screen.getByText('+20')).toBeTruthy()
    expect(screen.getByText('bonus')).toBeTruthy()
  })

  it('rejects an empty grant locally and calls the host once the form is valid', async () => {
    const onGrant = vi.fn(() => Promise.resolve(null))
    render(<ReportPage {...props({ onGrant })} />)

    fireEvent.click(screen.getByRole('button', { name: zh['report.grant.submit'] }))
    expect(screen.getByRole('alert').textContent).toBe(zh['report.grant.invalid'])
    expect(onGrant).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(zh['report.grant.amount']), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(zh['report.grant.reason']), { target: { value: 'bonus' } })
    fireEvent.click(screen.getByRole('button', { name: zh['report.grant.submit'] }))
    await vi.waitFor(() => { expect(onGrant).toHaveBeenCalledWith(10, 'bonus') })
  })

  it('shows the host message when a grant is refused', async () => {
    const onGrant = vi.fn(() => Promise.resolve('amount must be positive'))
    render(<ReportPage {...props({ onGrant })} />)

    fireEvent.change(screen.getByLabelText(zh['report.grant.amount']), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(zh['report.grant.reason']), { target: { value: 'bonus' } })
    fireEvent.click(screen.getByRole('button', { name: zh['report.grant.submit'] }))
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(zh['report.grant.failed'].replace('{message}', 'amount must be positive'))
    })
  })
})

describe('WorkbenchShell', () => {
  function props(open: WorkbenchPagesState['open'], over: Partial<WorkbenchShellProps> = {}): WorkbenchShellProps {
    const handlers = {
      load: vi.fn(() => Promise.resolve()),
      loadLedger: vi.fn(() => Promise.resolve()),
      close: vi.fn(),
      openSession: vi.fn(),
      startWithPreset: vi.fn(),
      assignTask: vi.fn(),
      grantCredits: vi.fn(() => Promise.resolve(null)),
    }
    return {
      usePages: <S,>(select: (snapshot: WorkbenchPagesState) => S) => select({ open }),
      useWorkbench: <S,>(select: (snapshot: WorkbenchState) => S) => select(READY),
      useLedger: <S,>(select: (snapshot: LedgerState) => S) => select({ status: 'ready', error: null, entries: [] }),
      useTasks: () => [] as readonly TaskRow[],
      ...handlers,
      t,
      ...over,
    } as unknown as WorkbenchShellProps
  }

  it('renders nothing while no page is open', () => {
    const { container } = render(<WorkbenchShell {...props(null)} />)
    expect(container.firstChild).toBeNull()
  })

  it('reads the roster when a page opens and the ledger for the report', async () => {
    const load = vi.fn(() => Promise.resolve())
    const loadLedger = vi.fn(() => Promise.resolve())
    render(<WorkbenchShell {...props('report', { load, loadLedger })} />)
    expect(screen.getByRole('heading', { name: zh['nav.report'] })).toBeTruthy()
    await vi.waitFor(() => { expect(loadLedger).toHaveBeenCalledTimes(1) })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('dismisses on the close control and on Escape', () => {
    const close = vi.fn()
    render(<WorkbenchShell {...props('hall', { close })} />)
    fireEvent.click(screen.getByRole('button', { name: zh['shell.close'] }))
    expect(close).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('ignores keys other than Escape', () => {
    const close = vi.fn()
    render(<WorkbenchShell {...props('hall', { close })} />)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(close).not.toHaveBeenCalled()
  })

  it('lists only running tasks on the active-tasks page', () => {
    const tasks = [
      row({ id: 's1' as never, title: '运行中的任务', status: 'running' }),
      row({ id: 's2' as never, title: '已完成的任务', status: 'done' }),
    ]
    render(<WorkbenchShell {...props('active', { useTasks: () => tasks })} />)
    expect(screen.getByRole('heading', { name: zh['nav.active'] })).toBeTruthy()
    expect(screen.getByText('运行中的任务')).toBeTruthy()
    expect(screen.queryByText('已完成的任务')).toBeNull()
  })

  it('notes an idle deployment on the active-tasks page', () => {
    render(<WorkbenchShell {...props('active')} />)
    expect(screen.getByText(zh['active.empty'])).toBeTruthy()
  })

  it('renders the AI team page over the frame', () => {
    const startWithPreset = vi.fn()
    render(<WorkbenchShell {...props('team', { startWithPreset })} />)
    expect(screen.getByRole('heading', { name: zh['nav.team'] })).toBeTruthy()

    fireEvent.click(screen.getByText('极简模式').closest('button')!)
    expect(startWithPreset).toHaveBeenCalledWith('minimal')
  })

  it('hands the assistant page its assign action', () => {
    const assignTask = vi.fn()
    render(<WorkbenchShell {...props('assistant', { assignTask })} />)
    expect(screen.getByRole('heading', { name: zh['nav.assistant'] })).toBeTruthy()

    fireEvent.change(screen.getByLabelText(zh['assistant.brief']), { target: { value: '写一份周报' } })
    fireEvent.click(screen.getByRole('button', { name: zh['assistant.submit'] }))
    expect(assignTask).toHaveBeenCalledWith(undefined, '写一份周报')
  })
})

describe('createTaskRowsHook', () => {
  /** A Session-list double whose snapshot identity the spec controls. */
  function listDouble(initial: unknown) {
    const listeners = new Set<() => void>()
    let snapshot = initial
    return {
      ctx: {
        sessions: {
          list: {
            getSnapshot: () => snapshot,
            subscribe: (fn: () => void) => {
              listeners.add(fn)
              return () => listeners.delete(fn)
            },
          },
        },
      },
      move: (next: unknown) => { snapshot = next },
      notify: () => { for (const fn of listeners) fn() },
    }
  }

  it('folds the session list and keeps the rows while the snapshot identity holds', () => {
    const bench = listDouble({ ids: [], byId: {} })
    const useTasks = createTaskRowsHook(bench.ctx as never)
    let rows: readonly TaskRow[] = []
    function Probe(): null {
      rows = useTasks()
      return null
    }
    render(<Probe />)
    expect(rows).toEqual([])

    act(() => {
      bench.move({
        ids: ['s1'],
        byId: { s1: { id: 's1', displayTitle: '写一份周报', blank: false, running: true, updatedAt: 5 } },
      })
      bench.notify()
    })
    expect(rows).toEqual([
      { id: 's1', title: '写一份周报', presetId: undefined, status: 'running', updatedAt: 5 },
    ])

    // A notification without a new snapshot re-uses the folded rows.
    act(() => { bench.notify() })
    expect(rows).toHaveLength(1)
  })
})
