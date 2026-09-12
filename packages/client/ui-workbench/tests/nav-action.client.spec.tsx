// @vitest-environment jsdom
/**
 * WorkbenchNavAction: one additive sidebar navigation entry per workbench
 * surface, rendered in the shell's navigation seat under New Session. The wide
 * row renders the labelled control and the rail renders the icon-only button
 * (Tooltip wraps it). Each page face derives its active state from the page
 * store and toggles that page; the `projects` command reveals the sidebar
 * instead and is never current. The team entry additionally renders the four
 * role groups inline, each expandable to capability children that open the
 * team page through the face's `openTeam`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import {
  WorkbenchNavAction, navActionFace, type WorkbenchNavActionProps, type WorkbenchNavTarget,
} from '../src/client/WorkbenchNavAction.tsx'
import { WorkbenchController, type MyStatus } from '../src/client/workbench-store.ts'
import { zh } from '../src/client/locales.ts'

const t: WorkbenchNavActionProps['t'] = makeTranslate(zh)

/** The visitor binding; every non-members row ignores it. */
const MY_VISITOR: MyStatus = { name: null, roles: [], isOwner: false }

function props(over: Partial<WorkbenchNavActionProps>): WorkbenchNavActionProps {
  return {
    wide: true, t, target: 'hall', useActive: () => false, activate: vi.fn(), openTeam: vi.fn(),
    useMy: () => MY_VISITOR,
    ...over,
  } as unknown as WorkbenchNavActionProps
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('WorkbenchNavAction', () => {
  it('renders the target label in the wide row and activates on click', () => {
    const activate = vi.fn()
    render(<WorkbenchNavAction {...props({ target: 'hall', activate })} />)
    const button = screen.getByRole('button', { name: zh['nav.hall'] })
    expect(button.textContent).toContain(zh['nav.hall'])
    expect(button.getAttribute('aria-current')).toBeNull()

    fireEvent.click(button)
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('marks the entry current while its surface shows', () => {
    render(<WorkbenchNavAction {...props({ target: 'active', useActive: () => true })} />)
    expect(screen.getByRole('button', { name: zh['nav.active'] }).getAttribute('aria-current')).toBe('page')
  })

  it('renders an icon-only rail button', () => {
    const activate = vi.fn()
    render(<WorkbenchNavAction {...props({ wide: false, target: 'team', activate })} />)
    const button = screen.getByRole('button', { name: zh['nav.team'] })
    expect(button.textContent).toBe('')
    fireEvent.click(button)
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('the team entry ships fully collapsed: no role rows until the chevron opens', () => {
    render(<WorkbenchNavAction {...props({ target: 'team' })} />)
    const toggle = screen.getByRole('button', { name: zh['nav.team.toggle'] })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: zh['nav.role.secretary'] })).toBeNull()
  })

  it('a role row toggles its capability children', () => {
    render(<WorkbenchNavAction {...props({ target: 'team' })} />)
    fireEvent.click(screen.getByRole('button', { name: zh['nav.team.toggle'] }))
    const accountant = screen.getByRole('button', { name: zh['nav.role.accountant'] })
    expect(screen.queryByRole('button', { name: `AI-${zh['role.accountant.tag.books']}` })).toBeNull()

    fireEvent.click(accountant)
    expect(screen.getByRole('button', { name: `AI-${zh['role.accountant.tag.books']}` })).toBeTruthy()

    fireEvent.click(accountant)
    expect(screen.queryByRole('button', { name: `AI-${zh['role.accountant.tag.books']}` })).toBeNull()
  })

  it('a capability child opens the team page through openTeam', () => {
    const openTeam = vi.fn()
    render(<WorkbenchNavAction {...props({ target: 'team', openTeam })} />)
    fireEvent.click(screen.getByRole('button', { name: zh['nav.team.toggle'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['nav.role.secretary'] }))
    fireEvent.click(screen.getByRole('button', { name: `AI-${zh['role.secretary.tag.service']}` }))
    expect(openTeam).toHaveBeenCalledTimes(1)
  })

  it('the team chevron reveals and collapses the role groups', () => {
    render(<WorkbenchNavAction {...props({ target: 'team' })} />)
    const toggle = screen.getByRole('button', { name: zh['nav.team.toggle'] })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: zh['nav.role.secretary'] })).toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: zh['nav.role.secretary'] })).toBeTruthy()

    fireEvent.click(toggle)
    expect(screen.queryByRole('button', { name: zh['nav.role.secretary'] })).toBeNull()
  })

  it('renders the owner-only members row for the owner and nothing for everyone else', () => {
    const activate = vi.fn()
    render(<WorkbenchNavAction {...props({
      target: 'members', activate, useMy: () => ({ name: null, roles: [], isOwner: true }),
    })} />)
    const row = screen.getByRole('button', { name: zh['nav.members'] })
    fireEvent.click(row)
    expect(activate).toHaveBeenCalledTimes(1)

    cleanup()
    render(<WorkbenchNavAction {...props({ target: 'members', activate })} />)
    expect(screen.queryByRole('button', { name: zh['nav.members'] })).toBeNull()

    cleanup()
    render(<WorkbenchNavAction {...props({
      wide: false, target: 'members', useMy: () => ({ name: null, roles: [], isOwner: true }),
    })} />)
    expect(screen.getByRole('button', { name: zh['nav.members'] })).toBeTruthy()
  })

  it('reveals the members row when the status load flips isOwner on the same instance', () => {
    // Regression: the owner gate used to early-return before the expansion
    // useStates, so flipping `my.isOwner` on a mounted row changed the hook
    // count and crashed the sidebar.nav slot (React #310).
    let owner = false
    const useMy = () => (owner ? { name: null, roles: [], isOwner: true } : MY_VISITOR)
    const view = render(<WorkbenchNavAction {...props({ target: 'members', useMy })} />)
    expect(screen.queryByRole('button', { name: zh['nav.members'] })).toBeNull()

    owner = true
    view.rerender(<WorkbenchNavAction {...props({ target: 'members', useMy })} />)
    expect(screen.getByRole('button', { name: zh['nav.members'] })).toBeTruthy()
  })

  it('scopes the team role groups to the bound member\'s roles', () => {
    render(<WorkbenchNavAction {...props({
      target: 'team',
      useMy: () => ({ name: null, roles: ['accountant'], isOwner: false }),
    })} />)
    fireEvent.click(screen.getByRole('button', { name: zh['nav.team.toggle'] }))

    expect(screen.getByRole('button', { name: zh['nav.role.accountant'] })).toBeTruthy()
    expect(screen.queryByRole('button', { name: zh['nav.role.secretary'] })).toBeNull()
    expect(screen.queryByRole('button', { name: zh['nav.role.legal'] })).toBeNull()
  })
})

