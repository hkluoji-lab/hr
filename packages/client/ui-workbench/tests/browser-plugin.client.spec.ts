/**
 * ui-workbench plugin halves: the browser entry registers its dictionaries,
 * its four right-Sidebar tab types with their bodies, its hero dashboard, its
 * two sidebar brand occupants, its five sidebar nav entries, and the page
 * surface (all removed on fiber teardown — HMR safety); the node entry stays
 * inert.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  apply, inject,
  type WorkbenchInjected, type WorkbenchNavInjected, type WorkbenchShellInjected,
} from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { WorkbenchDashboard } from '../src/client/WorkbenchDashboard.tsx'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { SidebarBrandMark, SidebarBrandName } from '../src/client/SidebarBrand.tsx'
import { CreditsTab } from '../src/client/tabs/CreditsTab.tsx'
import { DeliverablesTab } from '../src/client/tabs/DeliverablesTab.tsx'
import { ProgressTab } from '../src/client/tabs/ProgressTab.tsx'
import { TeamStatusTab } from '../src/client/tabs/TeamStatusTab.tsx'
import {
  CREDITS_ID, CREDITS_KIND, DELIVERABLES_ID, DELIVERABLES_KIND,
  PROGRESS_ID, PROGRESS_KIND, TEAM_STATUS_ID, TEAM_STATUS_KIND,
} from '../src/client/tabs/tab-definitions.ts'
import { en, NS, zh } from '../src/client/locales.ts'

/** Dashboard entry ids currently registered in the hero list. */
function dashboardIds(ctx: Context): (string | undefined)[] {
  return ctx.slots.entries('conversation.hero.dashboard').map(entry => entry.options.id)
}

