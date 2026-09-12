/**
 * Workbench controller: the hero dashboard's data and actions, the frame-wide
 * page state, and the credits ledger page.
 *
 * The team roster is the same agent-preset directory the settings surface
 * manages (one `agentPresets.list` call); a member is `busy` when a live
 * (non-blank) session currently runs that preset, `online` when the preset is
 * healthy and idle, and `offline` when the host reports it broken. The quick
 * actions start sessions through the Workspace navigation service — a team
 * member click additionally stages that member's preset, which reaches the
 * blank session the start creates via `agentPresets.select`, the same flow the
 * hero preset chip uses. A written assignment stages its brief too, which the
 * controller submits as that session's first user message.
 *
 * Beyond the hero, the same controller owns which workbench page covers the
 * frame (the sidebar nav toggles one), the bounded credits ledger the report
 * page reads, the owner's members-management data, and the secretary-company
 * client master with its statutory-filing ledger, the current year's
 * compliance schedule, and the signature-delivery ledger (the clients page).
 *
 * The logged-in caller's role binding arrives through one same-origin
 * `/auth/status` read (the host login surface's wire contract): owners and
 * unbound visitors see the whole team, while a member bound to roles sees
 * their own roles plus the role-less presets, in the roster, the nav's role
 * groups, and the assignment picker alike. The read degrades to that visitor
 * default, so a deployment without the login surface renders unchanged.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge (agentPresets, workbench) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the Session Controller service merge (ctx.sessions).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the Workspace navigation service merge (ctx.uiWorkspace).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: pulls the layout panel-action merge (ctx.layout).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { AgentPresetRoster } from '@deepseek-ai/dsh-agent-presets/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  WorkbenchClient, WorkbenchClientCreate, WorkbenchCreditEntry, WorkbenchDelivery,
  WorkbenchDeliveryCreate, WorkbenchDeliveryStatus, WorkbenchFollowUp, WorkbenchFollowUpCreate,
  WorkbenchObligation, WorkbenchObligationCreate, WorkbenchSchedule,
} from '@deepseek-ai/dsh-workbench/types'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
// Wire contract of the host login surface: same-origin routes and payloads.
import {
  AUTH_STATUS_ROUTE, TEAM_ACCOUNTS_PHONE_PREFIX, TEAM_ACCOUNTS_ROUTE,
  TEAM_INVITES_CREATE_ROUTE, TEAM_MEMBERS_PHONE_PREFIX, TEAM_MEMBERS_ROUTE,
  type AccountEntry, type AccountListResult, type AuthStatusPayload, type InviteCreatePayload,
  type InviteCreateResult, type MemberAssignPayload,
  type MemberListEntry, type MemberListResult,
} from '@deepseek-ai/dsh-web-login/shared'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { ROLES, roleOf, type RoleId, type RoleMeta } from './roles.ts'

/* jscpd:ignore-start -- each browser plugin owns its same-origin fetch carrier;
   extracting the helper would couple unrelated feature plugins or mint a package for two members. */
/** HTTP carrier for the same-origin auth and team reads; injectable for tests. */
type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** Resolve the browser's Host base with the connection carrier's null-origin fallback. */
function hostBase(): string {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'
}
/* jscpd:ignore-end */

/** A team member's live state, mirroring the roster vs live sessions. */
export type TeamMemberState = 'online' | 'busy' | 'offline'

/**
 * Map a member state onto the shared presence dot: green online, the running
 * chase while busy, grey for a member no session can start.
 * @param state - the member's live state.
 * @returns the dot state every member surface renders.
 */
export function memberDotState(state: TeamMemberState): StateDotState {
  switch (state) {
    case 'online': return 'done'
    case 'busy': return 'ongoing'
    case 'offline': return 'idle'
  }
}

/** One AI team member as the dashboard renders it. */
export interface TeamMember {
  /** Preset id; also the select target when the card starts a session. */
  id: string
  /** Display name, falling back to the preset id. */
  name: string
  /** One-line description the preset published. */
  description: string
  /** Live state derived from the roster and the session list. */
  state: TeamMemberState
  /** Role presentation (emoji, scope, tags), for the four company presets. */
  role: RoleMeta | undefined
}

/** The logged-in caller's own role binding, read from the host auth status. */
export interface MyStatus {
  /** The auth display name of the logged-in account, or null when unknown. */
  name: string | null
  /** The bound AI-company roles; empty means a visitor (no binding yet). */
  roles: readonly RoleId[]
  /** True when the caller is the deployment owner (the earliest account). */
  isOwner: boolean
}

