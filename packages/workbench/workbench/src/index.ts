/**
 * Host workbench capability: the persisted credits ledger and the aggregated
 * team-status read, exposed as the `workbench` Typert Remote namespace.
 *
 * Credits live in the `workbench` storage domain (a json backend in the
 * shipped composition): one global balance plus an append-only per-record
 * ledger. Team status folds the agent-preset roster against live sessions
 * exactly like the browser dashboard — a member is busy while a non-blank
 * live session projects its preset, offline when discovery reports the
 * preset broken — so every workbench surface reads one host answer instead
 * of re-deriving the join.
 * @module @deepseek-ai/dsh-workbench
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Domain, DomainGlobal, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { AgentPreset } from '@deepseek-ai/dsh-agent-presets'
// Type-only: resolves the `agentPresets` Context service and the
// `agentPreset` projection key this aggregation reads.
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-agent-presets/types'
// Type-only: resolves the `sessions` Context service.
import type {} from '@deepseek-ai/dsh-session'
// Type-only: resolves the `sessionProjections` Context service.
import type {} from '@deepseek-ai/dsh-session-projection'
// Type-only: resolves the `turnBoundary` projection key.
import type {} from '@deepseek-ai/dsh-agent'
import { MAX_REASON_LENGTH, workbenchDomainSpec, type CreditEntryRecord, type CreditsState } from './spec.ts'
import type {
  WorkbenchCreditEntry,
  WorkbenchCreditGrant,
  WorkbenchLedger,
  WorkbenchMember,
  WorkbenchMemberStatus,
  WorkbenchSnapshot,
} from './types.ts'

export { workbenchDomainSpec, MAX_REASON_LENGTH } from './spec.ts'
export type { CreditEntryRecord, CreditsState } from './spec.ts'
export type {
  WorkbenchCredits, WorkbenchCreditEntry, WorkbenchCreditGrant, WorkbenchLedger,
  WorkbenchMember, WorkbenchMemberStatus, WorkbenchSnapshot, WorkbenchTeam,
} from './types.ts'

/** Largest ledger page one read returns; a wire-boundary constant, not a tunable. */
export const LEDGER_READ_LIMIT = 50

declare module '@deepseek-ai/cordis' {
  interface Context {
    workbench: Workbench
  }
}

/** The user-writable plugin config. */
export interface Config {
  /** Balance a fresh medium serves before the first grant. */
  startingBalance: number
  /** Largest amount one grant may carry. */
  maxGrant: number
}

/** Runtime schema for the plugin config. */
export const Config: z<Config> = z.object({
  startingBalance: z.natural().default(0),
  maxGrant: z.natural().min(1).default(100_000),
})

/**
 * The workbench Remote service: credits storage plus roster aggregation.
 */
export class Workbench extends TypertRemoteService {
  static inject = ['storageDomain', 'agentPresets', 'sessions', 'sessionProjections']

  static Config = Config

