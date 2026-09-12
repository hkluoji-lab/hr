/**
 * Host workbench capability: the persisted credits ledger, the
 * secretary-company client master, statutory-filing obligation ledger, and
 * signature-delivery ledger with the current-year filing schedule, the
 * follow-up center folding both reminder ladders into one actionable queue
 * (S-FOLLOW-01), and the aggregated team-status read, all
 * exposed as the `workbench` Typert Remote namespace.
 *
 * Credits live in the `workbench` storage domain (a json backend in the
 * shipped composition): one global balance plus an append-only per-record
 * ledger. Client master rows (S-CORE-01), filing obligations
 * (S-COMPL-01), and signature deliveries (S-DELIV-01) share the same
 * per-record domain; the obligation, schedule, and delivery reads derive each
 * row's reminder or follow-up tier from today's date so every workbench
 * surface reads one host answer instead of re-deriving the join. The
 * follow-up center folds the open rows that have entered a chase rung into
 * one queue with a drafted message per row, and every logged chase appends a
 * reminder row so the queue shows what has already been done. Team status
 * folds the agent-preset roster against live sessions exactly like the
 * browser dashboard — a member is busy while a non-blank live session
 * projects its preset, offline when discovery reports the preset broken.
 * @module @deepseek-ai/dsh-workbench
 */

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
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
import {
  COMPLIANCE_STATUSES, DATE_PATTERN, DELIVERY_CHANNELS, MAX_CLIENT_FIELD_LENGTH, MAX_DELIVERY_TITLE_LENGTH,
  MAX_PERIOD_LENGTH, MAX_REASON_LENGTH, MAX_REMINDER_MESSAGE_LENGTH, OBLIGATION_KINDS, workbenchDomainSpec,
  type ClientRecord, type CreditEntryRecord, type CreditsState, type DeliveryRecord, type ObligationRecord,
  type ReminderRecord,
} from './spec.ts'
import type {
  WorkbenchClient, WorkbenchClientCreate, WorkbenchClientCreated, WorkbenchClientList,
  WorkbenchCreditEntry, WorkbenchCreditGrant, WorkbenchDelivery, WorkbenchDeliveryChannel, WorkbenchDeliveryCreate,
  WorkbenchDeliveryList, WorkbenchDeliveryStatus, WorkbenchDueTier, WorkbenchFollowUp, WorkbenchFollowUpCreate,
  WorkbenchFollowUpList, WorkbenchFollowUpTargetKind, WorkbenchLedger,
  WorkbenchMember, WorkbenchMemberStatus, WorkbenchObligation, WorkbenchObligationCreate,
  WorkbenchObligationList, WorkbenchObligationStatus, WorkbenchReminderLogged,
  WorkbenchReminderTier, WorkbenchSchedule, WorkbenchScheduleRow,
  WorkbenchSnapshot,
} from './types.ts'

export { workbenchDomainSpec, MAX_REASON_LENGTH } from './spec.ts'
export type { CreditEntryRecord, CreditsState, DeliveryRecord, ReminderRecord } from './spec.ts'
export type {
  WorkbenchClient, WorkbenchClientCreate, WorkbenchClientCreated, WorkbenchClientList,
  WorkbenchComplianceStatus, WorkbenchCredits, WorkbenchCreditEntry, WorkbenchCreditGrant,
  WorkbenchDelivery, WorkbenchDeliveryChannel, WorkbenchDeliveryCreate, WorkbenchDeliveryList,
  WorkbenchDeliveryStatus, WorkbenchDueTier, WorkbenchFollowUp, WorkbenchFollowUpCreate,
  WorkbenchFollowUpList, WorkbenchFollowUpTargetKind, WorkbenchFollowUpTier, WorkbenchLedger,
  WorkbenchMember, WorkbenchMemberStatus,
  WorkbenchObligation, WorkbenchObligationCreate, WorkbenchObligationKind,
  WorkbenchObligationList, WorkbenchObligationStatus, WorkbenchReminder, WorkbenchReminderLogged,
  WorkbenchReminderTier, WorkbenchSchedule, WorkbenchScheduleRow,
  WorkbenchSnapshot, WorkbenchTeam, WorkbenchUser,
} from './types.ts'

/** Largest ledger page one read returns; a wire-boundary constant, not a tunable. */
export const LEDGER_READ_LIMIT = 50

/**
 * Annual-return filing window in days: the NAR1 is due within 42 days after
 * the incorporation anniversary (Hong Kong Companies Ordinance s.662), a
 * fixed statutory deadline the schedule projection reads.
 */
export const NAR1_FILING_WINDOW_DAYS = 42

/**
 * Signature-delivery follow-up ladder in days since the send (stage-1 SOP
 * S-DELIV-01): a nudge from T+3 while not yet viewed, a chase from T+7 while
 * not yet signed, and the secretary takes over from T+14. Fixed SOP
 * thresholds, not tunables.
 */
export const DELIVERY_NUDGE_DAYS = 3
/** First day the T+7 chase tier covers. */
export const DELIVERY_CHASE_DAYS = 7
/** First day the T+14 escalation tier covers. */
export const DELIVERY_ESCALATE_DAYS = 14

