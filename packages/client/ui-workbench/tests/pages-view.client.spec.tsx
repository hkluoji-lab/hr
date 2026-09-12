// @vitest-environment jsdom
/**
 * The workbench page surface: the hall's rows, the active-tasks filter, the
 * task assistant's brief form, the team grid, the report's
 * metrics/ledger/grant form, the owner's member management (invites, roster,
 * unbind, account deletion), the secretary-company clients page (schedule,
 * master, filing ledger), and the shell that hosts them — closed state,
 * Escape/close dismissal, and the reads an open page triggers.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { AccountEntry, MemberListEntry } from '@deepseek-ai/dsh-web-login/shared'
import {
  WorkbenchShell, createTaskRowsHook, type WorkbenchShellProps,
} from '../src/client/WorkbenchShell.tsx'
import { AssistantPage, type AssistantPageProps } from '../src/client/pages/AssistantPage.tsx'
import { ClientsPage, type ClientsPageProps } from '../src/client/pages/ClientsPage.tsx'
import { MembersPage, type MembersPageProps } from '../src/client/pages/MembersPage.tsx'
import { TaskHallPage, type TaskHallPageProps } from '../src/client/pages/TaskHallPage.tsx'
import { TeamPage } from '../src/client/pages/TeamPage.tsx'
import { ReportPage, type ReportPageProps } from '../src/client/pages/ReportPage.tsx'
import type {
  ClientsState, InviteOutcome, LedgerState, MembersState, MutationOutcome, TaskRow, TeamMember,
  WorkbenchPagesState, WorkbenchState,
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
  userName: null,
  my: { name: null, roles: [], isOwner: false },
  todayCount: 2, runningCount: 1, doneCount: 1,
}

/** The clients snapshot the shell's useClients stub binds: nothing stored yet. */
const EMPTY_CLIENTS: ClientsState = {
  status: 'ready', error: null, clients: [], obligations: [], schedule: null, deliveries: [], followUps: [],
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
    // Busy presence renders the labelled chip, not the dot matrix.
    expect(screen.getByText(zh['status.busy'])).toBeTruthy()
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

describe('MembersPage', () => {
  const ENTRY: MemberListEntry = {
    phone: '13800138000', displayName: '138****8000', roles: ['accountant'],
    grantedBy: '139****9000', grantedAt: 0,
  }

  /** The roster entry's account, so its row joins the bound role back from the roster. */
  const ACCOUNT: AccountEntry = {
    phone: ENTRY.phone, displayName: ENTRY.displayName, createdAt: 0, lastLoginAt: 0,
  }

  /** A registered account that never bound a role, so it has no roster row. */
  const UNBOUND: AccountEntry = {
    phone: '13700137000', displayName: '137****7000', createdAt: 0, lastLoginAt: 0,
  }

  /** The owner's phone, distinct from both accounts above so their rows stay deletable. */
  const OWNER = '13900139000'

  /** Roster snapshot fixtures for the three read lifecycles the page renders. */
  const ROSTER: Record<'ready' | 'loading' | 'error', MembersState> = {
    ready: { status: 'ready', error: null, owner: '', members: [ENTRY], accounts: [] },
    loading: { status: 'loading', error: null, owner: '', members: [], accounts: [] },
    error: { status: 'error', error: 'owner only', owner: '', members: [], accounts: [] },
  }

  /** The ready snapshot with the owner and the given accounts in place. */
  function withAccounts(owner: string, accounts: readonly AccountEntry[]): MembersState {
    return { ...ROSTER.ready, owner, accounts }
  }

  function props(over: Partial<MembersPageProps> = {}): MembersPageProps {
    return {
      members: ROSTER.ready,
      onCreate: vi.fn((): Promise<InviteOutcome> =>
        Promise.resolve({ ok: true, code: 'AB_cd12', expiresAt: 1_800_000_000_000 })),
      onUnbind: vi.fn((): Promise<string | null> => Promise.resolve(null)),
      onAssign: vi.fn((): Promise<string | null> => Promise.resolve(null)),
      onDelete: vi.fn((): Promise<string | null> => Promise.resolve(null)),
      t,
      ...over,
    }
  }

  it('renders the invite form with the four role checks and the empty-roster notes', () => {
    render(<MembersPage {...props({ members: ROSTER.loading })} />)
    const inviteGroup = screen.getByRole('group', { name: zh['members.roles'] })
    for (const role of ROLES) {
      expect(within(inviteGroup).getByRole('checkbox', { name: new RegExp(zh[`nav.role.${role.id}`]) }))
        .toBeTruthy()
    }
    expect(screen.getByText(zh['members.invite.none'])).toBeTruthy()
    expect(screen.getByText(zh['members.list.loading'])).toBeTruthy()
    expect(screen.getByRole('button', { name: zh['members.invite.create'] }).hasAttribute('disabled'))
      .toBe(true)
  })

  it('creates an invite from the checked roles and shows the code with its expiry', async () => {
    const onCreate = vi.fn((): Promise<InviteOutcome> =>
      Promise.resolve({ ok: true, code: 'AB_cd12', expiresAt: 1_800_000_000_000 }))
    render(<MembersPage {...props({ onCreate })} />)
    const inviteGroup = screen.getByRole('group', { name: zh['members.roles'] })

    fireEvent.click(within(inviteGroup).getByRole('checkbox', { name: new RegExp(zh['nav.role.accountant']) }))
    fireEvent.click(within(inviteGroup).getByRole('checkbox', { name: new RegExp(zh['nav.role.legal']) }))
    fireEvent.click(screen.getByRole('button', { name: zh['members.invite.create'] }))

    await vi.waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(['accountant', 'legal'])
      expect(screen.getByText('AB_cd12')).toBeTruthy()
    })
    expect(screen.getByText(zh['members.invite.hint'])).toBeTruthy()
    expect(screen.queryByText(zh['members.invite.none'])).toBeNull()
  })

  it('shows the host refusal when the invite fails', async () => {
    const onCreate = vi.fn((): Promise<InviteOutcome> => Promise.resolve({ ok: false, error: 'owner only' }))
    render(<MembersPage {...props({ onCreate })} />)
    const inviteGroup = screen.getByRole('group', { name: zh['members.roles'] })

    fireEvent.click(within(inviteGroup).getByRole('checkbox', { name: new RegExp(zh['nav.role.secretary']) }))
    fireEvent.click(screen.getByRole('button', { name: zh['members.invite.create'] }))

    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent)
        .toBe(zh['members.invite.failed'].replace('{message}', 'owner only'))
    })
    expect(screen.queryByText(zh['members.invite.code'])).toBeNull()
  })

  it('lists the roster with roles, grant metadata, and unbind actions', async () => {
    const onUnbind = vi.fn((): Promise<string | null> => Promise.resolve(null))
    render(<MembersPage {...props({ onUnbind })} />)

    const list = screen.getByRole('list')
    expect(within(list).getByText('138****8000')).toBeTruthy()
    expect(within(list).getByText('AI 会计')).toBeTruthy()
    // The meta span appends the relative grant time after the grantor, so match by prefix.
    expect(within(list).getByText((_, el) =>
      el?.textContent?.startsWith(zh['members.list.grantedBy'].replace('{name}', '139****9000')) === true,
    )).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: zh['members.unbind'] }))
    await vi.waitFor(() => { expect(onUnbind).toHaveBeenCalledWith('13800138000') })
  })

  it('notes an empty roster, a failed read, and a refused unbind', async () => {
    const onUnbind = vi.fn((): Promise<string | null> => Promise.resolve('owner only'))
    const { unmount } = render(<MembersPage {...props({ members: ROSTER.error, onUnbind })} />)
    expect(screen.getByText(zh['members.list.error'].replace('{message}', 'owner only'))).toBeTruthy()
    unmount()

    const empty = render(<MembersPage {...props({ members: { ...ROSTER.ready, members: [] }, onUnbind })} />)
    expect(screen.getByText(zh['members.list.empty'])).toBeTruthy()
    empty.unmount()

    render(<MembersPage {...props({ onUnbind })} />)
    fireEvent.click(screen.getByRole('button', { name: zh['members.unbind'] }))
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent)
        .toBe(zh['members.unbind.failed'].replace('{message}', 'owner only'))
    })
  })

  it('assigns the checked roles to the typed phone and clears the form on success', async () => {
    const onAssign = vi.fn((): Promise<string | null> => Promise.resolve(null))
    render(<MembersPage {...props({ onAssign })} />)
    const assignGroup = screen.getByRole('group', { name: zh['members.assign.title'] })
    const submit = screen.getByRole('button', { name: zh['members.assign.submit'] })

    expect(submit.hasAttribute('disabled')).toBe(true)
    fireEvent.click(within(assignGroup).getByRole('checkbox', { name: new RegExp(zh['nav.role.legal']) }))
    fireEvent.change(screen.getByLabelText(zh['members.assign.phone']), { target: { value: '13800138000' } })
    fireEvent.click(submit)

    await vi.waitFor(() => {
      expect(onAssign).toHaveBeenCalledWith('13800138000', ['legal'])
      // The reset shows up as the submit button going back to its disabled state.
      expect(screen.getByRole('button', { name: zh['members.assign.submit'] }).hasAttribute('disabled'))
        .toBe(true)
    })
  })

  it('shows the host refusal when the direct assignment fails', async () => {
    const onAssign = vi.fn((): Promise<string | null> => Promise.resolve('no-account'))
    render(<MembersPage {...props({ onAssign })} />)
    const assignGroup = screen.getByRole('group', { name: zh['members.assign.title'] })

    fireEvent.click(within(assignGroup).getByRole('checkbox', { name: new RegExp(zh['nav.role.audit']) }))
    fireEvent.change(screen.getByLabelText(zh['members.assign.phone']), { target: { value: '13700009999' } })
    fireEvent.click(screen.getByRole('button', { name: zh['members.assign.submit'] }))

    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent)
        .toBe(zh['members.assign.failed'].replace('{message}', 'no-account'))
    })
  })

  it('lists every registered account, joining roles from the roster and noting the unbound', () => {
    render(<MembersPage {...props({ members: withAccounts(OWNER, [ACCOUNT, UNBOUND]) })} />)

    expect(screen.getByText(UNBOUND.displayName)).toBeTruthy()
    // The account that never bound a role has no roster row, so its own row says so.
    expect(screen.getByText(zh['members.accounts.unbound'])).toBeTruthy()
    // The bound account's row joins the role back from the roster. `span` keeps
    // the invite and assign forms' role checkboxes out of the match.
    expect(screen.getAllByText(zh['nav.role.accountant'], { selector: 'span' }).length).toBe(2)
    // Both account rows carry the registration and last-login times.
    expect(screen.getAllByText((_, el) =>
      el?.textContent?.startsWith(zh['members.accounts.registeredAt'].replace('{time}', '')) === true
      && el.textContent.includes(zh['members.accounts.lastLoginAt'].replace('{time}', '')),
    ).length).toBe(2)
    expect(screen.getAllByRole('button', { name: zh['members.accounts.delete'] }).length).toBe(2)
    expect(screen.getByText(zh['members.accounts.hint'])).toBeTruthy()
  })

  it('renders the owner row without a delete action', () => {
    render(<MembersPage {...props({ members: withAccounts(ACCOUNT.phone, [ACCOUNT]) })} />)

    expect(screen.getByText(zh['members.accounts.selfHint'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: zh['members.accounts.delete'] })).toBeNull()
    // The roster's unbind action is independent of the account list.
    expect(screen.getByRole('button', { name: zh['members.unbind'] })).toBeTruthy()
  })

  it('notes the account read lifecycles and the empty list', () => {
    const loading = render(<MembersPage {...props({ members: ROSTER.loading })} />)
    expect(screen.getByText(zh['members.accounts.loading'])).toBeTruthy()
    loading.unmount()

    const failed = render(<MembersPage {...props({ members: ROSTER.error })} />)
    expect(screen.getByText(zh['members.accounts.error'].replace('{message}', 'owner only'))).toBeTruthy()
    failed.unmount()

    render(<MembersPage {...props()} />)
    expect(screen.getByText(zh['members.accounts.empty'])).toBeTruthy()
  })

  it('deletes an account through the host and surfaces the refusal', async () => {
    const onDelete = vi.fn((): Promise<string | null> => Promise.resolve(null))
    const { unmount } = render(
      <MembersPage {...props({ members: withAccounts(OWNER, [ACCOUNT]), onDelete })} />,
    )

    fireEvent.click(screen.getByRole('button', { name: zh['members.accounts.delete'] }))
    await vi.waitFor(() => { expect(onDelete).toHaveBeenCalledWith(ACCOUNT.phone) })
    expect(screen.queryByRole('alert')).toBeNull()
    unmount()

    const refused = vi.fn((): Promise<string | null> => Promise.resolve('forbidden'))
    render(<MembersPage {...props({ members: withAccounts(OWNER, [ACCOUNT]), onDelete: refused })} />)
    fireEvent.click(screen.getByRole('button', { name: zh['members.accounts.delete'] }))

    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent)
        .toBe(zh['members.accounts.delete.failed'].replace('{message}', 'forbidden'))
    })
  })
})