/** The visitor default every degraded or unauthenticated read falls back to. */
const MY_VISITOR: MyStatus = { name: null, roles: [], isOwner: false }

/**
 * Whether one role id is one of the workbench's four company roles.
 * @param value - the raw role string from the auth payload.
 * @returns true when the value names a known role.
 */
function isRoleId(value: string): value is RoleId {
  return ROLES.some(role => role.id === value)
}

/**
 * Scope the roster to the caller's work area: owners and visitors (no bound
 * roles) see the whole team; a bound member sees their own roles plus the
 * role-less presets, which stay common workspace.
 * @param members - the full roster.
 * @param my - the caller's role binding.
 * @returns the member cards the caller's surfaces present.
 */
export function scopedMembers(members: readonly TeamMember[], my: MyStatus): readonly TeamMember[] {
  if (my.isOwner || my.roles.length === 0) return members
  return members.filter(member => member.role === undefined || my.roles.includes(member.role.id))
}

/**
 * Scope the nav's role groups with the same rule as {@link scopedMembers}.
 * @param my - the caller's role binding.
 * @returns the role groups the navigation renders.
 */
export function scopedRoles(my: MyStatus): readonly RoleMeta[] {
  if (my.isOwner || my.roles.length === 0) return ROLES
  return ROLES.filter(role => my.roles.includes(role.id))
}

/**
 * Order the roster for role display: the four company roles in their design
 * order when the deployment composes them, otherwise every preset. The hero
 * dashboard and the team page present the same fold, so mode and other
 * non-role presets never appear as the company's team.
 * @param members - the full roster from the snapshot.
 * @returns the member cards the role surfaces present.
 */
export function roleMembers(members: readonly TeamMember[]): readonly TeamMember[] {
  const roles = ROLES
    .map(role => members.find(member => member.role?.id === role.id))
    .filter((member): member is TeamMember => member !== undefined)
  return roles.length > 0 ? roles : members
}

/** Workbench dashboard snapshot. */
export interface WorkbenchState {
  /** Read lifecycle: `unavailable` means the deployment composes no presets. */
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
  /** The roster read failure message, cleared on the next successful load. */
  error: string | null
  /** Team members in roster order, broken presets last. */
  members: readonly TeamMember[]
  /** Count of the company's role members online (healthy, idle). */
  online: number
  /** Count of the company's role members busy (a live session runs their preset). */
  busy: number
  /** Count of the company's role members offline (broken presets). */
  offline: number
  /** Persisted credits balance, or null when the host composes no workbench service. */
  credits: number | null
  /** The logged-in account's display name for the greeting, or null when the host reports none. */
  userName: string | null
  /** The caller's own identity and role binding, visitor by default. */
  my: MyStatus
  /** Tasks (started, non-blank sessions) updated since local midnight. */
  todayCount: number
  /** Tasks currently running. */
  runningCount: number
  /** Tasks the host marked finished, all time. */
  doneCount: number
}

const INITIAL: WorkbenchState = {
  status: 'idle',
  error: null,
  members: [],
  online: 0,
  busy: 0,
  offline: 0,
  credits: null,
  userName: null,
  my: MY_VISITOR,
  todayCount: 0,
  runningCount: 0,
  doneCount: 0,
}

/** A workbench page the sidebar surfaces as a frame-wide overlay. */
export type WorkbenchPageId = 'hall' | 'assistant' | 'active' | 'clients' | 'team' | 'report' | 'members'

/** Which workbench page, if any, covers the app frame. */
export interface WorkbenchPagesState {
  /** The open page, or null while the frame shows the app itself. */
  open: WorkbenchPageId | null
}

/** Closed-page state; also the value a close write restores. */
const PAGES_CLOSED: WorkbenchPagesState = { open: null }

/** One task row the hall lists, folded from the Session list. */
export interface TaskRow {
  /** Session id; also the `open()` target. */
  id: SessionId
  /** Human-facing session title. */
  title: string
  /** Preset id the session runs; absent when the Host composition owns it. */
  presetId: string | undefined
  /** Lifecycle: running, finished, or idle. */
  status: 'running' | 'done' | 'idle'
  /** Last update, epoch milliseconds. */
  updatedAt: number
}

/** The credits-ledger read lifecycle. */
export interface LedgerState {
  /** Read lifecycle of the bounded ledger page. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The ledger read failure message, cleared on the next successful read. */
  error: string | null
  /** Recent grants, newest first. */
  entries: readonly WorkbenchCreditEntry[]
}

