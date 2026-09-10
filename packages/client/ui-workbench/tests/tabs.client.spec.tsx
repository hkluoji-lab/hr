// @vitest-environment jsdom
/**
 * The workbench right-Sidebar tab bodies: the deliverables tab renders
 * the session-wide produced-path fold as openable rows and an empty state,
 * opening through the owner tab's `openResource` with the session file
 * address; the progress tab lists subagent children in store order with
 * running vs settled state and opens them through the Session Controller;
 * the credits tab renders the shared balance and ledger snapshots; and the
 * team-status tab renders the shared roster as counts plus a member list.
 */
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { MutableSessionEventSource } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ProducedFileEntry } from '@deepseek-ai/dsh-client-ui-deliverables/client'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import { CreditsTab, type CreditsTabProps } from '../src/client/tabs/CreditsTab.tsx'
import { DeliverablesTab, type DeliverablesTabProps } from '../src/client/tabs/DeliverablesTab.tsx'
import { ProgressTab, selectSubagentChildren, type ProgressTabProps } from '../src/client/tabs/ProgressTab.tsx'
import { TeamStatusTab, type TeamStatusTabProps } from '../src/client/tabs/TeamStatusTab.tsx'
import {
  CREDITS_ID, CREDITS_KIND, DELIVERABLES_ID, DELIVERABLES_KIND,
  PROGRESS_ID, PROGRESS_KIND, TEAM_STATUS_ID, TEAM_STATUS_KIND,
  creditsDefinition, deliverablesDefinition, progressDefinition, teamStatusDefinition,
} from '../src/client/tabs/tab-definitions.ts'
import { creditsFace, deliverablesFace, progressFace, teamStatusFace } from '../src/client/tabs/tab-face.ts'
import {
  WorkbenchController, type LedgerState, type TeamMember, type WorkbenchState,
} from '../src/client/workbench-store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const t = makeTranslate(zh)
const PARENT = 'parent' as SessionId

describe('DeliverablesTab', () => {
  function setup(files: readonly ProducedFileEntry[], cwd: string | undefined = '/work') {
    const openResource = vi.fn()
    const sessions = { byId: { [PARENT]: { cwd } } }
    const useSessions = <T,>(selector: (state: typeof sessions) => T): T => selector(sessions)
    const props = {
      useProducedPaths: () => files,
      useTabInfo: () => ({ tab: { id: 'tab-1', actions: { openResource } } }),
      sessionId: PARENT,
      useSessions,
      t,
    } as unknown as DeliverablesTabProps
    const view = render(<DeliverablesTab {...props} />)
    return { view, openResource }
  }

  it('renders the empty state when the session produced nothing', () => {
    const { view } = setup([])
    expect(view.getByText(zh['tab.deliverables.empty'])).toBeTruthy()
    expect(view.container.querySelector('[data-workbench-tab="deliverables"]')).toBeTruthy()
  })

  it('lists produced files by basename and opens each through the owner tab', () => {
    const files: ProducedFileEntry[] = [
      { path: 'docs/plan.md', name: 'plan.md' },
      { path: 'src/plan.md', name: 'plan.md' },
      { path: '/work/out/report.html', name: 'report.html' },
    ]
    const { view, openResource } = setup(files)
    const root = view.container.querySelector('[data-workbench-tab="deliverables"]')
    if (!(root instanceof HTMLElement)) throw new Error('deliverables root missing')
    const buttons = within(root).getAllByRole('button')
    expect(buttons.map(button => button.textContent)).toEqual(['plan.md', 'plan.md', 'report.html'])
    expect(buttons[0]!.title).toBe('docs/plan.md')

    fireEvent.click(buttons[0]!)
    expect(openResource).toHaveBeenCalledTimes(1)
    expect(openResource).toHaveBeenCalledWith(fileAddressFor(PARENT, '/work', 'docs/plan.md'))
    fireEvent.click(buttons[2]!)
    expect(openResource).toHaveBeenLastCalledWith(fileAddressFor(PARENT, '/work', '/work/out/report.html'))
  })
})