describe('ClientsPage', () => {
  const CLIENT = {
    id: 'C-2026-0001', nameCn: 'ABC 贸易有限公司', nameEn: 'ABC Trading Limited',
    brNo: 'BR-7788', incorporationDate: '2024-03-15', complianceStatus: 'green' as const,
    createdAt: 1, openObligations: 1, openDeliveries: 1,
  }
  const OBLIGATION = {
    id: 'o1', clientId: 'C-2026-0001', clientNameCn: 'ABC 贸易有限公司', kind: 'NAR1' as const,
    periodLabel: '2026', dueDate: '2026-03-15', status: 'open' as const, createdAt: 1,
    daysUntilDue: 30, dueTier: 'd30' as const,
  }
  const DELIVERY = {
    id: 'd1', clientId: 'C-2026-0001', clientNameCn: 'ABC 贸易有限公司', title: '2026 年报 NAR1 套装',
    channel: 'email' as const, status: 'sent' as const, createdAt: 1, daysSinceSent: 7, followUpTier: 'chase' as const,
  }
  const FOLLOW_UP = {
    id: 'delivery:d1', targetKind: 'delivery' as const, targetId: 'd1', clientId: 'C-2026-0001',
    clientNameCn: 'ABC 贸易有限公司', title: '2026 年报 NAR1 套装', tier: 'chase' as const,
    suggestedChannel: 'wechat' as const, days: 7, message: '催办话术草稿', reminderCount: 1, lastReminderAt: 2,
  }
  const CLIENTS: ClientsState = {
    status: 'ready',
    error: null,
    clients: [CLIENT],
    obligations: [OBLIGATION],
    schedule: {
      year: '2026',
      rows: [
        { clientId: 'C-2026-0001', clientNameCn: 'ABC 贸易有限公司', kind: 'NAR1', periodLabel: '2026', dueDate: '2026-03-15', status: 'open', source: 'ledger', dueTier: 'd30' },
        { clientId: 'C-2026-0002', clientNameCn: '乙公司', kind: 'NAR1', periodLabel: '2026', dueDate: '2026-07-01', status: 'open', source: 'derived', dueTier: 'ok' },
      ],
    },
    deliveries: [DELIVERY],
    followUps: [FOLLOW_UP],
  }

  function props(over: Partial<ClientsPageProps> = {}): ClientsPageProps {
    return {
      clients: CLIENTS,
      onAddClient: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      onRemoveClient: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      onAddObligation: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      onMarkObligation: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      onRemoveObligation: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      onAddDelivery: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      onMarkDelivery: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      onRemoveDelivery: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      onRecordFollowUp: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      t,
      ...over,
    }
  }

  it('renders the schedule with tiers and sources, the master, and the ledger', () => {
    render(<ClientsPage {...props()} />)
    expect(screen.getByText(zh['clients.schedule.title'].replace('{year}', '2026'))).toBeTruthy()
    // The client name and the due tier repeat across the schedule, the master,
    // and the ledger; assert presence, not uniqueness.
    expect(screen.getAllByText('ABC 贸易有限公司').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(zh['clients.tier.d30']).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(zh['clients.tier.ok'])).toBeTruthy()
    expect(screen.getByText(zh['clients.source.derived'])).toBeTruthy()
    expect(screen.getByText(zh['clients.source.ledger'])).toBeTruthy()
    expect(screen.getByText('ABC Trading Limited')).toBeTruthy()
    // The master row joins BR/CR/incorporation into one meta string.
    expect(screen.getByText('BR BR-7788 · 成立于 2024-03-15')).toBeTruthy()
    expect(screen.getByText(zh['clients.compliance.green'])).toBeTruthy()
    expect(screen.getByText(`${zh['clients.master.openObligations'].replace('{n}', '1')} · ${zh['clients.master.openDeliveries'].replace('{n}', '1')}`)).toBeTruthy()
    expect(screen.getByText(zh['clients.obligationStatus.open'])).toBeTruthy()
  })

  it('notes loading, error, and empty reads', () => {
    const loading = render(<ClientsPage {...props({ clients: { ...CLIENTS, status: 'loading', schedule: null } })} />)
    // The loading note renders in both the schedule and the master sections.
    expect(screen.getAllByText(zh['clients.read.loading']).length).toBeGreaterThanOrEqual(1)
    loading.unmount()

    const failed = render(<ClientsPage {...props({
      clients: { status: 'error', error: 'boom', clients: [], obligations: [], schedule: null, deliveries: [], followUps: [] },
    })} />)
    expect(screen.getAllByText(zh['clients.read.error'].replace('{message}', 'boom')).length)
      .toBeGreaterThanOrEqual(1)
    failed.unmount()

    render(<ClientsPage {...props({
      clients: { status: 'ready', error: null, clients: [], obligations: [], schedule: { year: '2026', rows: [] }, deliveries: [], followUps: [] },
    })} />)
    expect(screen.getByText(zh['clients.master.empty'])).toBeTruthy()
    expect(screen.getByText(zh['clients.schedule.empty'])).toBeTruthy()
    expect(screen.getByText(zh['clients.obligations.empty'])).toBeTruthy()
    expect(screen.getByText(zh['clients.delivery.empty'])).toBeTruthy()
    expect(screen.getByText(zh['clients.followUpCenter.empty'])).toBeTruthy()
  })

  it('adds a client with only the filled optional fields and clears the form', async () => {
    const onAddClient = vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true }))
    render(<ClientsPage {...props({ onAddClient })} />)
    const submit = screen.getByRole('button', { name: zh['clients.add.submit'] })
    expect(submit.hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText(zh['clients.add.nameCn']), { target: { value: '  甲公司  ' } })
    fireEvent.change(screen.getByLabelText(zh['clients.add.incorporation']), { target: { value: '2024-03-15' } })
    fireEvent.change(screen.getByLabelText(zh['clients.add.brNo']), { target: { value: 'BR-9' } })
    fireEvent.click(submit)

    await vi.waitFor(() => {
      expect(onAddClient).toHaveBeenCalledWith({
        nameCn: '甲公司', brNo: 'BR-9', incorporationDate: '2024-03-15',
      })
    })
    await waitFor(() => {
      const nameInput = screen.getByLabelText(zh['clients.add.nameCn']) as HTMLInputElement
      expect(nameInput.value).toBe('')
    })
  })

  it('disables the submit until the name and date are present, and surfaces the host refusal', async () => {
    const onAddClient = vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: false, code: null, error: 'nope' }))
    render(<ClientsPage {...props({ onAddClient })} />)
    const submit = screen.getByRole('button', { name: zh['clients.add.submit'] })

    // Missing date keeps the control disabled, so a click cannot submit.
    fireEvent.change(screen.getByLabelText(zh['clients.add.nameCn']), { target: { value: '甲公司' } })
    expect(submit.hasAttribute('disabled')).toBe(true)
    fireEvent.click(submit)
    expect(onAddClient).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(zh['clients.add.incorporation']), { target: { value: '2024-03-15' } })
    fireEvent.click(submit)
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent)
        .toBe(zh['clients.add.failed'].replace('{message}', 'nope'))
    })
  })

  it('removes a client and marks or removes an obligation row', async () => {
    const onRemoveClient = vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true }))
    const onMarkObligation = vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true }))
    const onRemoveObligation = vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true }))
    render(<ClientsPage {...props({ onRemoveClient, onMarkObligation, onRemoveObligation })} />)

    // Both remove buttons read 删除; scope each query to its row.
    const masterRow = screen.getByText(zh['clients.compliance.green']).closest('li')!
    fireEvent.click(within(masterRow).getByRole('button', { name: zh['clients.master.remove'] }))
    await vi.waitFor(() => { expect(onRemoveClient).toHaveBeenCalledWith('C-2026-0001') })

    const ledgerRow = screen.getByText(zh['clients.obligationStatus.open']).closest('li')!
    fireEvent.click(within(ledgerRow).getByRole('button', { name: zh['clients.obligations.mark'] }))
    await vi.waitFor(() => { expect(onMarkObligation).toHaveBeenCalledWith('o1', 'submitted') })

    fireEvent.click(within(ledgerRow).getByRole('button', { name: zh['clients.obligations.remove'] }))
    await vi.waitFor(() => { expect(onRemoveObligation).toHaveBeenCalledWith('o1') })
  })

  it('records a filing against the chosen client and refuses an incomplete form locally', async () => {
    const onAddObligation = vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true }))
    render(<ClientsPage {...props({ onAddObligation })} />)
    // The client label reads 客户 in both the obligation and the delivery form;
    // scope every query to the obligation section.
    const section = screen.getByText(zh['clients.obligations.title']).closest('section')!
    const submit = within(section).getByRole('button', { name: zh['clients.obligations.record.submit'] })
    expect(submit.hasAttribute('disabled')).toBe(true)

    fireEvent.change(within(section).getByLabelText(zh['clients.obligations.record.client']), { target: { value: 'C-2026-0001' } })
    fireEvent.change(within(section).getByLabelText(zh['clients.obligations.record.kind']), { target: { value: 'ITR' } })
    fireEvent.change(within(section).getByLabelText(zh['clients.obligations.record.period']), { target: { value: '2026' } })
    fireEvent.click(submit)
    expect(onAddObligation).not.toHaveBeenCalled()

    fireEvent.change(within(section).getByLabelText(zh['clients.obligations.record.due']), { target: { value: '2026-04-30' } })
    fireEvent.click(submit)
    await vi.waitFor(() => {
      expect(onAddObligation).toHaveBeenCalledWith({
        clientId: 'C-2026-0001', kind: 'ITR', periodLabel: '2026', dueDate: '2026-04-30',
      })
    })
  })

  it('renders the delivery ledger with channel, lifecycle, and follow-up tiers', () => {
    render(<ClientsPage {...props()} />)
    expect(screen.getByText(zh['clients.delivery.title'])).toBeTruthy()
    expect(screen.getByText(zh['clients.deliveryStatus.sent'])).toBeTruthy()
    // The days meta and the tier badge also render in the follow-up center's
    // row; assert presence, not uniqueness.
    expect(screen.getAllByText(zh['clients.delivery.days'].replace('{n}', '7')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(zh['clients.followUp.chase']).length).toBeGreaterThanOrEqual(1)
    // The channel badge and the form's channel option share the label text.
    expect(screen.getAllByText(zh['clients.channel.email']).length).toBeGreaterThanOrEqual(1)
  })

  it('records a delivery against the chosen client and refuses an incomplete form locally', async () => {
    const onAddDelivery = vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true }))
    render(<ClientsPage {...props({ onAddDelivery })} />)
    // The client label reads 客户 in both the obligation and the delivery form;
    // scope every query to the delivery section.
    const section = screen.getByText(zh['clients.delivery.title']).closest('section')!
    const submit = within(section).getByRole('button', { name: zh['clients.delivery.record.submit'] })
    expect(submit.hasAttribute('disabled')).toBe(true)

    fireEvent.change(within(section).getByLabelText(zh['clients.delivery.record.client']), { target: { value: 'C-2026-0001' } })
    fireEvent.click(submit)
    expect(onAddDelivery).not.toHaveBeenCalled()

    fireEvent.change(within(section).getByLabelText(zh['clients.delivery.record.title']), { target: { value: '  年报套装  ' } })
    fireEvent.change(within(section).getByLabelText(zh['clients.delivery.record.channel']), { target: { value: 'wechat' } })
    fireEvent.click(submit)
    await vi.waitFor(() => {
      expect(onAddDelivery).toHaveBeenCalledWith({ clientId: 'C-2026-0001', title: '年报套装', channel: 'wechat' })
    })
  })

  it('advances and removes a delivery row through its lifecycle', async () => {
    const onMarkDelivery = vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true }))
    const onRemoveDelivery = vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true }))
    render(<ClientsPage {...props({ onMarkDelivery, onRemoveDelivery })} />)

    // The tier badge repeats in the follow-up center; scope to the delivery ledger.
    const section = screen.getByText(zh['clients.delivery.title']).closest('section')!
    const deliveryRow = within(section).getByText(zh['clients.followUp.chase']).closest('li')!
    fireEvent.click(within(deliveryRow).getByRole('button', { name: zh['clients.delivery.advance.viewed'] }))
    await vi.waitFor(() => { expect(onMarkDelivery).toHaveBeenCalledWith('d1', 'viewed') })

    fireEvent.click(within(deliveryRow).getByRole('button', { name: zh['clients.delivery.remove'] }))
    await vi.waitFor(() => { expect(onRemoveDelivery).toHaveBeenCalledWith('d1') })
  })

  it('renders the follow-up center queue with the rung badge, kind, days, and reminder count', () => {
    render(<ClientsPage {...props()} />)
    expect(screen.getByText(zh['clients.followUpCenter.title'])).toBeTruthy()
    const center = screen.getByText(zh['clients.followUpCenter.title']).closest('section')!
    const queueRow = within(center).getByText(zh['clients.followUp.chase']).closest('li')!
    expect(within(queueRow).getByText(zh['clients.followUpCenter.kind.delivery'])).toBeTruthy()
    expect(within(queueRow).getByText(zh['clients.delivery.days'].replace('{n}', '7'))).toBeTruthy()
    expect(within(queueRow).getByText(zh['clients.followUpCenter.reminders'].replace('{n}', '1'))).toBeTruthy()
    const message = within(queueRow).getByLabelText(zh['clients.followUpCenter.message']) as HTMLTextAreaElement
    expect(message.value).toBe('催办话术草稿')
  })

  it('logs a reminder with the edited message and channel from the queue row', async () => {
    const onRecordFollowUp = vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true }))
    render(<ClientsPage {...props({ onRecordFollowUp })} />)
    const center = screen.getByText(zh['clients.followUpCenter.title']).closest('section')!
    const queueRow = within(center).getByText(zh['clients.followUp.chase']).closest('li')!

    fireEvent.change(within(queueRow).getByLabelText(zh['clients.followUpCenter.message']), { target: { value: '已电话提醒客户' } })
    fireEvent.change(within(queueRow).getByLabelText(zh['clients.followUpCenter.channel']), { target: { value: 'whatsapp' } })
    fireEvent.click(within(queueRow).getByRole('button', { name: zh['clients.followUpCenter.submit'] }))

    await vi.waitFor(() => {
      expect(onRecordFollowUp).toHaveBeenCalledWith({
        targetKind: 'delivery', targetId: 'd1', channel: 'whatsapp', message: '已电话提醒客户',
      })
    })
  })

  it('notes an empty queue and surfaces a refused reminder from the row', async () => {
    const onRecordFollowUp = vi.fn((): Promise<MutationOutcome> => Promise.resolve({
      ok: false, code: 'workbench/follow-up-not-open', error: 'already closed',
    }))
    const { unmount } = render(<ClientsPage {...props({ clients: EMPTY_CLIENTS, onRecordFollowUp })} />)
    expect(screen.getByText(zh['clients.followUpCenter.empty'])).toBeTruthy()
    unmount()

    render(<ClientsPage {...props({ onRecordFollowUp })} />)
    const center = screen.getByText(zh['clients.followUpCenter.title']).closest('section')!
    const queueRow = within(center).getByText(zh['clients.followUp.chase']).closest('li')!
    fireEvent.click(within(queueRow).getByRole('button', { name: zh['clients.followUpCenter.submit'] }))

    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent)
        .toBe(zh['clients.followUpCenter.failed'].replace('{message}', 'already closed'))
    })
  })
})

