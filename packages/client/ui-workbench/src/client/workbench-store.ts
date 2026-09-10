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
 * frame (the sidebar nav toggles one) and the bounded credits ledger the report
 * page reads.
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
import type { WorkbenchCreditEntry } from '@deepseek-ai/dsh-workbench/types'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

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
}

/** Workbench dashboard snapshot. */
export interface WorkbenchState {
  /** Read lifecycle: `unavailable` means the deployment composes no presets. */
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
  /** The roster read failure message, cleared on the next successful load. */
  error: string | null
  /** Team members in roster order, broken presets last. */
  members: readonly TeamMember[]
  /** Count of members online (healthy, idle). */
  online: number
  /** Count of members busy (a live session runs their preset). */
  busy: number
  /** Count of members offline (broken presets). */
  offline: number
  /** Persisted credits balance, or null when the host composes no workbench service. */
  credits: number | null
}

const INITIAL: WorkbenchState = {
  status: 'idle',
  error: null,
  members: [],
  online: 0,
  busy: 0,
  offline: 0,
  credits: null,
}

/** A workbench page the sidebar surfaces as a frame-wide overlay. */
export type WorkbenchPageId = 'hall' | 'assistant' | 'team' | 'report'

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
 * Read the credits balance from the host workbench Remote. The read is
 * decorative for the dashboard, so a deployment without the service (or a
 * failed read) answers null instead of failing the whole dashboard load.
 * @param ctx - the browser plugin context carrying the Remote namespaces.
 * @returns the balance, or null when unavailable.
 */
async function readCredits(ctx: ClientContext): Promise<number | null> {
  const result = await ctx.remote.workbench.snapshot()
  if (result.ok) return result.value.credits.balance
  return null
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

  /** Preset and brief staged for the blank session the next start creates. */
  private staged: StagedStart | undefined

  /**
   * @param ctx - the browser plugin context (roster read, sessions, navigation).
   */
  constructor(private readonly ctx: ClientContext) {}

  private set(patch: Partial<WorkbenchState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /**
   * Load the roster and derive the team states. An empty roster is a valid
   * deployment (the Host composition only), reported as `unavailable`.
   */
  async load(): Promise<void> {
    if (this.store.getSnapshot().status === 'loading') return
    this.set({ status: 'loading', error: null })
    const [roster, credits] = await Promise.all([readRoster(this.ctx), readCredits(this.ctx)])
    if (!roster.ok) {
      this.set({ status: 'error', error: roster.error })
      return
    }
    const presets = roster.value.presets
    if (presets.length === 0) {
      this.set({ status: 'unavailable', members: [], online: 0, busy: 0, offline: 0, credits })
      return
    }
    const busy = busyPresetIds(this.ctx)
    const members: TeamMember[] = presets.map((preset) => {
      const state: TeamMemberState = preset.broken !== undefined
        ? 'offline'
        : busy.has(preset.id) ? 'busy' : 'online'
      return {
        id: preset.id,
        name: preset.name ?? preset.id,
        description: preset.description ?? '',
        state,
      }
    })
    // Healthy members first, broken (offline) ones sink to the end.
    members.sort((left, right) =>
      left.state === 'offline' && right.state !== 'offline' ? 1
        : right.state === 'offline' && left.state !== 'offline' ? -1
          : 0)
    this.set({
      status: 'ready',
      error: null,
      members,
      credits,
      online: members.filter(member => member.state === 'online').length,
      busy: members.filter(member => member.state === 'busy').length,
      offline: members.filter(member => member.state === 'offline').length,
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