describe('ProgressTab', () => {
  function listState(children: ReadonlyArray<readonly [SessionId, string, boolean]>): SessionListState {
    const byId: SessionListState['byId'] = {
      [PARENT]: { id: PARENT, displayTitle: 'Parent', blank: false, running: false, updatedAt: 1 },
    }
    const ids: SessionId[] = [PARENT]
    for (const [id, title, running] of children) {
      ids.push(id)
      byId[id] = {
        id, displayTitle: title, blank: false, running, updatedAt: 1, origin: 'subagent', parentId: PARENT,
      }
    }
    // An unrelated subagent of another parent must never enter the list.
    const stranger = 'stranger' as SessionId
    ids.push(stranger)
    byId[stranger] = {
      id: stranger, displayTitle: 'Stranger', blank: false, running: true, updatedAt: 1,
      origin: 'subagent', parentId: 'other' as SessionId,
    }
    return {
      ids, byId, current: PARENT, phase: 'ready',
      subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    }
  }

  function setup(state: SessionListState) {
    const openSession = vi.fn()
    const useSessions = <T,>(selector: (sessions: SessionListState) => T): T => selector(state)
    const props = { openSession, sessionId: PARENT, useSessions, t } as unknown as ProgressTabProps
    const view = render(<ProgressTab {...props} />)
    return { view, openSession }
  }

  it('selects only this session\'s subagent children in store order', () => {
    const state = listState([
      ['c1' as SessionId, 'Research', true],
      ['c2' as SessionId, 'Writing', false],
    ])
    expect(selectSubagentChildren(state, PARENT).map(child => child.id)).toEqual(['c1', 'c2'])
    expect(selectSubagentChildren(state, PARENT)[0]).toMatchObject({ displayTitle: 'Research', running: true })
  })

  it('renders running and settled children and opens the clicked child', () => {
    const state = listState([
      ['c1' as SessionId, 'Research', true],
      ['c2' as SessionId, 'Writing', false],
    ])
    const { view, openSession } = setup(state)
    const root = view.container.querySelector('[data-workbench-tab="progress"]')
    if (!(root instanceof HTMLElement)) throw new Error('progress root missing')
    const buttons = within(root).getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.textContent).toContain('Research')
    expect(buttons[0]!.textContent).toContain(zh['tab.progress.running'])
    expect(buttons[0]!
      .querySelector('[data-progress-running="true"]')).toBeTruthy()
    expect(buttons[1]!.textContent).toContain('Writing')
    expect(buttons[1]!.textContent).toContain(zh['tab.progress.done'])

    fireEvent.click(buttons[1]!)
    expect(openSession).toHaveBeenCalledWith('c2')
  })

  it('renders the empty state when the session has no subtasks', () => {
    const state = listState([])
    const { view } = setup(state)
    expect(view.getByText(zh['tab.progress.empty'])).toBeTruthy()
  })
})

const MEMBERS: readonly TeamMember[] = [
  { id: 'standard', name: '标准模式', description: '', state: 'online' },
  { id: 'minimal', name: '极简模式', description: '', state: 'busy' },
  { id: 'broken', name: '失效预设', description: '', state: 'offline' },
]

const READY: WorkbenchState = {
  status: 'ready', error: null, members: MEMBERS, online: 1, busy: 1, offline: 1, credits: 1280,
}

describe('CreditsTab', () => {
  function setup(state: WorkbenchState, ledger: LedgerState) {
    const load = vi.fn(() => Promise.resolve())
    const loadLedger = vi.fn(() => Promise.resolve())
    const props = {
      useWorkbench: <S,>(select: (snapshot: WorkbenchState) => S): S => select(state),
      useLedger: <S,>(select: (snapshot: LedgerState) => S): S => select(ledger),
      load,
      loadLedger,
      t,
    } as unknown as CreditsTabProps
    return { view: render(<CreditsTab {...props} />), load, loadLedger }
  }

  it('reads both snapshots on first render and shows the loading line', async () => {
    const idle = { ...READY, status: 'idle', credits: null } as WorkbenchState
    const { view, load, loadLedger } = setup(idle, { status: 'idle', error: null, entries: [] })

    expect(view.getByText(zh['tab.credits.loading'])).toBeTruthy()
    await vi.waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1)
      expect(loadLedger).toHaveBeenCalledTimes(1)
    })
  })

  it('shows the balance and the recent grants', () => {
    const { view } = setup(READY, {
      status: 'ready',
      error: null,
      entries: [{ id: 'g1', amount: 20, reason: 'bonus', at: 0 }],
    })

    expect(view.container.querySelector('[data-workbench-tab="credits"]')).toBeTruthy()
    expect(view.getByText(zh['tab.credits.type'])).toBeTruthy()
    expect(view.getByText('1280')).toBeTruthy()
    expect(view.getByText('+20')).toBeTruthy()
    expect(view.getByText('bonus')).toBeTruthy()
  })

  it('reports a deployment that composes no credits service', () => {
    const { view } = setup({ ...READY, credits: null }, { status: 'ready', error: null, entries: [] })
    expect(view.getByText(zh['tab.credits.unavailable'])).toBeTruthy()
  })

  it('surfaces a failed read', () => {
    const { view } = setup(
      { ...READY, status: 'error', error: 'boom' },
      { status: 'ready', error: null, entries: [] },
    )
    expect(view.getByRole('alert').textContent)
      .toBe(zh['tab.credits.error'].replace('{message}', 'boom'))
  })

  it('surfaces a failed ledger read beside the balance', () => {
    const { view } = setup(READY, { status: 'error', error: 'ledger boom', entries: [] })
    expect(view.getByText('1280')).toBeTruthy()
    expect(view.getByRole('alert').textContent)
      .toBe(zh['tab.credits.error'].replace('{message}', 'ledger boom'))
  })

  it('falls back to the empty ledger note when an error carries no message', () => {
    const { view } = setup(READY, { status: 'error', error: null, entries: [] })
    expect(view.getByText(zh['tab.credits.empty'])).toBeTruthy()
    expect(view.queryByRole('alert')).toBeNull()
  })
})