const LEDGER_INITIAL: LedgerState = { status: 'idle', error: null, entries: [] }

/** The members-management read lifecycle (owner-only surface). */
export interface MembersState {
  /** Read lifecycle of the owner's roster page. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The read failure message, cleared on the next successful read. */
  error: string | null
  /** The owner's phone number; empty before the first read answers. */
  owner: string
  /** The bound roster, ordered by grant time. */
  members: readonly MemberListEntry[]
  /** Every registered account, ordered by registration time, bound or not. */
  accounts: readonly AccountEntry[]
}

const MEMBERS_INITIAL: MembersState = { status: 'idle', error: null, owner: '', members: [], accounts: [] }

/**
 * The clients-page read lifecycle: the client master (S-CORE-01), the filing
 * obligation ledger (S-COMPL-01), the current year's compliance schedule, the
 * signature-delivery ledger (S-DELIV-01), and the follow-up center
 * (S-FOLLOW-01), all served by the host workbench Remote.
 */
export interface ClientsState {
  /** Read lifecycle of the clients page. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The read failure message, cleared on the next successful read. */
  error: string | null
  /** Every stored client row, creation order preserved. */
  clients: readonly WorkbenchClient[]
  /** Every stored obligation row, open rows first, soonest due first. */
  obligations: readonly WorkbenchObligation[]
  /** The current year's filing schedule, or null until the first read. */
  schedule: WorkbenchSchedule | null
  /** Every stored delivery row, longest-waiting open rows first. */
  deliveries: readonly WorkbenchDelivery[]
  /** The follow-up center's actionable rows, most urgent rung first. */
  followUps: readonly WorkbenchFollowUp[]
}

const CLIENTS_INITIAL: ClientsState = {
  status: 'idle', error: null, clients: [], obligations: [], schedule: null, deliveries: [], followUps: [],
}

/**
 * One host mutation's outcome for the clients page: failures carry the wire
 * error code (the page maps known codes to friendly copy) beside the raw
 * message.
 */
export type MutationOutcome =
  | { ok: true }
  | { ok: false; code: string | null; error: string }

/** One invite-creation outcome for the owner's management page. */
export type InviteOutcome =
  | { ok: true; code: string; expiresAt: number }
  | { ok: false; error: string }

/** One month's task and credits tally for the report page. */
export interface MonthReport {
  /** Non-blank sessions updated inside the month. */
  total: number
  /** Of those, sessions still running. */
  running: number
  /** Of those, sessions the Host marked finished. */
  done: number
  /** Credits granted inside the month. */
  granted: number
}

/**
 * What one `startSession` call must still hand to the blank Session it creates
 * or reuses: the member preset to compose, and the brief to submit.
 */
interface StagedStart {
  /** Member preset to compose, or undefined to keep the deployment default. */
  readonly presetId: string | undefined
  /** First user message, or undefined to start the session empty. */
  readonly brief: string | undefined
}

/**
 * Fold the Session list into hall rows: every started session, newest first.
 * Blank sessions are the New Session scratchpad, and catalog children belong to
 * their parent's progress page — neither is a task of its own.
 * @param snapshot - the Session list snapshot.
 * @returns task rows ordered by last update, newest first.
 */
export function taskRows(snapshot: SessionListState): TaskRow[] {
  const rows: TaskRow[] = []
  for (const id of snapshot.ids) {
    const session = snapshot.byId[id]
    if (session === undefined || session.blank || session.origin === 'subagent') continue
    const preset = session.projectionValues?.agentPreset
    rows.push({
      id: session.id,
      title: session.displayTitle,
      presetId: typeof preset === 'string' ? preset : undefined,
      status: session.running ? 'running' : session.completed === true ? 'done' : 'idle',
      updatedAt: session.updatedAt,
    })
  }
  rows.sort((left, right) => right.updatedAt - left.updatedAt)
  return rows
}

/**
 * Tally the local calendar month containing `now`.
 * @param tasks - hall rows folded from the Session list.
 * @param entries - ledger entries, newest first.
 * @param now - the reference instant, epoch milliseconds.
 * @returns task and credits counts for that month.
 */
export function monthReport(
  tasks: readonly TaskRow[],
  entries: readonly WorkbenchCreditEntry[],
  now: number,
): MonthReport {
  const start = new Date(now)
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  const from = start.getTime()
  const inMonth = tasks.filter(task => task.updatedAt >= from)
  return {
    total: inMonth.length,
    running: inMonth.filter(task => task.status === 'running').length,
    done: inMonth.filter(task => task.status === 'done').length,
    granted: entries.reduce((total, entry) => total + (entry.at >= from ? entry.amount : 0), 0),
  }
}

