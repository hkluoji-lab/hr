// @vitest-environment jsdom
/**
 * WorkbenchNavAction: one additive sidebar foot entry per workbench surface.
 * The wide row renders the labelled control and the rail renders the icon-only
 * button (Tooltip wraps it). Each face derives its active state from the page
 * and session stores and drives home (clear the session) or toggles its page.
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
    wide: true,
    t,
    target: 'hall',
    useActive: () => false,
    activate: vi.fn(),
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
    render(<WorkbenchNavAction {...props({ target: 'report', useActive: () => true })} />)
    expect(screen.getByRole('button', { name: zh['nav.report'] }).getAttribute('aria-current')).toBe('page')
  })

  it('renders an icon-only rail button', () => {
    const activate = vi.fn()
    render(<WorkbenchNavAction {...props({ wide: false, target: 'team', activate })} />)
    const button = screen.getByRole('button', { name: zh['nav.team'] })
    expect(button.textContent).toBe('')
    fireEvent.click(button)
    expect(activate).toHaveBeenCalledTimes(1)
  })
})

describe('navActionFace', () => {
  /** Minimal Session Controller double: mutable selection plus listeners. */
  function sessionsDouble(current: string | undefined) {
    const listeners = new Set<() => void>()
    const state = { current }
    return {
      state,
      sessions: {
        clear: vi.fn(() => {
          state.current = undefined
          for (const fn of listeners) fn()
        }),
        list: {
          getSnapshot: () => state,
          subscribe: (fn: () => void) => {
            listeners.add(fn)
            return () => { listeners.delete(fn) }
          },
        },
      },
    }
  }

  function face(target: WorkbenchNavTarget, current?: string) {
    const bench = sessionsDouble(current)
    const controller = new WorkbenchController({} as never)
    return { ...bench, controller, face: navActionFace(bench.sessions, controller, target) }
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

  it('home is active only on the hero: no page open and no current session', () => {
    const { controller, sessions, state, face: home } = face('home', 's1')
    const active = probe(home.useActive)
    expect(active()).toBe(false)

    act(() => { sessions.clear() })
    expect(state.current).toBeUndefined()
    expect(active()).toBe(true)

    act(() => { controller.openPage('hall') })
    expect(active()).toBe(false)
  })

  it('a page entry is active exactly while its page is open, and toggles on activate', () => {
    const { controller, face: hall } = face('hall')
    const active = probe(hall.useActive)
    expect(active()).toBe(false)

    act(() => { hall.activate() })
    expect(controller.pages.getSnapshot().open).toBe('hall')
    expect(active()).toBe(true)

    act(() => { hall.activate() })
    expect(controller.pages.getSnapshot().open).toBeNull()
    expect(active()).toBe(false)
  })

  it('home activate clears the session selection and closes any page', () => {
    const { controller, sessions, state, face: home } = face('home', 's1')
    controller.openPage('report')

    home.activate()
    expect(sessions.clear).toHaveBeenCalledTimes(1)
    expect(state.current).toBeUndefined()
    expect(controller.pages.getSnapshot().open).toBeNull()
  })
})