describe('TeamStatusTab', () => {
  function setup(state: WorkbenchState) {
    const load = vi.fn(() => Promise.resolve())
    const props = {
      useWorkbench: <S,>(select: (snapshot: WorkbenchState) => S): S => select(state),
      load,
      t,
    } as unknown as TeamStatusTabProps
    return { view: render(<TeamStatusTab {...props} />), load }
  }

  it('tallies every member state and lists the roster', () => {
    const { view } = setup(READY)

    expect(view.container.querySelector('[data-workbench-tab="team-status"]')).toBeTruthy()
    expect(view.getByText(zh['tab.team.type'])).toBeTruthy()
    // One tally per state, each reading the roster's own count.
    expect(view.getAllByText('1')).toHaveLength(3)
    expect(view.getAllByText(zh['status.busy'])).toHaveLength(2)
    expect(view.getByText('标准模式')).toBeTruthy()
    expect(view.getByText('极简模式')).toBeTruthy()
    expect(view.getByText('失效预设')).toBeTruthy()
  })

  it('reads the roster on first render and shows the loading line', async () => {
    const { view, load } = setup({ ...READY, status: 'idle', members: [] })

    expect(view.getByText(zh['tab.team.loading'])).toBeTruthy()
    await vi.waitFor(() => { expect(load).toHaveBeenCalledTimes(1) })
  })

  it('renders the empty state when the deployment ships no presets', () => {
    const { view } = setup({ ...READY, members: [], online: 0, busy: 0, offline: 0 })
    expect(view.getByText(zh['tab.team.empty'])).toBeTruthy()
  })

  it('surfaces a failed read', () => {
    const { view } = setup({ ...READY, status: 'error', error: 'boom' })
    expect(view.getByRole('alert').textContent)
      .toBe(zh['tab.team.error'].replace('{message}', 'boom'))
  })
})

const tn = t as unknown as Parameters<typeof deliverablesDefinition>[0]

/** Assert the shared shape of a stage-one type registration. */
function expectDefinition(
  def: ReturnType<typeof deliverablesDefinition>,
  spec: {
    id: string
    kind: string
    order: number
    title: string
    guideTitle: string
    guideDescription: string
  },
): void {
  expect(def.id).toBe(spec.id)
  expect(def.kind).toBe(spec.kind)
  expect(def.priority).toBe('builtin')
  expect(def.title('sidebar://guide')).toBe(spec.title)
  expect(def.guide).toHaveLength(1)
  expect(def.guide?.[0]?.order).toBe(spec.order)
  expect(def.guide?.[0]?.title()).toBe(spec.guideTitle)
  expect(def.guide?.[0]?.description()).toBe(spec.guideDescription)
}

describe('tab definitions', () => {
  it('describes the deliverables page', () => {
    expectDefinition(deliverablesDefinition(tn), {
      id: DELIVERABLES_ID,
      kind: DELIVERABLES_KIND,
      order: 110,
      title: zh['tab.deliverables.type'],
      guideTitle: zh['tab.deliverables.guide.title'],
      guideDescription: zh['tab.deliverables.guide.description'],
    })
  })

  it('describes the progress page', () => {
    expectDefinition(progressDefinition(tn), {
      id: PROGRESS_ID,
      kind: PROGRESS_KIND,
      order: 111,
      title: zh['tab.progress.type'],
      guideTitle: zh['tab.progress.guide.title'],
      guideDescription: zh['tab.progress.guide.description'],
    })
  })

  it('describes the credits page', () => {
    expectDefinition(creditsDefinition(tn), {
      id: CREDITS_ID,
      kind: CREDITS_KIND,
      order: 112,
      title: zh['tab.credits.type'],
      guideTitle: zh['tab.credits.guide.title'],
      guideDescription: zh['tab.credits.guide.description'],
    })
  })

  it('describes the team-status page', () => {
    expectDefinition(teamStatusDefinition(tn), {
      id: TEAM_STATUS_ID,
      kind: TEAM_STATUS_KIND,
      order: 113,
      title: zh['tab.team.type'],
      guideTitle: zh['tab.team.guide.title'],
      guideDescription: zh['tab.team.guide.description'],
    })
  })
})