/** Hero stat counters folded from the Session list. */
export interface TaskCounts {
  /** Tasks updated since local midnight. */
  today: number
  /** Tasks currently running. */
  running: number
  /** Tasks the host marked finished, all time. */
  done: number
}

/**
 * Fold the Session list into the hero's task counters.
 * @param snapshot - the Session list snapshot.
 * @param now - the reference instant, epoch milliseconds.
 * @returns today's, running, and finished task counts.
 */
export function taskCounts(snapshot: SessionListState, now: number = Date.now()): TaskCounts {
  const rows = taskRows(snapshot)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return {
    today: rows.filter(row => row.updatedAt >= start.getTime()).length,
    running: rows.filter(row => row.status === 'running').length,
    done: rows.filter(row => row.status === 'done').length,
  }
}

/**
 * Read the agent-preset roster, turning the optional-service absence into an
 * empty roster the same way the preset surfaces do.
 * @param ctx - the browser plugin context carrying the Remote namespaces.
 * @returns the roster, or the failure message.
 */
async function readRoster(
  ctx: ClientContext,
): Promise<{ ok: true; value: AgentPresetRoster } | { ok: false; error: string }> {
  const result = await ctx.remote.agentPresets.list()
  if (result.ok) return { ok: true, value: result.value }
  // Agent presets are optional: without the service every session uses the
  // Host composition, which the dashboard reports as an empty team.
  if (result.error.code === 'gateway/invocation-unavailable') {
    return { ok: true, value: { presets: [], authorable: false } }
  }
  return { ok: false, error: result.error.message }
}

/**
 * Read the credits balance and the greeting name from the host workbench
 * Remote. Both reads are decorative for the dashboard, so a deployment
 * without the service (or a failed read) answers nulls instead of failing
 * the whole dashboard load.
 * @param ctx - the browser plugin context carrying the Remote namespaces.
 * @returns the balance and the account display name, either null when unavailable.
 */
async function readHost(ctx: ClientContext): Promise<{ credits: number | null; userName: string | null }> {
  const result = await ctx.remote.workbench.snapshot()
  if (!result.ok) return { credits: null, userName: null }
  return {
    credits: result.value.credits.balance,
    userName: result.value.user?.name ?? null,
  }
}

/**
 * Extract the host error message from a non-OK same-origin answer, falling
 * back to the status line when the body is not the login contract's JSON.
 * @param response - the failed response.
 * @returns the message the surfaces can render.
 */
async function responseMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { message?: unknown }
    if (typeof payload.message === 'string' && payload.message.length > 0) return payload.message
  } catch {
    // Body-less failure (truncated answer, opaque error): the status line is
    // the only fact left to report.
  }
  return `HTTP ${String(response.status)}`
}

/**
 * Read the caller's identity and role binding from the host auth status.
 * Identity is decorative for the dashboard: a deployment without the login
 * surface, an unauthenticated caller, or a failed read all answer the visitor
 * default instead of failing the whole dashboard load.
 * @param fetcher - HTTP carrier for the same-origin read.
 * @returns the caller's binding, or the visitor default.
 */
async function readAuthStatus(fetcher: Fetch): Promise<MyStatus> {
  try {
    const response = await fetcher(new URL(AUTH_STATUS_ROUTE, hostBase()), { headers: { accept: 'application/json' } })
    if (!response.ok) return MY_VISITOR
    const payload = await response.json() as AuthStatusPayload
    if (!payload.authenticated) return MY_VISITOR
    return {
      name: payload.displayName ?? null,
      roles: (payload.roles ?? []).filter(role => typeof role === 'string' && isRoleId(role)),
      isOwner: payload.isOwner === true,
    }
  } catch {
    // Swallows network failures: an unreachable host reads as a visitor, and
    // the dashboard renders the unscoped view rather than a broken one.
    return MY_VISITOR
  }
}

/** Preset ids a live (started, non-blank) session currently runs. */
function busyPresetIds(ctx: ClientContext): ReadonlySet<string> {
  const snapshot = ctx.sessions.list.getSnapshot()
  const busy = new Set<string>()
  for (const session of Object.values(snapshot.byId)) {
    if (session.blank) continue
    const preset = session.projectionValues?.agentPreset
    if (typeof preset === 'string') busy.add(preset)
  }
  return busy
}