/**
 * Channel the stage-1 SOP suggests per reminder rung (S-FOLLOW-01): the T+3
 * nudge rides WhatsApp (港人偏好), the T+7 chase adds WeChat, an escalation
 * lands as formal email, early filing reminders go by email, the last-week
 * rungs ride WhatsApp, and an overdue notice goes back to formal email.
 * Fixed SOP mapping, not tunables.
 */
export const REMINDER_SUGGESTED_CHANNELS: Record<WorkbenchReminderTier, WorkbenchDeliveryChannel> = {
  nudge: 'whatsapp',
  chase: 'wechat',
  escalate: 'email',
  d30: 'email',
  d15: 'email',
  d7: 'whatsapp',
  d1: 'whatsapp',
  overdue: 'email',
}

/**
 * Sort rank per reminder rung, most urgent first: an overdue filing outranks
 * an escalation, the final filing reminders outrank a chase, and the early
 * filing rungs trail the nudge. Fixed presentation order, not tunables.
 */
export const REMINDER_SEVERITY_RANKS: Record<WorkbenchReminderTier, number> = {
  overdue: 0,
  escalate: 1,
  d1: 2,
  chase: 3,
  d7: 4,
  d15: 5,
  nudge: 6,
  d30: 7,
}

/** Milliseconds in one UTC day; the date arithmetic every deadline read uses. */
const MILLIS_PER_DAY = 86_400_000

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
  /** Client master rows (S-CORE-01). */
  private clientsStore: KvTable<string, ClientRecord> | undefined
  /** Statutory-filing obligation rows (S-COMPL-01). */
  private obligationsStore: KvTable<string, ObligationRecord> | undefined
  /** Signature-delivery rows (S-DELIV-01). */
  private deliveriesStore: KvTable<string, DeliveryRecord> | undefined
  /** Follow-up reminder rows (S-FOLLOW-01). */
  private remindersStore: KvTable<string, ReminderRecord> | undefined
  /** The host account's display name, resolved once at init; absent when the platform cannot report one. */
  private userName: string | undefined

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
    this.clientsStore = domain.table('clients')
    this.obligationsStore = domain.table('obligations')
    this.deliveriesStore = domain.table('deliveries')
    this.remindersStore = domain.table('reminders')
    this.userName = this.resolveUserName()
  }

  /** Close the opened domain once, swallowing the fiber's idempotent repeat. */
  private async closeDomain(): Promise<void> {
    const domain = this.domain
    this.domain = undefined
    this.creditsStore = undefined
    this.ledger = undefined
    this.clientsStore = undefined
    this.obligationsStore = undefined
    this.deliveriesStore = undefined
    this.remindersStore = undefined
    if (domain !== undefined) await domain.close()
  }

  /**
   * The Remote read: current credits balance beside the aggregated team.
   * @returns one snapshot over both halves.
   */
  @Remote('snapshot')
  async remoteSnapshot(): Promise<WorkbenchSnapshot> {
    const userName = this.greetingName()
    return {
      credits: { balance: this.requireCredits().get().balance },
      team: await this.team(),
      ...userName === undefined ? {} : { user: { name: userName } },
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
   * The Remote client-master read: every stored client row with its open
   * obligation and open-delivery counts, creation order preserved.
   * @returns the full client list.
   */
  @Remote('clients')
  remoteClients(): Promise<WorkbenchClientList> {
    const openByClient = new Map<string, number>()
    for (const [, obligation] of this.requireObligations().entries()) {
      if (obligation.status !== 'open') continue
      openByClient.set(obligation.clientId, (openByClient.get(obligation.clientId) ?? 0) + 1)
    }
    const openDeliveriesByClient = new Map<string, number>()
    for (const [, delivery] of this.requireDeliveries().entries()) {
      if (delivery.status === 'signed' || delivery.status === 'returned') continue
      openDeliveriesByClient.set(delivery.clientId, (openDeliveriesByClient.get(delivery.clientId) ?? 0) + 1)
    }
    const clients: WorkbenchClient[] = []
    for (const [id, record] of this.requireClients().entries()) {
      clients.push(clientRowOf(id, record, openByClient.get(id) ?? 0, openDeliveriesByClient.get(id) ?? 0))
    }
    clients.sort((left, right) => left.createdAt - right.createdAt)
    return Promise.resolve({ clients })
  }

  /**
   * Create one client master row. The id is `C-<year>-<serial>` with the
   * serial advancing past every id already stored for that year; the write
   * queues on the domain's single chain.
   * @param payload - the creation request; required fields validated at the
   *   wire boundary, optional fields stored when non-empty.
   * @returns the stored row as the client reads it.
   * @throws RemoteError `gateway/bad-request` when a field is invalid.
   */
  @Remote('addClient')
  async addClient(payload: WorkbenchClientCreate): Promise<WorkbenchClientCreated> {
    const record = clientRecordOf(payload)
    const table = this.requireClients()
    const prefix = `C-${new Date().getUTCFullYear()}-`
    let serial = 0
    for (const id of table.keys()) {
      if (!id.startsWith(prefix)) continue
      const tail = Number(id.slice(prefix.length))
      if (Number.isInteger(tail) && tail > serial) serial = tail
    }
    const id = `${prefix}${String(serial + 1).padStart(4, '0')}`
    await table.put(id, record)
    return { client: clientRowOf(id, record, 0, 0) }
  }

  /**
   * Remove one client master row and every obligation and delivery recorded
   * for it.
   * @param id - the client id to remove.
   * @throws RemoteError `workbench/client-not-found` when no row carries that id.
   */
  @Remote('removeClient')
  async removeClient(id: string): Promise<void> {
    const table = this.requireClients()
    if (table.get(id) === undefined) {
      throw new RemoteError('workbench/client-not-found', `workbench: no client '${id}'`, { clientId: id })
    }
    await table.delete(id)
    for (const [obligationId, record] of this.requireObligations().entries()) {
      if (record.clientId === id) await this.requireObligations().delete(obligationId)
    }
    for (const [deliveryId, record] of this.requireDeliveries().entries()) {
      if (record.clientId === id) await this.requireDeliveries().delete(deliveryId)
    }
  }

  /**
   * The Remote obligation-ledger read: every stored row joined with its
   * client's name, open rows first, each group soonest due first, with the
   * reminder tier derived from today's UTC date.
   * @returns the full obligation list.
   */
  @Remote('obligations')
  remoteObligations(): Promise<WorkbenchObligationList> {
    const names = new Map<string, string>()
    for (const [id, record] of this.requireClients().entries()) names.set(id, record.nameCn)
    const obligations: WorkbenchObligation[] = []
    for (const [id, record] of this.requireObligations().entries()) {
      obligations.push(obligationRowOf(id, record, names.get(record.clientId) ?? record.clientId))
    }
    obligations.sort((left, right) => {
      if (left.status !== right.status) return left.status === 'open' ? -1 : 1
      return left.dueDate.localeCompare(right.dueDate) || left.createdAt - right.createdAt
    })
    return Promise.resolve({ obligations })
  }

  /**
   * Record one filing obligation against a stored client.
   * @param payload - the recording request; the client must exist.
   * @returns the stored row as the client reads it.
   * @throws RemoteError `gateway/bad-request` when a field is invalid, or
   *   `workbench/client-not-found` when the client id is unknown.
   */
  @Remote('addObligation')
  async addObligation(payload: WorkbenchObligationCreate): Promise<{ obligation: WorkbenchObligation }> {
    if (this.requireClients().get(payload.clientId) === undefined) {
      throw new RemoteError('workbench/client-not-found', `workbench: no client '${payload.clientId}'`, { clientId: payload.clientId })
    }
    const record = obligationRecordOf(payload)
    const id = randomUUID()
    await this.requireObligations().put(id, record)
    const name = this.requireClients().get(payload.clientId)?.nameCn ?? payload.clientId
    return { obligation: obligationRowOf(id, record, name) }
  }

  /**
   * Move one obligation between `open` and `submitted` — the SOP's
   * client-submitted closing step. The wire codec validates `status`
   * against the lifecycle union before the method runs.
   * @param id - the obligation id.
   * @param status - the lifecycle state to set.
   * @throws RemoteError `workbench/obligation-not-found` when the id is unknown.
   */
  @Remote('markObligation')
  async markObligation(id: string, status: WorkbenchObligationStatus): Promise<void> {
    const table = this.requireObligations()
    const record = table.get(id)
    if (record === undefined) {
      throw new RemoteError('workbench/obligation-not-found', `workbench: no obligation '${id}'`, { obligationId: id })
    }
    await table.put(id, { ...record, status })
  }

  /**
   * Remove one obligation row.
   * @param id - the obligation id.
   * @throws RemoteError `workbench/obligation-not-found` when the id is unknown.
   */
  @Remote('removeObligation')
  async removeObligation(id: string): Promise<void> {
    const table = this.requireObligations()
    if (table.get(id) === undefined) {
      throw new RemoteError('workbench/obligation-not-found', `workbench: no obligation '${id}'`, { obligationId: id })
    }
    await table.delete(id)
  }

  /**
   * The Remote delivery-ledger read (S-DELIV-01): every stored row joined
   * with its client's name, open rows first (longest waiting first) so the
   * page reads as the follow-up queue, each row's follow-up tier derived from
   * today's UTC date.
   * @returns the full delivery list.
   */
  @Remote('deliveries')
  remoteDeliveries(): Promise<WorkbenchDeliveryList> {
    const names = new Map<string, string>()
    for (const [id, record] of this.requireClients().entries()) names.set(id, record.nameCn)
    const deliveries: WorkbenchDelivery[] = []
    for (const [id, record] of this.requireDeliveries().entries()) {
      deliveries.push(deliveryRowOf(id, record, names.get(record.clientId) ?? record.clientId))
    }
    deliveries.sort((left, right) => {
      if (left.status !== right.status) {
        const leftOpen = left.status === 'sent' || left.status === 'viewed'
        const rightOpen = right.status === 'sent' || right.status === 'viewed'
        if (leftOpen !== rightOpen) return leftOpen ? -1 : 1
      }
      return left.createdAt - right.createdAt
    })
    return Promise.resolve({ deliveries })
  }

  /**
   * Record one signature delivery against a stored client; the row opens in
   * `sent`, sent now, so the follow-up ladder starts measuring immediately.
   * @param payload - the recording request; the client must exist.
   * @returns the stored row as the client reads it.
   * @throws RemoteError `gateway/bad-request` when a field is invalid, or
   *   `workbench/client-not-found` when the client id is unknown.
   */
  @Remote('addDelivery')
  async addDelivery(payload: WorkbenchDeliveryCreate): Promise<{ delivery: WorkbenchDelivery }> {
    if (this.requireClients().get(payload.clientId) === undefined) {
      throw new RemoteError('workbench/client-not-found', `workbench: no client '${payload.clientId}'`, { clientId: payload.clientId })
    }
    const record = deliveryRecordOf(payload)
    const id = randomUUID()
    await this.requireDeliveries().put(id, record)
    const name = this.requireClients().get(payload.clientId)?.nameCn ?? payload.clientId
    return { delivery: deliveryRowOf(id, record, name) }
  }

  /**
   * Move one delivery along its lifecycle (`sent` → `viewed` → `signed` →
   * `returned`) — the SOP's view, sign, and returned-archive steps. The wire
   * codec validates `status` against the lifecycle union before the method
   * runs.
   * @param id - the delivery id.
   * @param status - the lifecycle state to set.
   * @throws RemoteError `workbench/delivery-not-found` when the id is unknown.
   */
  @Remote('markDelivery')
  async markDelivery(id: string, status: WorkbenchDeliveryStatus): Promise<void> {
    const table = this.requireDeliveries()
    const record = table.get(id)
    if (record === undefined) {
      throw new RemoteError('workbench/delivery-not-found', `workbench: no delivery '${id}'`, { deliveryId: id })
    }
    await table.put(id, { ...record, status })
  }

  /**
   * Remove one delivery row.
   * @param id - the delivery id.
   * @throws RemoteError `workbench/delivery-not-found` when the id is unknown.
   */
  @Remote('removeDelivery')
  async removeDelivery(id: string): Promise<void> {
    const table = this.requireDeliveries()
    if (table.get(id) === undefined) {
      throw new RemoteError('workbench/delivery-not-found', `workbench: no delivery '${id}'`, { deliveryId: id })
    }
    await table.delete(id)
  }

  /**
   * The Remote follow-up-center read (S-FOLLOW-01): every open delivery that
   * has entered a chase rung (T+3/T+7/T+14) and every open obligation sitting
   * in a reminder rung (d30/d15/d7/d1/overdue), folded into one queue with the
   * rung's suggested channel, the host-drafted message, and how many
   * reminders have already been logged. Rows sort most urgent rung first, so
   * the page reads as today's chase list.
   * @returns the actionable rows, most urgent first.
   */
  @Remote('followUps')
  remoteFollowUps(): Promise<WorkbenchFollowUpList> {
    const today = new Date()
    const names = new Map<string, string>()
    for (const [id, record] of this.requireClients().entries()) names.set(id, record.nameCn)

    const counts = new Map<string, { count: number; lastAt: number }>()
    for (const [, record] of this.requireReminders().entries()) {
      const key = `${record.targetKind}:${record.targetId}`
      const seen = counts.get(key)
      counts.set(key, { count: (seen?.count ?? 0) + 1, lastAt: Math.max(seen?.lastAt ?? 0, record.createdAt) })
    }

    const followUps: WorkbenchFollowUp[] = []
    for (const [id, record] of this.requireDeliveries().entries()) {
      const meta = followUpMetaOf(record.createdAt, today)
      if (record.status === 'signed' || record.status === 'returned') continue
      if (meta.followUpTier === 'fresh') continue
      const clientNameCn = names.get(record.clientId) ?? record.clientId
      followUps.push(followUpRowOf('delivery', id, record.clientId, clientNameCn, record.title, meta.followUpTier, meta.daysSinceSent, undefined, counts.get(`delivery:${id}`)))
    }
    for (const [id, record] of this.requireObligations().entries()) {
      if (record.status !== 'open') continue
      const meta = dueMetaOf(record.dueDate, today)
      if (meta.dueTier === 'ok') continue
      const clientNameCn = names.get(record.clientId) ?? record.clientId
      followUps.push(followUpRowOf('obligation', id, record.clientId, clientNameCn, `${record.kind} ${record.periodLabel}`, meta.dueTier, meta.daysUntilDue, record.dueDate, counts.get(`obligation:${id}`)))
    }
    followUps.sort((left, right) =>
      REMINDER_SEVERITY_RANKS[left.tier] - REMINDER_SEVERITY_RANKS[right.tier]
      || left.clientNameCn.localeCompare(right.clientNameCn)
      || left.title.localeCompare(right.title))
    return Promise.resolve({ followUps })
  }

  /**
   * Log one follow-up reminder against an open target (S-FOLLOW-01): the
   * ladder rung is re-derived from today's date so the record stays truthful,
   * the channel defaults to the rung's suggestion, and the message defaults to
   * the host's draft — both accept the secretary's override. The write queues
   * on the domain's single chain.
   * @param payload - the logging request; the target must exist and be open.
   * @returns the stored reminder row.
   * @throws RemoteError `gateway/bad-request` when a field is invalid,
   *   `workbench/delivery-not-found` or `workbench/obligation-not-found` when
   *   the target id is unknown, or `workbench/follow-up-not-open` when the
   *   target has already closed.
   */
  @Remote('recordFollowUp')
  async recordFollowUp(payload: WorkbenchFollowUpCreate): Promise<WorkbenchReminderLogged> {
    const today = new Date()
    let tier: WorkbenchReminderTier
    let suggestedChannel: WorkbenchDeliveryChannel
    let draft: string
    if (payload.targetKind === 'delivery') {
      const record = this.requireDeliveries().get(payload.targetId)
      if (record === undefined) {
        throw new RemoteError('workbench/delivery-not-found', `workbench: no delivery '${payload.targetId}'`, { deliveryId: payload.targetId })
      }
      if (record.status === 'signed' || record.status === 'returned') {
        throw new RemoteError('workbench/follow-up-not-open', `workbench: delivery '${payload.targetId}' has closed`, { targetKind: 'delivery', targetId: payload.targetId })
      }
      const meta = followUpMetaOf(record.createdAt, today)
      if (meta.followUpTier === 'fresh') {
        throw new RemoteError('gateway/bad-request', 'workbench: delivery has not entered the follow-up ladder yet', {})
      }
      tier = meta.followUpTier
      const clientNameCn = this.requireClients().get(record.clientId)?.nameCn ?? record.clientId
      suggestedChannel = REMINDER_SUGGESTED_CHANNELS[tier]
      draft = reminderMessageOf(tier, { client: clientNameCn, title: record.title, days: meta.daysSinceSent })
    } else {
      const record = this.requireObligations().get(payload.targetId)
      if (record === undefined) {
        throw new RemoteError('workbench/obligation-not-found', `workbench: no obligation '${payload.targetId}'`, { obligationId: payload.targetId })
      }
      if (record.status !== 'open') {
        throw new RemoteError('workbench/follow-up-not-open', `workbench: obligation '${payload.targetId}' has closed`, { targetKind: 'obligation', targetId: payload.targetId })
      }
      const meta = dueMetaOf(record.dueDate, today)
      if (meta.dueTier === 'ok') {
        throw new RemoteError('gateway/bad-request', 'workbench: obligation has not entered the reminder ladder yet', {})
      }
      tier = meta.dueTier
      const clientNameCn = this.requireClients().get(record.clientId)?.nameCn ?? record.clientId
      suggestedChannel = REMINDER_SUGGESTED_CHANNELS[tier]
      draft = reminderMessageOf(tier, {
        client: clientNameCn, title: `${record.kind} ${record.periodLabel}`, days: meta.daysUntilDue, due: record.dueDate,
      })
    }
    const channel = payload.channel ?? suggestedChannel
    if (!(DELIVERY_CHANNELS as readonly string[]).includes(channel)) {
      throw new RemoteError('gateway/bad-request', `workbench: channel must be one of ${DELIVERY_CHANNELS.join('/')}`, {})
    }
    const message = payload.message === undefined ? draft : requiredFieldOf(payload.message, 'message', MAX_REMINDER_MESSAGE_LENGTH)
    const record: ReminderRecord = {
      targetKind: payload.targetKind,
      targetId: payload.targetId,
      tier,
      channel,
      message,
      createdAt: Date.now(),
    }
    const id = randomUUID()
    await this.requireReminders().put(id, record)
    return { reminder: { id, ...record } }
  }

  /**
   * The Remote schedule read: the current year's statutory-filing outlook.
   * Stored obligations due in the year are authoritative; every client whose
   * incorporation anniversary falls in the year also gets a projected NAR1 row
   * due {@link NAR1_FILING_WINDOW_DAYS} days after the anniversary, unless an
   * NAR1 obligation for the year is already recorded. Rows sort soonest due
   * first, so the page reads as the year's filing calendar.
   * @returns the schedule year beside its rows.
   */
  @Remote('complianceSchedule')
  remoteComplianceSchedule(): Promise<WorkbenchSchedule> {
    const today = new Date()
    const year = String(today.getUTCFullYear())
    const yearPrefix = `${year}-`
    const clients = new Map<string, ClientRecord>()
    for (const [id, record] of this.requireClients().entries()) clients.set(id, record)

    const rows: WorkbenchScheduleRow[] = []
    const nar1Recorded = new Set<string>()
    for (const [, obligation] of this.requireObligations().entries()) {
      if (obligation.kind === 'NAR1' && (obligation.dueDate.startsWith(yearPrefix) || obligation.periodLabel === year)) {
        nar1Recorded.add(obligation.clientId)
      }
      if (!obligation.dueDate.startsWith(yearPrefix)) continue
      const clientNameCn = clients.get(obligation.clientId)?.nameCn ?? obligation.clientId
      rows.push({
        clientId: obligation.clientId, clientNameCn, kind: obligation.kind, periodLabel: obligation.periodLabel,
        dueDate: obligation.dueDate, status: obligation.status, source: 'ledger', ...dueMetaOf(obligation.dueDate, today),
      })
    }
    for (const [id, record] of clients) {
      if (nar1Recorded.has(id)) continue
      const dueDate = nar1DueDateOf(record.incorporationDate, year)
      if (dueDate === undefined || !dueDate.startsWith(yearPrefix)) continue
      rows.push({
        clientId: id, clientNameCn: record.nameCn, kind: 'NAR1', periodLabel: year,
        dueDate, status: 'open', source: 'derived', ...dueMetaOf(dueDate, today),
      })
    }
    rows.sort((left, right) =>
      left.dueDate.localeCompare(right.dueDate)
      || left.clientNameCn.localeCompare(right.clientNameCn)
      || left.kind.localeCompare(right.kind))
    return Promise.resolve({ year, rows })
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

  /**
   * The greeting identity for this snapshot: the most recent web login's
   * display name when the optional `loginSession` extension has recorded one,
   * else the host machine account resolved at init. The web-login plugin is a
   * surface-level row this package does not depend on, so the read is a soft
   * service lookup at request time — logins after boot are still reflected.
   * @returns the display name, or undefined when neither source has one.
   */
  private greetingName(): string | undefined {
    const loginSession = Reflect.get(this.ctx, 'loginSession') as { displayName(): string | undefined } | undefined
    return loginSession?.displayName() ?? this.userName
  }

  /**
   * Resolve the host machine account's display name: `id -F` reports the full
   * name on macOS, and the short account name covers other platforms and any
   * failure of that optional extension. The greeting is decorative, so the
   * fallbacks stay silent.
   * @returns the display name, or undefined when even the account name is unavailable.
   */
  private resolveUserName(): string | undefined {
    try {
      const full = execFileSync('id', ['-F'], { encoding: 'utf8' }).trim()
      if (full.length > 0) return full
    } catch {
      // `id -F` is a macOS extension; other platforms keep the short account name.
    }
    try {
      return os.userInfo().username
    } catch {
      // os.userInfo needs an attached account; the client greets without a name.
      return undefined
    }
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

  /** The client-master table, or throw when the service is not initialized. */
  private requireClients(): KvTable<string, ClientRecord> {
    if (this.clientsStore === undefined) {
      throw new Error('workbench: service used before its domain finished opening')
    }
    return this.clientsStore
  }

  /** The obligation-ledger table, or throw when the service is not initialized. */
  private requireObligations(): KvTable<string, ObligationRecord> {
    if (this.obligationsStore === undefined) {
      throw new Error('workbench: service used before its domain finished opening')
    }
    return this.obligationsStore
  }

  /** The delivery-ledger table, or throw when the service is not initialized. */
  private requireDeliveries(): KvTable<string, DeliveryRecord> {
    if (this.deliveriesStore === undefined) {
      throw new Error('workbench: service used before its domain finished opening')
    }
    return this.deliveriesStore
  }

  /** The reminder table, or throw when the service is not initialized. */
  private requireReminders(): KvTable<string, ReminderRecord> {
    if (this.remindersStore === undefined) {
      throw new Error('workbench: service used before its domain finished opening')
    }
    return this.remindersStore
  }
}

/**
 * Whole days from today (UTC midnight) to the due date, and the reminder tier
 * that distance sits in: the stage-1 ladder flags at 30/15/7/1 days out,
 * `overdue` once past due, `ok` beyond every tier.
 */
function dueMetaOf(dueDate: string, today: Date): { daysUntilDue: number; dueTier: WorkbenchDueTier } {
  const due = Date.UTC(Number(dueDate.slice(0, 4)), Number(dueDate.slice(5, 7)) - 1, Number(dueDate.slice(8, 10)))
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const days = Math.round((due - now) / MILLIS_PER_DAY)
  const dueTier: WorkbenchDueTier = days < 0 ? 'overdue'
    : days <= 1 ? 'd1'
      : days <= 7 ? 'd7'
        : days <= 15 ? 'd15'
          : days <= 30 ? 'd30'
            : 'ok'
  return { daysUntilDue: days, dueTier }
}

/**
 * The NAR1 due date for one client in `year`: the incorporation anniversary
 * placed in `year`, advanced by {@link NAR1_FILING_WINDOW_DAYS}. A Feb 29
 * anniversary rolls to Mar 1 in a non-leap year, matching the calendar the
 * statutory deadline follows.
 * @returns the due date, or undefined when the stored date is malformed.
 */
function nar1DueDateOf(incorporationDate: string, year: string): string | undefined {
  if (!DATE_PATTERN.test(incorporationDate)) return undefined
  const anniversary = Date.UTC(Number(year), Number(incorporationDate.slice(5, 7)) - 1, Number(incorporationDate.slice(8, 10)))
  return isoDateOf(new Date(anniversary + NAR1_FILING_WINDOW_DAYS * MILLIS_PER_DAY))
}

/** The UTC calendar date as `YYYY-MM-DD`. */
function isoDateOf(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/**
 * Validate one required text field at the wire boundary: trimmed non-empty,
 * capped at `max`.
 */
function requiredFieldOf(value: string, field: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > max) {
    throw new RemoteError('gateway/bad-request', `workbench: ${field} must be 1-${max} non-whitespace characters`, {})
  }
  return trimmed
}

/**
 * Validate one optional text field at the wire boundary: trimmed, blank
 * dropped to absent, capped at {@link MAX_CLIENT_FIELD_LENGTH}.
 */
function optionalFieldOf(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length > MAX_CLIENT_FIELD_LENGTH) {
    throw new RemoteError('gateway/bad-request', `workbench: ${field} must be at most ${MAX_CLIENT_FIELD_LENGTH} characters`, {})
  }
  return trimmed
}

/**
 * Validate one client creation request and build the stored record. Optional
 * fields drop to absent when blank; the compliance state defaults to `green`.
 */
function clientRecordOf(payload: WorkbenchClientCreate): ClientRecord {
  const nameCn = requiredFieldOf(payload.nameCn, 'nameCn', MAX_CLIENT_FIELD_LENGTH)
  if (!DATE_PATTERN.test(payload.incorporationDate)) {
    throw new RemoteError('gateway/bad-request', 'workbench: incorporationDate must be a YYYY-MM-DD date', {})
  }
  const complianceStatus = payload.complianceStatus ?? 'green'
  if (!(COMPLIANCE_STATUSES as readonly string[]).includes(complianceStatus)) {
    throw new RemoteError('gateway/bad-request', `workbench: complianceStatus must be one of ${COMPLIANCE_STATUSES.join('/')}`, {})
  }
  const nameEn = optionalFieldOf(payload.nameEn, 'nameEn')
  const brNo = optionalFieldOf(payload.brNo, 'brNo')
  const crNo = optionalFieldOf(payload.crNo, 'crNo')
  const registeredAddress = optionalFieldOf(payload.registeredAddress, 'registeredAddress')
  const contactEmail = optionalFieldOf(payload.contactEmail, 'contactEmail')
  const contactWechat = optionalFieldOf(payload.contactWechat, 'contactWechat')
  const contactWhatsapp = optionalFieldOf(payload.contactWhatsapp, 'contactWhatsapp')
  return {
    nameCn,
    ...nameEn === undefined ? {} : { nameEn },
    ...brNo === undefined ? {} : { brNo },
    ...crNo === undefined ? {} : { crNo },
    ...registeredAddress === undefined ? {} : { registeredAddress },
    ...contactEmail === undefined ? {} : { contactEmail },
    ...contactWechat === undefined ? {} : { contactWechat },
    ...contactWhatsapp === undefined ? {} : { contactWhatsapp },
    incorporationDate: payload.incorporationDate,
    complianceStatus,
    createdAt: Date.now(),
  }
}

/** One client row as the client reads it, carrying its open-obligation and open-delivery counts. */
function clientRowOf(id: string, record: ClientRecord, openObligations: number, openDeliveries: number): WorkbenchClient {
  return {
    id,
    nameCn: record.nameCn,
    ...record.nameEn === undefined ? {} : { nameEn: record.nameEn },
    ...record.brNo === undefined ? {} : { brNo: record.brNo },
    ...record.crNo === undefined ? {} : { crNo: record.crNo },
    incorporationDate: record.incorporationDate,
    ...record.registeredAddress === undefined ? {} : { registeredAddress: record.registeredAddress },
    ...record.contactEmail === undefined ? {} : { contactEmail: record.contactEmail },
    ...record.contactWechat === undefined ? {} : { contactWechat: record.contactWechat },
    ...record.contactWhatsapp === undefined ? {} : { contactWhatsapp: record.contactWhatsapp },
    complianceStatus: record.complianceStatus,
    createdAt: record.createdAt,
    openObligations,
    openDeliveries,
  }
}

/**
 * Validate one obligation recording request and build the stored row: the
 * kind must be a tracked filing, the due date a calendar date, and the row
 * opens its lifecycle in `open`.
 */
function obligationRecordOf(payload: WorkbenchObligationCreate): ObligationRecord {
  if (!(OBLIGATION_KINDS as readonly string[]).includes(payload.kind)) {
    throw new RemoteError('gateway/bad-request', `workbench: kind must be one of ${OBLIGATION_KINDS.join('/')}`, {})
  }
  const clientId = requiredFieldOf(payload.clientId, 'clientId', MAX_CLIENT_FIELD_LENGTH)
  if (!DATE_PATTERN.test(payload.dueDate)) {
    throw new RemoteError('gateway/bad-request', 'workbench: dueDate must be a YYYY-MM-DD date', {})
  }
  return {
    clientId,
    kind: payload.kind,
    periodLabel: requiredFieldOf(payload.periodLabel, 'periodLabel', MAX_PERIOD_LENGTH),
    dueDate: payload.dueDate,
    status: 'open',
    createdAt: Date.now(),
  }
}

/** One obligation row as the client reads it, joined with the client's name and today's reminder tier. */
function obligationRowOf(id: string, record: ObligationRecord, clientNameCn: string, today: Date = new Date()): WorkbenchObligation {
  return { id, ...record, clientNameCn, ...dueMetaOf(record.dueDate, today) }
}

/**
 * Whole days from the send instant's UTC calendar date to today, and the
 * follow-up tier that distance sits in: the stage-1 S-DELIV-01 ladder nudges
 * from T+3, chases from T+7, and escalates from T+14. A same-day or
 * clock-skewed negative distance reads as `fresh`. The rungs are the date
 * ladder only; the closed `done` tier is `deliveryRowOf`'s projection of a
 * signed or returned status.
 */
function followUpMetaOf(createdAt: number, today: Date): { daysSinceSent: number; followUpTier: 'fresh' | 'nudge' | 'chase' | 'escalate' } {
  const sent = new Date(createdAt)
  const sentMidnight = Date.UTC(sent.getUTCFullYear(), sent.getUTCMonth(), sent.getUTCDate())
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const days = Math.round((now - sentMidnight) / MILLIS_PER_DAY)
  const followUpTier: 'fresh' | 'nudge' | 'chase' | 'escalate' = days < DELIVERY_NUDGE_DAYS ? 'fresh'
    : days < DELIVERY_CHASE_DAYS ? 'nudge'
      : days < DELIVERY_ESCALATE_DAYS ? 'chase'
        : 'escalate'
  return { daysSinceSent: days, followUpTier }
}

/**
 * Validate one delivery recording request and build the stored row: the title
 * must be present, the channel must be a known one (defaulting to `email`),
 * and the row opens its lifecycle in `sent`.
 */
function deliveryRecordOf(payload: WorkbenchDeliveryCreate): DeliveryRecord {
  const channel = payload.channel ?? 'email'
  if (!(DELIVERY_CHANNELS as readonly string[]).includes(channel)) {
    throw new RemoteError('gateway/bad-request', `workbench: channel must be one of ${DELIVERY_CHANNELS.join('/')}`, {})
  }
  return {
    clientId: requiredFieldOf(payload.clientId, 'clientId', MAX_CLIENT_FIELD_LENGTH),
    title: requiredFieldOf(payload.title, 'title', MAX_DELIVERY_TITLE_LENGTH),
    channel,
    status: 'sent',
    createdAt: Date.now(),
  }
}

/**
 * One delivery row as the client reads it, joined with the client's name and
 * today's follow-up tier; a closed row (`signed`/`returned`) reads as `done`.
 */
function deliveryRowOf(id: string, record: DeliveryRecord, clientNameCn: string, today: Date = new Date()): WorkbenchDelivery {
  const closed = record.status === 'signed' || record.status === 'returned'
  const meta = followUpMetaOf(record.createdAt, today)
  return {
    id,
    ...record,
    clientNameCn,
    daysSinceSent: meta.daysSinceSent,
    followUpTier: closed ? 'done' : meta.followUpTier,
  }
}

/**
 * One follow-up-center row: the target's facts joined with the rung's
 * suggested channel, the host-drafted message, and the reminders already
 * logged against the target.
 */
function followUpRowOf(
  targetKind: WorkbenchFollowUpTargetKind,
  targetId: string,
  clientId: string,
  clientNameCn: string,
  title: string,
  tier: WorkbenchReminderTier,
  days: number,
  dueDate: string | undefined,
  seen: { count: number; lastAt: number } | undefined,
): WorkbenchFollowUp {
  return {
    id: `${targetKind}:${targetId}`,
    targetKind,
    targetId,
    clientId,
    clientNameCn,
    title,
    tier,
    suggestedChannel: REMINDER_SUGGESTED_CHANNELS[tier],
    ...dueDate === undefined ? {} : { dueDate },
    days,
    message: reminderMessageOf(tier, { client: clientNameCn, title, days, ...dueDate === undefined ? {} : { due: dueDate } }),
    reminderCount: seen?.count ?? 0,
    ...seen === undefined ? {} : { lastReminderAt: seen.lastAt },
  }
}

/**
 * The chase message one reminder rung carries (stage-1 SOP 话术分档):
 * friendlier on the early rungs, formal past the deadline. Client-facing
 * copy, so it stays Chinese regardless of the workbench UI locale.
 * @param tier - the rung the target sits in.
 * @param vars - the row's facts: client name, item title, day count, and the
 *   filing due date when the target is an obligation.
 * @returns the draft message.
 */
function reminderMessageOf(
  tier: WorkbenchReminderTier,
  vars: { client: string; title: string; days: number; due?: string },
): string {
  const { client, title, days } = vars
  switch (tier) {
    case 'nudge':
      return `${client}您好，我们于 ${days} 天前向您发送了「${title}」，烦请查收并签署，谢谢！`
    case 'chase':
      return `${client}您好，「${title}」已发出 ${days} 天，目前仍待您签署，麻烦您尽快处理；如有疑问请随时与我们联系。`
    case 'escalate':
      return `${client}您好，「${title}」已发出 ${days} 天仍未签署，现升级由秘书专员为您跟进，我们将尽快与您联系协助完成签署。`
    case 'd30':
      return `${client}您好，贵司「${title}」的申报截止日为 ${vars.due ?? ''}，距离截止还有 ${days} 天，请提前准备相关资料。`
    case 'd15':
      return `${client}您好，再次提醒：贵司「${title}」的申报将于 ${vars.due ?? ''} 截止，剩余 ${days} 天。`
    case 'd7':
      return `${client}您好，紧急提醒：贵司「${title}」的申报将于 ${vars.due ?? ''} 截止，仅剩 ${days} 天，逾期将产生罚款。`
    case 'd1':
      return `${client}您好，最后提醒：贵司「${title}」的申报将于 ${vars.due ?? ''} 截止，仅剩 ${days} 天，请务必尽快处理。`
    case 'overdue':
      return `${client}您好，贵司「${title}」的申报已于 ${vars.due ?? ''} 逾期 ${Math.abs(days)} 天，请立即处理，以免产生进一步处罚。`
  }
}

export default Workbench