/** A session-list double the registration effect subscribes to; `notify` fires its list listeners. */
function sessionsDouble(): { double: unknown; notify: () => void } {
  const listeners = new Set<() => void>()
  const double = {
    clear: () => {},
    open: () => {},
    list: {
      getSnapshot: () => ({ current: undefined, ids: [], byId: {} }),
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
  }
  return { double, notify: () => { for (const listener of listeners) listener() } }
}

/** Boot the browser half over a real slot tree declaring the hero list. */
async function bench(): Promise<{
  ctx: Context
  tabs: SidebarRightTabRegistry
  fiber: ReturnType<Context['plugin']>
  sessions: { notify: () => void }
  calls: string[]
}> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const tabs = new SidebarRightTabRegistry(ctx)
  ctx.slots.register({
    name: 'root',
    children: {
      conversation: { kind: 'single', scope: 'root' },
      sidebar: { kind: 'single', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
      'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
    },
  } as never, () => null)
  ctx.slots.register({
    name: 'conversation',
    children: {
      'conversation.hero.dashboard': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  ctx.slots.register({
    name: 'sidebar',
    children: {
      'sidebar.brand.mark': { kind: 'single', scope: 'root' },
      'sidebar.brand.name': { kind: 'single', scope: 'root' },
      'sidebar.nav': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('conversation', {})
  const sessions = sessionsDouble()
  ctx.provide('sessions', sessions.double)
  ctx.provide('sidebarRightTabs', tabs)
  ctx.provide('uiWorkspace', { startSession: () => {} })
  ctx.provide('layout', { toggleSidebar: () => {} })
  // The locale plugin binds a settings scope, which reads the connection
  // handle and the forwarded-event port.
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  // The fiber waits for each nested Remote key as its own dependency; provide
  // them both ways (the nested key satisfies `inject`, the property serves
  // `ctx.remote.*`, because the double is a plain object).
  const calls: string[] = []
  const agentPresets = {
    list: () => {
      calls.push('list')
      return Promise.resolve({ ok: true as const, value: { presets: [], authorable: false } })
    },
    select: () => Promise.resolve({ ok: true as const, value: '' }),
  }
  const workbench = {
    snapshot: () => Promise.resolve({
      ok: true as const,
      value: { credits: { balance: 0 }, team: { online: 0, busy: 0, offline: 0, members: [] } },
    }),
    addCredits: () => Promise.resolve({
      ok: true as const,
      value: { id: 'grant-1', amount: 10, reason: 'seed', at: 0, balance: 10 },
    }),
    ledger: () => Promise.resolve({ ok: true as const, value: { entries: [] } }),
  }
  ctx.provide('remote.agentPresets', agentPresets as never)
  ctx.provide('remote.workbench', workbench as never)
  ctx.provide('remote', { $on: () => () => {}, agentPresets, workbench } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  // The lane has no jsdom `window`, so browser-language detection never runs;
  // state the asserted locale explicitly.
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, tabs, fiber, sessions, calls }
}

describe('ui-workbench browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual([
      'slots', 'locale', 'remote', 'remote.agentPresets', 'remote.workbench',
      'sessions', 'uiWorkspace', 'layout', 'sidebarRightTabs',
    ])
  })

  it('registers the right-Sidebar tab types and their bodies, releasing them on dispose', async () => {
    const { ctx, tabs, fiber } = await bench()
    expect(tabs.get(DELIVERABLES_KIND)?.id).toBe(DELIVERABLES_ID)
    expect(tabs.get(PROGRESS_KIND)?.id).toBe(PROGRESS_ID)
    expect(tabs.get(CREDITS_KIND)?.id).toBe(CREDITS_ID)
    expect(tabs.get(TEAM_STATUS_KIND)?.id).toBe(TEAM_STATUS_ID)
    expect(tabs.get(DELIVERABLES_KIND)?.priority).toBe('builtin')
    expect(tabs.get(DELIVERABLES_KIND)?.guide).toHaveLength(1)
    expect(tabs.get(PROGRESS_KIND)?.guide).toHaveLength(1)
    expect(tabs.get(CREDITS_KIND)?.guide).toHaveLength(1)
    expect(tabs.get(TEAM_STATUS_KIND)?.guide).toHaveLength(1)

    const bodies = ctx.slots.entries('sidebar.right.pane.tab')
    expect(bodies.map(entry => [entry.options.key, entry.component])).toEqual([
      [DELIVERABLES_ID, DeliverablesTab],
      [PROGRESS_ID, ProgressTab],
      [CREDITS_ID, CreditsTab],
      [TEAM_STATUS_ID, TeamStatusTab],
    ])

    await fiber.dispose()
    expect(tabs.get(DELIVERABLES_KIND)).toBeUndefined()
    expect(tabs.get(PROGRESS_KIND)).toBeUndefined()
    expect(tabs.get(CREDITS_KIND)).toBeUndefined()
    expect(tabs.get(TEAM_STATUS_KIND)).toBeUndefined()
    expect(ctx.slots.entries('sidebar.right.pane.tab')).toHaveLength(0)
  })

  it('registers the hero dashboard, the sidebar nav entries, and the page surface, releasing them on teardown', async () => {
    const { ctx, fiber } = await bench()
    const entries = ctx.slots.entries('conversation.hero.dashboard')
    expect(entries.map(entry => entry.options.id)).toEqual(['workbench'])
    expect(entries[0]!.component).toBe(WorkbenchDashboard)
    expect(dashboardIds(ctx)).toContain('workbench')

    // Five additive sidebar nav entries ride the same plugin fiber, in the
    // design's order: task hall, task assistant, active tasks, AI team, projects.
    expect(ctx.slots.entries('sidebar.nav').map(entry => entry.options.id))
      .toEqual([
        'workbench-hall', 'workbench-assistant', 'workbench-active',
        'workbench-team', 'workbench-projects',
      ])

    // The two deployment-brand occupants replace the shell brand fallbacks.
    // Both are `single` slots, so they carry no entry id.
    expect(ctx.slots.entries('sidebar.brand.mark')[0]!.component).toBe(SidebarBrandMark)
    expect(ctx.slots.entries('sidebar.brand.name')[0]!.component).toBe(SidebarBrandName)

    const overlay = ctx.slots.entries('shell.overlay')
    expect(overlay.map(entry => entry.options.id)).toEqual(['workbench-pages'])
    expect(overlay[0]!.component).toBe(WorkbenchShell)

    await fiber.dispose()
    expect(dashboardIds(ctx)).not.toContain('workbench')
    expect(ctx.slots.entries('sidebar.nav')).toHaveLength(0)
    expect(ctx.slots.entries('sidebar.brand.mark')).toHaveLength(0)
    expect(ctx.slots.entries('sidebar.brand.name')).toHaveLength(0)
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    expect(translate('team.title')).toBe(zh['team.title'])
    ctx.locale.setLocale('en')
    expect(translate('team.title')).toBe(en['team.title'])

    await fiber.dispose()
    expect(translate('team.title')).not.toBe(en['team.title'])
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('drives one shared controller from the hero, the page surface, and the nav entries', async () => {
    const { ctx, fiber } = await bench()

    const hero = ctx.slots.entries('conversation.hero.dashboard')[0]!
      .inject!() as unknown as WorkbenchInjected
    expect(hero.hooks.workbench.getSnapshot().status).toBe('idle')
    hero.startTask()
    hero.startWithPreset('minimal')
    hero.viewProjects()
    hero.openPage('hall')
    await hero.load()

    const shell = ctx.slots.entries('shell.overlay')[0]!
      .inject!() as unknown as WorkbenchShellInjected
    await shell.load()
    await shell.loadLedger()
    shell.openSession('s1' as SessionId)
    shell.startWithPreset('minimal')
    shell.assignTask('minimal', '写一份周报')
    await shell.grantCredits(10, 'seed')
    shell.close()
    expect(shell.hooks.pages.getSnapshot().open).toBeNull()

    const nav = ctx.slots.entries('sidebar.nav')[0]!
      .inject!() as unknown as WorkbenchNavInjected
    expect(nav.target).toBe('hall')
    nav.activate()
    expect(shell.hooks.pages.getSnapshot().open).toBe('hall')

    await fiber.dispose()
  })

  it('refolds the roster on Session-list changes once warm and on reconnect', async () => {
    const { ctx, fiber, sessions, calls } = await bench()
    const hero = ctx.slots.entries('conversation.hero.dashboard')[0]!
      .inject!() as unknown as WorkbenchInjected
    const reads = (): number => calls.filter(call => call === 'list').length
    // A refold is only observable once its own read has settled; a read that
    // starts while one is in flight is dropped.
    const settled = (expected: number): Promise<void> => vi.waitFor(() => {
      expect(reads()).toBe(expected)
      expect(hero.hooks.workbench.getSnapshot().status).not.toBe('loading')
    })

    // Cold: a list change must not race a second roster read.
    sessions.notify()
    await Promise.resolve()
    expect(reads()).toBe(0)

    await hero.load()
    expect(reads()).toBe(1)

    sessions.notify()
    await settled(2)

    ctx.emit('connection/reset')
    await settled(3)

    await fiber.dispose()
  })
})

describe('ui-workbench node half', () => {
  it('contributes no host behavior', () => {
    // The node half exists only so the plugin appears in the Loader tree.
    expect(applyNode).not.toThrow()
  })
})
