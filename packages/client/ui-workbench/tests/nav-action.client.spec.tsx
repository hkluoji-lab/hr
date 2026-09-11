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
import { WorkbenchController } from '../src/client/workbench-store.ts'
import { zh } from '../src/client/locales.ts'

const t: WorkbenchNavActionProps['t'] = makeTranslate(zh)

function props(over: Partial<WorkbenchNavActionProps>): WorkbenchNavActionProps {
  return {
    wide: true, t, target: 'hall', useActive: () => false, activate: vi.fn(), openTeam: vi.fn(), ...over,
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

  it('the team entry renders the four role groups, all open with their children', () => {
    render(<WorkbenchNavAction {...props({ target: 'team' })} />)
    for (const key of ['nav.role.secretary', 'nav.role.accountant', 'nav.role.legal', 'nav.role.audit'] as const) {
      expect(screen.getByRole('button', { name: zh[key] }).getAttribute('aria-expanded')).toBe('true')
    }
    for (const key of ['role.secretary.tag.service', 'role.secretary.tag.contract', 'role.secretary.tag.chase', 'role.secretary.tag.archive'] as const) {
      expect(screen.getByRole('button', { name: `AI-${zh[key]}` })).toBeTruthy()
    }
    // The other roles' capability children are mounted open too.
    for (const key of ['role.accountant.tag.books', 'role.legal.tag.charter', 'role.audit.tag.tick'] as const) {
      expect(screen.getByRole('button', { name: `AI-${zh[key]}` })).toBeTruthy()
    }
  })

  it('a role row toggles its capability children', () => {
    render(<WorkbenchNavAction {...props({ target: 'team' })} />)
    const accountant = screen.getByRole('button', { name: zh['nav.role.accountant'] })
    expect(screen.getByRole('button', { name: `AI-${zh['role.accountant.tag.books']}` })).toBeTruthy()

    fireEvent.click(accountant)
    expect(screen.queryByRole('button', { name: `AI-${zh['role.accountant.tag.books']}` })).toBeNull()

    fireEvent.click(accountant)
    expect(screen.getByRole('button', { name: `AI-${zh['role.accountant.tag.books']}` })).toBeTruthy()
  })

  it('a capability child opens the team page through openTeam', () => {
    const openTeam = vi.fn()
    render(<WorkbenchNavAction {...props({ target: 'team', openTeam })} />)
    fireEvent.click(screen.getByRole('button', { name: `AI-${zh['role.secretary.tag.service']}` }))
    expect(openTeam).toHaveBeenCalledTimes(1)
  })

  it('the team chevron collapses and reopens the role groups', () => {
    render(<WorkbenchNavAction {...props({ target: 'team' })} />)
    const toggle = screen.getByRole('button', { name: zh['nav.team.toggle'] })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: zh['nav.role.secretary'] })).toBeNull()

    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: zh['nav.role.secretary'] })).toBeTruthy()
  })
})

describe('navActionFace', () => {
  /** Controller over a recorded layout double the specs observe. */
  function bench() {
    const toggleSidebar = vi.fn()
    const controller = new WorkbenchController({ layout: { toggleSidebar } } as never)
    return { controller, toggleSidebar, face: (target: WorkbenchNavTarget) => navActionFace(controller, target) }
  }

  /** Read a face's active selector inside a render, as uSES requires. */
  function probe(useActive: () => boolean): () => boolean {
    const box = { value: false }
    function Probe(): null {
      box.value = useActive()
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
})