describe('navActionFace', () => {
  /** Controller over a recorded layout double the specs observe. */
  function bench() {
    const toggleSidebar = vi.fn()
    const controller = new WorkbenchController({ layout: { toggleSidebar } } as never)
    return { controller, toggleSidebar, face: (target: WorkbenchNavTarget) => navActionFace(controller, target) }
  }

  /** Read a face's selector inside a render, as uSES requires. */
  function probe<T>(useHook: () => T): () => T {
    const box = { value: undefined as T }
    function Probe(): null {
      box.value = useHook()
      return null
    }
    render(<Probe />)
    return () => box.value
  }

  it('a page entry is active exactly while its page is open, and toggles on activate', () => {
    const b = bench()
    const entry = b.face('active')
    const active = probe(entry.useActive)
    expect(active()).toBe(false)

    act(() => { entry.activate() })
    expect(b.controller.pages.getSnapshot().open).toBe('active')
    expect(active()).toBe(true)

    act(() => { entry.activate() })
    expect(b.controller.pages.getSnapshot().open).toBeNull()
    expect(active()).toBe(false)
  })

  it('the projects command reveals the sidebar and never reports itself current', () => {
    const b = bench()
    const entry = b.face('projects')
    const active = probe(entry.useActive)
    expect(active()).toBe(false)

    act(() => { entry.activate() })
    expect(b.toggleSidebar).toHaveBeenCalledTimes(1)
    expect(b.controller.pages.getSnapshot().open).toBeNull()
    expect(active()).toBe(false)
  })

  it('openTeam shows the team page without toggling it off', () => {
    const b = bench()
    const entry = b.face('hall')

    act(() => { entry.openTeam() })
    expect(b.controller.pages.getSnapshot().open).toBe('team')

    act(() => { entry.openTeam() })
    expect(b.controller.pages.getSnapshot().open).toBe('team')
  })

  it('binds the caller role binding from the workbench snapshot', () => {
    const b = bench()
    const my = probe(b.face('members').useMy)

    expect(my()).toEqual({ name: null, roles: [], isOwner: false })
  })
})
