/**
 * Client-safe payloads owned by the workbench domain: the credits state, one
 * ledger entry, and the aggregated team snapshot. Path-free JSON rows; the
 * generated Typert Remote projects these same fields to wire schemas.
 * @module @deepseek-ai/dsh-workbench/types
 */

/** Current credits balance. */
export interface WorkbenchCredits {
  /** Spendable points; never negative. */
  readonly balance: number
}

/** One team member's aggregated presence. */
export type WorkbenchMemberStatus = 'online' | 'busy' | 'offline'

/** One preset row with its live aggregated status. */
export interface WorkbenchMember {
  /** Preset id; the stable identity. */
  readonly id: string
  /** Display name the preset published; absent falls back to the id. */
  readonly name?: string
  /** One sentence on what the member is for. */
  readonly description?: string
  /** Aggregated presence: busy while a live session runs the preset, offline when broken. */
  readonly status: WorkbenchMemberStatus
}

/** The roster-wide aggregation. */
export interface WorkbenchTeam {
  /** Healthy members (busy included), matching the hero's online count. */
  readonly online: number
  /** Members with a live non-blank session running the preset. */
  readonly busy: number
  /** Broken presets, sorted to the end of {@link members}. */
  readonly offline: number
  /** Every roster member in roster order, offline last. */
  readonly members: readonly WorkbenchMember[]
}

/** The one read the workbench surfaces serve: credits beside the team. */
export interface WorkbenchSnapshot {
  /** Persisted credits state. */
  readonly credits: WorkbenchCredits
  /** Aggregated roster presence. */
  readonly team: WorkbenchTeam
  /** The greeting identity: the web login's display name when one exists, else the host machine account's. */
  readonly user?: WorkbenchUser
}

/** The logged-in account the greeting addresses. */
export interface WorkbenchUser {
  /** Display name: the web login's masked phone, else the OS account's full name or short name. */
  readonly name: string
}

/** One appended ledger entry as the client reads it. */
export interface WorkbenchCreditEntry {
  /** Stable entry id (the storage record key). */
  readonly id: string
  /** Points granted; always positive. */
  readonly amount: number
  /** Why the points were granted. */
  readonly reason: string
  /** Grant time, epoch milliseconds. */
  readonly at: number
}

/** Result of one grant: the new balance beside the appended entry. */
export interface WorkbenchCreditGrant {
  /** Balance after the grant landed. */
  readonly balance: number
  /** The appended ledger entry. */
  readonly entry: WorkbenchCreditEntry
}

/** The bounded ledger read: the most recent grants, newest first. */
export interface WorkbenchLedger {
  /** Recent entries, newest first; at most the service's read limit. */
  readonly entries: readonly WorkbenchCreditEntry[]
}

export {}