/** Owns the workbench snapshots and their actions. */
export class WorkbenchController {
  /** Dashboard snapshot the renderer subscribes to. */
  readonly store: SnapshotStore<WorkbenchState> = createSnapshotStore(INITIAL)

  /** Page-surface snapshot: which workbench page covers the frame. */
  readonly pages: SnapshotStore<WorkbenchPagesState> = createSnapshotStore(PAGES_CLOSED)

  /** Credits-ledger snapshot the report page subscribes to. */
  readonly ledger: SnapshotStore<LedgerState> = createSnapshotStore(LEDGER_INITIAL)

  /** Members-management snapshot the owner's roster page subscribes to. */
  readonly members: SnapshotStore<MembersState> = createSnapshotStore(MEMBERS_INITIAL)

  /** Clients-page snapshot: client master, obligation ledger, and schedule. */
  readonly clients: SnapshotStore<ClientsState> = createSnapshotStore(CLIENTS_INITIAL)

  /** Preset and brief staged for the blank session the next start creates. */
  private staged: StagedStart | undefined

  /**
   * @param ctx - the browser plugin context (roster read, sessions, navigation).
   * @param fetcher - HTTP carrier for the same-origin auth and team reads.
   */
  constructor(
    private readonly ctx: ClientContext,
    private readonly fetcher: Fetch = (input, init) => fetch(input, init),
  ) {}