  /** Opened domain handle; assigned in init and held for close. */
  private domain: Domain<ReturnType<typeof workbenchDomainSpec>> | undefined
  /** Authoritative credits global. */
  private creditsStore: DomainGlobal<CreditsState> | undefined
  /** Append-only grant ledger. */
  private ledger: KvTable<string, CreditEntryRecord> | undefined

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'workbench')
  }

  /** Open the workbench domain and bind its close to the service fiber. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(workbenchDomainSpec(this.config.startingBalance))
    this.domain = domain
    this.ctx.effect(() => () => void this.closeDomain(), 'workbench.domainClose')
    this.creditsStore = domain.global
    this.ledger = domain.table('entries')
  }

  /** Close the opened domain once, swallowing the fiber's idempotent repeat. */
  private async closeDomain(): Promise<void> {
    const domain = this.domain
    this.domain = undefined
    this.creditsStore = undefined
    this.ledger = undefined
    if (domain !== undefined) await domain.close()
  }

  /**
   * The Remote read: current credits balance beside the aggregated team.
   * @returns one snapshot over both halves.
   */
  @Remote('snapshot')
  async remoteSnapshot(): Promise<WorkbenchSnapshot> {
    return {
      credits: { balance: this.requireCredits().get().balance },
      team: await this.team(),
    }
  }

  /**
   * Grant points: append one ledger entry, then replace the balance global.
   * Both writes queue on the domain's single chain, so concurrent grants
   * never interleave or lose an increment.
   * @param amount - positive integer points, at most `config.maxGrant`.
   * @param reason - non-empty trimmed reason, at most {@link MAX_REASON_LENGTH} characters.
   * @returns the new balance beside the appended entry.
   * @throws RemoteError `gateway/bad-request` when the amount or reason is invalid.
   */
  @Remote('addCredits')
  async addCredits(amount: number, reason: string): Promise<WorkbenchCreditGrant> {
    if (!Number.isInteger(amount) || amount <= 0 || amount > this.config.maxGrant) {
      throw new RemoteError(
        'gateway/bad-request',
        `workbench: amount must be an integer between 1 and ${this.config.maxGrant}`,
        {},
      )
    }
    const trimmed = reason.trim()
    if (trimmed.length === 0 || trimmed.length > MAX_REASON_LENGTH) {
      throw new RemoteError(
        'gateway/bad-request',
        `workbench: reason must be 1-${MAX_REASON_LENGTH} non-whitespace characters`,
        {},
      )
    }
    const id = randomUUID()
    const record: CreditEntryRecord = { amount, reason: trimmed, at: Date.now() }
    await this.requireLedger().put(id, record)
    const balance = this.requireCredits().get().balance + amount
    await this.requireCredits().set({ balance })
    return { balance, entry: { id, ...record } }
  }

  /**
   * The Remote ledger read: the most recent grants, newest first. The page is
   * bounded because the ledger is append-only — a long-lived deployment
   * accumulates one row per grant.
   * @returns the recent entries, at most {@link LEDGER_READ_LIMIT}.
   */
  @Remote('ledger')
  remoteLedger(): Promise<WorkbenchLedger> {
    const entries: WorkbenchCreditEntry[] = []
    for (const [id, record] of this.requireLedger().entries()) entries.push({ id, ...record })
    // Stable sort: grants sharing a millisecond keep the store's own order.
    entries.sort((left, right) => right.at - left.at)
    return Promise.resolve({ entries: entries.slice(0, LEDGER_READ_LIMIT) })
  }

  /**
   * Fold the roster against live sessions into team status rows.
   * @returns counts and members, broken presets sorted last.
   */
  private async team(): Promise<WorkbenchSnapshot['team']> {
    const presets = await this.ctx.agentPresets.list()
    const busy = this.busyPresetIds()
    const statusOf = (preset: AgentPreset): WorkbenchMemberStatus => {
      if (preset.broken !== undefined) return 'offline'
      return busy.has(preset.id) ? 'busy' : 'online'
    }
    const members: WorkbenchMember[] = presets.map(preset => ({
      id: preset.id,
      ...preset.name === undefined ? {} : { name: preset.name },
      ...preset.description === undefined ? {} : { description: preset.description },
      status: statusOf(preset),
    }))
    members.sort((a, b) => Number(a.status === 'offline') - Number(b.status === 'offline'))
    const busyCount = members.filter(member => member.status === 'busy').length
    const offlineCount = members.filter(member => member.status === 'offline').length
    return {
      online: members.length - offlineCount,
      busy: busyCount,
      offline: offlineCount,
      members,
    }
  }

  /**
   * Preset ids with a live non-blank session running them. The blank check
   * mirrors agent-presets' select lock: a session with no started turn does
   * not count as work, even after a preset is staged onto it.
   * @returns the busy preset id set.
   */
  private busyPresetIds(): Set<string> {
    const ids = new Set<string>()
    for (const session of this.ctx.sessions.list()) {
      const preset = this.ctx.sessionProjections.stateOf(session, 'agentPreset')
      if (!preset) continue
      const boundary = this.ctx.sessionProjections.stateOf(session, 'turnBoundary')
      const started = boundary !== undefined
        && (boundary.openTurnStartSeq !== null || boundary.lastTurn > 0)
      if (started) ids.add(preset)
    }
    return ids
  }

  /** The credits global, or throw when the service is not initialized. */
  private requireCredits(): DomainGlobal<CreditsState> {
    if (this.creditsStore === undefined) {
      throw new Error('workbench: service used before its domain finished opening')
    }
    return this.creditsStore
  }

  /** The ledger table, or throw when the service is not initialized. */
  private requireLedger(): KvTable<string, CreditEntryRecord> {
    if (this.ledger === undefined) {
      throw new Error('workbench: service used before its domain finished opening')
    }
    return this.ledger
  }
}

export default Workbench