describe('WorkbenchShell', () => {
  function props(open: WorkbenchPagesState['open'], over: Partial<WorkbenchShellProps> = {}): WorkbenchShellProps {
    const handlers = {
      load: vi.fn(() => Promise.resolve()),
      loadLedger: vi.fn(() => Promise.resolve()),
      loadMembers: vi.fn(() => Promise.resolve()),
      loadClients: vi.fn(() => Promise.resolve()),
      close: vi.fn(),
      openSession: vi.fn(),
      startWithPreset: vi.fn(),
      assignTask: vi.fn(),
      grantCredits: vi.fn(() => Promise.resolve(null)),
      createInvite: vi.fn((): Promise<InviteOutcome> => Promise.resolve({ ok: true, code: 'x', expiresAt: 1 })),
      unbindMember: vi.fn((): Promise<string | null> => Promise.resolve(null)),
      assignMember: vi.fn((): Promise<string | null> => Promise.resolve(null)),
      deleteAccount: vi.fn((): Promise<string | null> => Promise.resolve(null)),
      addClient: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      removeClient: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      addObligation: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      markObligation: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      removeObligation: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      addDelivery: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      markDelivery: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      removeDelivery: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
      recordFollowUp: vi.fn((): Promise<MutationOutcome> => Promise.resolve({ ok: true })),
    }
    return {
      usePages: <S,>(select: (snapshot: WorkbenchPagesState) => S) => select({ open }),
      useWorkbench: <S,>(select: (snapshot: WorkbenchState) => S) => select(READY),
      useLedger: <S,>(select: (snapshot: LedgerState) => S) => select({ status: 'ready', error: null, entries: [] }),
      useMembers: <S,>(select: (snapshot: MembersState) => S) =>
        select({ status: 'ready', error: null, owner: '', members: [], accounts: [] }),
      useClients: <S,>(select: (snapshot: ClientsState) => S) => select(EMPTY_CLIENTS),
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

  it('opens the clients page, reads its data once, and renders the schedule', async () => {
    const loadClients = vi.fn(() => Promise.resolve())
    render(<WorkbenchShell {...props('clients', { loadClients })} />)
    expect(screen.getByRole('heading', { name: zh['nav.clients'] })).toBeTruthy()
    expect(screen.getByText(zh['clients.schedule.empty'])).toBeTruthy()
    await vi.waitFor(() => { expect(loadClients).toHaveBeenCalledTimes(1) })
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

  it('renders the members page for the owner and reads the roster', async () => {
    const loadMembers = vi.fn(() => Promise.resolve())
    render(<WorkbenchShell {...props('members', {
      loadMembers,
      useWorkbench: <S,>(select: (snapshot: WorkbenchState) => S) =>
        select({ ...READY, my: { name: null, roles: [], isOwner: true } }),
    })} />)
    expect(screen.getByRole('heading', { name: zh['nav.members'] })).toBeTruthy()
    expect(screen.getByText(zh['members.subtitle'])).toBeTruthy()
    await vi.waitFor(() => { expect(loadMembers).toHaveBeenCalledTimes(1) })
  })

  it('leaves the members page body out for a non-owner', () => {
    render(<WorkbenchShell {...props('members')} />)
    expect(screen.getByRole('heading', { name: zh['nav.members'] })).toBeTruthy()
    expect(screen.queryByText(zh['members.subtitle'])).toBeNull()
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