  private set(patch: Partial<WorkbenchState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /**
   * Load the roster, the caller's binding, and derive the team states. An
   * empty roster is a valid deployment (the Host composition only), reported
   * as `unavailable`.
   */
  async load(): Promise<void> {
    if (this.store.getSnapshot().status === 'loading') return
    this.set({ status: 'loading', error: null })
    const [roster, host, my] = await Promise.all([
      readRoster(this.ctx), readHost(this.ctx), readAuthStatus(this.fetcher),
    ])
    if (!roster.ok) {
      this.set({ status: 'error', error: roster.error, my })
      return
    }
    const counts = taskCounts(this.ctx.sessions.list.getSnapshot())
    const presets = roster.value.presets
    if (presets.length === 0) {
      this.set({
        status: 'unavailable', members: [], online: 0, busy: 0, offline: 0,
        credits: host.credits, userName: host.userName, my,
        todayCount: counts.today, runningCount: counts.running, doneCount: counts.done,
      })
      return
    }
    const busy = busyPresetIds(this.ctx)
    const members: TeamMember[] = presets.map((preset) => {
      const name = preset.name ?? preset.id
      const state: TeamMemberState = preset.broken !== undefined
        ? 'offline'
        : busy.has(preset.id) ? 'busy' : 'online'
      return {
        id: preset.id,
        name,
        description: preset.description ?? '',
        state,
        role: roleOf(name),
      }
    })
    // Healthy members first, broken (offline) ones sink to the end.
    members.sort((left, right) =>
      left.state === 'offline' && right.state !== 'offline' ? 1
        : right.state === 'offline' && left.state !== 'offline' ? -1
          : 0)
    // Workspace scoping: a bound member sees only their roles plus the
    // role-less presets, so every count and surface below shares the fold.
    const visible = scopedMembers(members, my)
    // Every "AI team status" count reads the company's role roster, so mode
    // and other non-role presets never dilute the team's tallies.
    const roleRoster = roleMembers(visible)
    this.set({
      status: 'ready',
      error: null,
      members: visible,
      credits: host.credits,
      userName: host.userName,
      my,
      online: roleRoster.filter(member => member.state === 'online').length,
      busy: roleRoster.filter(member => member.state === 'busy').length,
      offline: roleRoster.filter(member => member.state === 'offline').length,
      todayCount: counts.today,
      runningCount: counts.running,
      doneCount: counts.done,
    })
  }

  /** Start a fresh task session with the deployment default composition. */
  startTask(): void {
    this.staged = undefined
    this.ctx.uiWorkspace.startSession()
  }

  /**
   * Start a session dedicated to one team member: stage the preset, start a
   * blank session, and apply the pick once that session becomes blank. The
   * host refuses composing a non-blank session, so the staged select lands on
   * the new session only.
   * @param presetId - the member's preset id.
   */
  startWithPreset(presetId: string): void {
    this.closePage()
    this.stage({ presetId, brief: undefined })
  }

  /**
   * Start a session for one written assignment, optionally composed for a
   * team member, and submit the brief as its first user message.
   * @param presetId - the member's preset, or undefined for the default team.
   * @param brief - the task description to submit.
   */
  assignTask(presetId: string | undefined, brief: string): void {
    this.closePage()
    this.stage({ presetId, brief })
  }

  /** Reveal the sidebar, where the project/workspace browser lives. */
  viewProjects(): void {
    this.ctx.layout.toggleSidebar()
  }

  /**
   * Open one page over the frame.
   * @param page - the page to show.
   */
  openPage(page: WorkbenchPageId): void {
    this.pages.set({ open: page })
  }

  /**
   * Open one page over the frame, or close it when it already is the open one.
   * @param page - the page to toggle.
   */
  togglePage(page: WorkbenchPageId): void {
    this.pages.set(this.pages.getSnapshot().open === page ? PAGES_CLOSED : { open: page })
  }

  /** Close whichever workbench page covers the frame. */
  closePage(): void {
    if (this.pages.getSnapshot().open !== null) this.pages.set(PAGES_CLOSED)
  }

  /**
   * Select a hall row's session as current and leave the page.
   * @param id - the session to open.
   */
  openSession(id: SessionId): void {
    this.closePage()
    this.ctx.sessions.open(id)
  }

  /** Read the bounded credits ledger into the report page's snapshot. */
  async loadLedger(): Promise<void> {
    this.ledger.set({ status: 'loading', error: null, entries: this.ledger.getSnapshot().entries })
    const result = await this.ctx.remote.workbench.ledger()
    if (!result.ok) {
      this.ledger.set({ status: 'error', error: result.error.message, entries: [] })
      return
    }
    this.ledger.set({ status: 'ready', error: null, entries: result.value.entries })
  }

  /**
   * Read the member roster and the registered-account list into the owner's
   * management page snapshot. Both feed the one page and every write below
   * re-reads them together, so a single lifecycle reports either failure.
   */
  async loadMembers(): Promise<void> {
    this.members.set({ ...this.members.getSnapshot(), status: 'loading', error: null })
    try {
      const [rosterResponse, accountsResponse] = await Promise.all([
        this.fetcher(new URL(TEAM_MEMBERS_ROUTE, hostBase()), { headers: { accept: 'application/json' } }),
        this.fetcher(new URL(TEAM_ACCOUNTS_ROUTE, hostBase()), { headers: { accept: 'application/json' } }),
      ])
      const failed = rosterResponse.ok ? accountsResponse : rosterResponse
      if (!failed.ok) {
        this.members.set({ status: 'error', error: await responseMessage(failed), owner: '', members: [], accounts: [] })
        return
      }
      const roster = await rosterResponse.json() as MemberListResult
      const accounts = await accountsResponse.json() as AccountListResult
      this.members.set({
        status: 'ready', error: null, owner: accounts.owner,
        members: roster.members, accounts: accounts.accounts,
      })
    } catch (error) {
      this.members.set({ status: 'error', error: error instanceof Error ? error.message : String(error), owner: '', members: [], accounts: [] })
    }
  }

  /**
   * Read the client master, the obligation ledger, the current year's
   * schedule, the delivery ledger, and the follow-up center into the
   * clients-page snapshot. Every write below re-reads the same quintuple, so
   * the page never derives what the host already decided.
   */
  async loadClients(): Promise<void> {
    const keep = this.clients.getSnapshot()
    this.clients.set({ ...keep, status: 'loading', error: null })
    const [master, ledger, schedule, deliveries, followUps] = await Promise.all([
      this.ctx.remote.workbench.clients(),
      this.ctx.remote.workbench.obligations(),
      this.ctx.remote.workbench.complianceSchedule(),
      this.ctx.remote.workbench.deliveries(),
      this.ctx.remote.workbench.followUps(),
    ])
    if (!master.ok || !ledger.ok || !schedule.ok || !deliveries.ok || !followUps.ok) {
      const failure = [master, ledger, schedule, deliveries, followUps].find(read => !read.ok)
      this.clients.set({
        status: 'error', error: failure?.error.message ?? 'unknown failure',
        clients: [], obligations: [], schedule: null, deliveries: [], followUps: [],
      })
      return
    }
    this.clients.set({
      status: 'ready',
      error: null,
      clients: master.value.clients,
      obligations: ledger.value.obligations,
      schedule: schedule.value,
      deliveries: deliveries.value.deliveries,
      followUps: followUps.value.followUps,
    })
  }

  /**
   * Create one client master row, then refresh the page from the host.
   * @param payload - the creation request.
   * @returns the mutation outcome; a failure carries the host's error code and message.
   */
  async addClient(payload: WorkbenchClientCreate): Promise<MutationOutcome> {
    const result = await this.ctx.remote.workbench.addClient(payload)
    if (!result.ok) return { ok: false, code: result.error.code, error: result.error.message }
    await this.loadClients()
    return { ok: true }
  }

  /**
   * Remove one client master row (its obligations go with it), then refresh.
   * @param id - the client id to remove.
   * @returns the mutation outcome; a failure carries the host's error code and message.
   */
  async removeClient(id: string): Promise<MutationOutcome> {
    const result = await this.ctx.remote.workbench.removeClient(id)
    if (!result.ok) return { ok: false, code: result.error.code, error: result.error.message }
    await this.loadClients()
    return { ok: true }
  }

  /**
   * Record one filing obligation against a client, then refresh.
   * @param payload - the recording request.
   * @returns the mutation outcome; a failure carries the host's error code and message.
   */
  async addObligation(payload: WorkbenchObligationCreate): Promise<MutationOutcome> {
    const result = await this.ctx.remote.workbench.addObligation(payload)
    if (!result.ok) return { ok: false, code: result.error.code, error: result.error.message }
    await this.loadClients()
    return { ok: true }
  }

  /**
   * Move one obligation between `open` and `submitted`, then refresh.
   * @param id - the obligation id.
   * @param status - the lifecycle state to set.
   * @returns the mutation outcome; a failure carries the host's error code and message.
   */
  async markObligation(id: string, status: 'open' | 'submitted'): Promise<MutationOutcome> {
    const result = await this.ctx.remote.workbench.markObligation(id, status)
    if (!result.ok) return { ok: false, code: result.error.code, error: result.error.message }
    await this.loadClients()
    return { ok: true }
  }

  /**
   * Remove one obligation row, then refresh.
   * @param id - the obligation id to remove.
   * @returns the mutation outcome; a failure carries the host's error code and message.
   */
  async removeObligation(id: string): Promise<MutationOutcome> {
    const result = await this.ctx.remote.workbench.removeObligation(id)
    if (!result.ok) return { ok: false, code: result.error.code, error: result.error.message }
    await this.loadClients()
    return { ok: true }
  }

  /**
   * Record one signature delivery against a client, then refresh.
   * @param payload - the recording request.
   * @returns the mutation outcome; a failure carries the host's error code and message.
   */
  async addDelivery(payload: WorkbenchDeliveryCreate): Promise<MutationOutcome> {
    const result = await this.ctx.remote.workbench.addDelivery(payload)
    if (!result.ok) return { ok: false, code: result.error.code, error: result.error.message }
    await this.loadClients()
    return { ok: true }
  }

  /**
   * Move one delivery along its lifecycle (`sent`/`viewed`/`signed`/`returned`),
   * then refresh.
   * @param id - the delivery id.
   * @param status - the lifecycle state to set.
   * @returns the mutation outcome; a failure carries the host's error code and message.
   */
  async markDelivery(id: string, status: WorkbenchDeliveryStatus): Promise<MutationOutcome> {
    const result = await this.ctx.remote.workbench.markDelivery(id, status)
    if (!result.ok) return { ok: false, code: result.error.code, error: result.error.message }
    await this.loadClients()
    return { ok: true }
  }

  /**
   * Remove one delivery row, then refresh.
   * @param id - the delivery id to remove.
   * @returns the mutation outcome; a failure carries the host's error code and message.
   */
  async removeDelivery(id: string): Promise<MutationOutcome> {
    const result = await this.ctx.remote.workbench.removeDelivery(id)
    if (!result.ok) return { ok: false, code: result.error.code, error: result.error.message }
    await this.loadClients()
    return { ok: true }
  }

  /**
   * Log one follow-up reminder against an open delivery or obligation, then
   * refresh so the row's reminder count and the queue's rungs come back from
   * the host rather than being derived here.
   * @param payload - the logging request; channel and message default to the
   *   rung's host draft when omitted.
   * @returns the mutation outcome; a failure carries the host's error code and message.
   */
  async recordFollowUp(payload: WorkbenchFollowUpCreate): Promise<MutationOutcome> {
    const result = await this.ctx.remote.workbench.recordFollowUp(payload)
    if (!result.ok) return { ok: false, code: result.error.code, error: result.error.message }
    await this.loadClients()
    return { ok: true }
  }

  /**
   * Create one member invite granting the given roles.
   * @param roles - the roles the redeemer will hold; at least one.
   * @returns the invite for the owner to relay, or the failure message.
   */
  async createInvite(roles: readonly RoleId[]): Promise<InviteOutcome> {
    const body: InviteCreatePayload = { roles: [...roles] }
    try {
      const response = await this.fetcher(new URL(TEAM_INVITES_CREATE_ROUTE, hostBase()), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) return { ok: false, error: await responseMessage(response) }
      const payload = await response.json() as InviteCreateResult
      return { ok: true, code: payload.code, expiresAt: payload.expiresAt }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Unbind one member's roles, then refresh the roster from the host.
   * @param phone - the member's phone number.
   * @returns the host failure message, or null when the unbind landed.
   */
  async unbindMember(phone: string): Promise<string | null> {
    try {
      const response = await this.fetcher(
        new URL(`${TEAM_MEMBERS_PHONE_PREFIX}/${encodeURIComponent(phone)}`, hostBase()),
        { method: 'DELETE' },
      )
      if (!response.ok) return await responseMessage(response)
      await this.loadMembers()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  /**
   * Assign one registered account its whole role set, then refresh the roster.
   * @param phone - the member's phone number; the account must already exist.
   * @param roles - the roles the member will hold; at least one.
   * @returns the host failure message, or null when the assignment landed.
   */
  async assignMember(phone: string, roles: readonly RoleId[]): Promise<string | null> {
    const body: MemberAssignPayload = { roles: [...roles] }
    try {
      const response = await this.fetcher(
        new URL(`${TEAM_MEMBERS_PHONE_PREFIX}/${encodeURIComponent(phone)}`, hostBase()),
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!response.ok) return await responseMessage(response)
      await this.loadMembers()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  /**
   * Delete one registered account, its credential, and its role binding, then
   * refresh both lists from the host.
   * @param phone - the account's phone number; the owner's own phone is refused.
   * @returns the host failure message, or null when the deletion landed.
   */
  async deleteAccount(phone: string): Promise<string | null> {
    try {
      const response = await this.fetcher(
        new URL(`${TEAM_ACCOUNTS_PHONE_PREFIX}/${encodeURIComponent(phone)}`, hostBase()),
        { method: 'DELETE' },
      )
      if (!response.ok) return await responseMessage(response)
      await this.loadMembers()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  /**
   * Grant points, then refresh the balance and the ledger from the host's own
   * answer rather than re-reading the whole snapshot.
   * @param amount - points to grant.
   * @param reason - why the points were granted.
   * @returns the host failure message, or null when the grant landed.
   */
  async grantCredits(amount: number, reason: string): Promise<string | null> {
    const result = await this.ctx.remote.workbench.addCredits(amount, reason)
    if (!result.ok) return result.error.message
    this.set({ credits: result.value.balance })
    await this.loadLedger()
    return null
  }

  /**
   * Start a session and watch the list until there is a blank one to hand the
   * staged start to. Nothing is applied while the previous (non-blank) session
   * is still current.
   * @param staged - the preset and brief to apply.
   */
  private stage(staged: StagedStart): void {
    this.staged = staged
    this.ctx.uiWorkspace.startSession()
    const stop = this.ctx.sessions.list.subscribe(() => {
      void this.applyStaged(stop)
    })
  }

  /**
   * Hand the staged start to the current blank session, then stop watching.
   * The workspace resolver either creates a session or reuses a blank one, so
   * a blank current session is the one the start produced; the non-blank
   * session being left behind is not a target.
   * @param stop - disposer for the list subscription.
   */
  private async applyStaged(stop: () => void): Promise<void> {
    const staged = this.staged
    if (staged === undefined) {
      stop()
      return
    }
    const snapshot = this.ctx.sessions.list.getSnapshot()
    const session = snapshot.current === undefined ? undefined : snapshot.byId[snapshot.current]
    if (session === undefined || !session.blank) return
    // Detach before awaiting: composing and prompting both move the list.
    this.staged = undefined
    stop()
    if (staged.presetId !== undefined && session.projectionValues?.agentPreset !== staged.presetId) {
      await this.ctx.remote.agentPresets.select(session.id, staged.presetId)
    }
    void this.load()
    if (staged.brief !== undefined) await this.submitBrief(session.id, staged.brief)
  }

  /**
   * Submit one user message on a session this controller just started. The
   * brief is the session's first turn, so the model answers it directly.
   * @param id - the session to prompt.
   * @param brief - the task description to submit.
   */
  private async submitBrief(id: SessionId, brief: string): Promise<void> {
    const session = this.ctx.sessions.binding(id)?.session
    if (session === undefined) return
    const result = await session.prompt([{ type: 'text', text: brief }], 'queue')
    if (!result.ok) console.warn('workbench assignment failed:', result.error.message)
  }
}