describe('deliverablesFace', () => {
  /** Render the face's Hook and hand back the latest folded value. */
  function renderProduced(
    useProducedPaths: () => readonly ProducedFileEntry[],
  ): () => readonly ProducedFileEntry[] {
    let files: readonly ProducedFileEntry[] = []
    function Probe(): null {
      files = useProducedPaths()
      return null
    }
    render(<Probe />)
    return () => files
  }

  it('folds the mounted session window, skipping transient rows, once per revision', () => {
    const source = new MutableSessionEventSource()
    const event = { type: 'user/message' } as never
    const produced = vi.fn(() => [{ path: 'a.md', name: 'a.md' }])
    const ctx = {
      sessions: { binding: (id: string) => (id === PARENT ? { eventSource: source } : undefined) },
      get: (name: string) => (name === 'sessionDeliverables' ? { produced } : undefined),
    }
    const face = deliverablesFace(ctx as never)(PARENT)
    const files = renderProduced(face.useProducedPaths)

    // The empty first window still resolves through the service.
    expect(produced).toHaveBeenCalledWith([])
    expect(files()).toEqual([{ path: 'a.md', name: 'a.md' }])

    act(() => {
      source.replace([{ type: 'event', event }, { type: 'transient', event: {} as never }], false)
    })
    expect(produced).toHaveBeenLastCalledWith([event])
    expect(produced).toHaveBeenCalledTimes(2)
  })

  it('reports no files for a session that is not locally bound', () => {
    const produced = vi.fn(() => [{ path: 'a.md', name: 'a.md' }])
    const ctx = {
      sessions: { binding: () => undefined },
      get: () => ({ produced }),
    }
    const face = deliverablesFace(ctx as never)(PARENT)
    expect(renderProduced(face.useProducedPaths)()).toEqual([])
    expect(produced).not.toHaveBeenCalled()
  })

  it('reports no files when the production service is composed out', () => {
    const source = new MutableSessionEventSource()
    const ctx = { sessions: { binding: () => ({ eventSource: source }) }, get: () => undefined }
    const face = deliverablesFace(ctx as never)(PARENT)
    const files = renderProduced(face.useProducedPaths)
    act(() => {
      source.replace([{ type: 'event', event: { type: 'user/message' } as never }], false)
    })
    expect(files()).toEqual([])
  })
})

describe('progressFace', () => {
  it('forwards navigation to the Session Controller', () => {
    const open = vi.fn()
    const ctx = { sessions: { open } }
    progressFace(ctx as never)().openSession('c1' as SessionId)
    expect(open).toHaveBeenCalledWith('c1')
  })
})

/** A controller double exposing the snapshots and reads the two tab faces bind. */
function controllerDouble() {
  const store = { getSnapshot: () => READY, subscribe: () => () => {} }
  const ledger = { getSnapshot: () => ({ status: 'ready', error: null, entries: [] }), subscribe: () => () => {} }
  const load = vi.fn(() => Promise.resolve())
  const loadLedger = vi.fn(() => Promise.resolve())
  return {
    controller: { store, ledger, load, loadLedger } as unknown as WorkbenchController,
    store,
    ledger,
    load,
    loadLedger,
  }
}

describe('creditsFace', () => {
  it('binds the shared snapshots and forwards both reads', async () => {
    const bench = controllerDouble()
    const face = creditsFace(bench.controller)()
    expect(face.hooks.workbench).toBe(bench.store)
    expect(face.hooks.ledger).toBe(bench.ledger)
    await face.load()
    await face.loadLedger()
    expect(bench.load).toHaveBeenCalledTimes(1)
    expect(bench.loadLedger).toHaveBeenCalledTimes(1)
  })
})

describe('teamStatusFace', () => {
  it('binds the roster snapshot and forwards the read', async () => {
    const bench = controllerDouble()
    const face = teamStatusFace(bench.controller)()
    expect(face.hooks.workbench).toBe(bench.store)
    await face.load()
    expect(bench.load).toHaveBeenCalledTimes(1)
  })
})
