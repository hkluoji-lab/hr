/**
 * Client-safe payloads owned by the workbench domain: the credits state, one
 * ledger entry, the aggregated team snapshot, and the secretary-company rows
 * (client master S-CORE-01, filing obligations S-COMPL-01, signature
 * deliveries S-DELIV-01). Path-free JSON rows; the generated Typert Remote
 * projects these same fields to wire schemas.
 * @module @deepseek-ai/dsh-workbench/types
 */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No client master row carries that id. */
    'workbench/client-not-found': { readonly clientId: string }
    /** No filing obligation row carries that id. */
    'workbench/obligation-not-found': { readonly obligationId: string }
    /** No signature-delivery row carries that id. */
    'workbench/delivery-not-found': { readonly deliveryId: string }
    /** The follow-up target exists but has closed, so chasing it is over. */
    'workbench/follow-up-not-open': { readonly targetKind: string; readonly targetId: string }
  }
}

/** Compliance states a client master row can hold. */
export type WorkbenchComplianceStatus = 'green' | 'yellow' | 'red'

/** Statutory filing kinds the stage-1 ledger tracks (Hong Kong secretary company). */
export type WorkbenchObligationKind = 'NAR1' | 'AB56' | 'PTR' | 'ITR'

/** Lifecycle state of one recorded filing obligation. */
export type WorkbenchObligationStatus = 'open' | 'submitted'

/** Lifecycle state of one sent-out signature delivery (S-DELIV-01). */
export type WorkbenchDeliveryStatus = 'sent' | 'viewed' | 'signed' | 'returned'

/** Channel a delivery left by (stage-1 S-CHAN-01 vocabulary). */
export type WorkbenchDeliveryChannel = 'email' | 'wechat' | 'whatsapp'

/**
 * Follow-up tier an open delivery currently sits in, derived from the days
 * since it went out: `nudge` from T+3 (not yet viewed), `chase` from T+7 (not
 * yet signed), `escalate` from T+14 (the secretary takes over), `fresh`
 * before every rung, and `done` once the row closed (`signed`/`returned`).
 */
export type WorkbenchFollowUpTier = 'fresh' | 'nudge' | 'chase' | 'escalate' | 'done'

/**
 * Reminder tier an open obligation currently sits in, derived from the days
 * until its due date: `d30`/`d15`/`d7`/`d1` mirror the stage-1 reminder
 * ladder (deadline minus 30/15/7/1 days), `overdue` is past due, `ok` is
 * further out than every tier.
 */
export type WorkbenchDueTier = 'ok' | 'd30' | 'd15' | 'd7' | 'd1' | 'overdue'

/** One client master row as the client reads it (S-CORE-01). */
export interface WorkbenchClient {
  /** Stable client id (`C-YYYY-NNNN`, the storage record key). */
  readonly id: string
  /** Chinese registered name; the primary display name. */
  readonly nameCn: string
  /** English registered name, when provided. */
  readonly nameEn?: string
  /** Business Registration number, when provided. */
  readonly brNo?: string
  /** Companies Registry number, when provided. */
  readonly crNo?: string
  /** Incorporation date, `YYYY-MM-DD`. */
  readonly incorporationDate: string
  /** Registered office address, when provided. */
  readonly registeredAddress?: string
  /** Primary contact email, when provided. */
  readonly contactEmail?: string
  /** WeChat contact handle, when provided. */
  readonly contactWechat?: string
  /** WhatsApp contact number, when provided. */
  readonly contactWhatsapp?: string
  /** Compliance state the row currently holds. */
  readonly complianceStatus: WorkbenchComplianceStatus
  /** Creation time, epoch milliseconds. */
  readonly createdAt: number
  /** Count of `open` obligations currently recorded for this client. */
  readonly openObligations: number
  /** Count of deliveries currently awaiting signature (`sent`/`viewed`). */
  readonly openDeliveries: number
}

/** The full client master read, creation order preserved. */
export interface WorkbenchClientList {
  /** Every stored client row. */
  readonly clients: readonly WorkbenchClient[]
}

/** One client creation request; every omitted field is simply absent on the stored row. */
export interface WorkbenchClientCreate {
  /** Chinese registered name; required. */
  readonly nameCn: string
  /** English registered name, when provided. */
  readonly nameEn?: string
  /** Business Registration number, when provided. */
  readonly brNo?: string
  /** Companies Registry number, when provided. */
  readonly crNo?: string
  /** Incorporation date, `YYYY-MM-DD`; required. */
  readonly incorporationDate: string
  /** Registered office address, when provided. */
  readonly registeredAddress?: string
  /** Primary contact email, when provided. */
  readonly contactEmail?: string
  /** WeChat contact handle, when provided. */
  readonly contactWechat?: string
  /** WhatsApp contact number, when provided. */
  readonly contactWhatsapp?: string
  /** Initial compliance state; defaults to `green`. */
  readonly complianceStatus?: WorkbenchComplianceStatus
}

/** Result of one client creation: the stored row as the client reads it. */
export interface WorkbenchClientCreated {
  /** The freshly created client row. */
  readonly client: WorkbenchClient
}

/** One filing obligation row as the client reads it (S-COMPL-01). */
export interface WorkbenchObligation {
  /** Stable obligation id (the storage record key). */
  readonly id: string
  /** Owning client id. */
  readonly clientId: string
  /** Owning client's Chinese name, joined for display. */
  readonly clientNameCn: string
  /** Filing kind. */
  readonly kind: WorkbenchObligationKind
  /** Human period label the filing covers. */
  readonly periodLabel: string
  /** Filing due date, `YYYY-MM-DD`. */
  readonly dueDate: string
  /** Lifecycle state. */
  readonly status: WorkbenchObligationStatus
  /** Creation time, epoch milliseconds. */
  readonly createdAt: number
  /** Whole days from today (UTC) to the due date; negative once overdue. */
  readonly daysUntilDue: number
  /** Reminder tier the row currently sits in. */
  readonly dueTier: WorkbenchDueTier
}

/** The full obligation ledger read, soonest due first. */
export interface WorkbenchObligationList {
  /** Every stored obligation row, open rows first, soonest due first. */
  readonly obligations: readonly WorkbenchObligation[]
}

/** One obligation recording request. */
export interface WorkbenchObligationCreate {
  /** Owning client id; must reference a stored client. */
  readonly clientId: string
  /** Filing kind. */
  readonly kind: WorkbenchObligationKind
  /** Human period label the filing covers. */
  readonly periodLabel: string
  /** Filing due date, `YYYY-MM-DD`. */
  readonly dueDate: string
}

/** One signature-delivery row as the client reads it (S-DELIV-01). */
export interface WorkbenchDelivery {
  /** Stable delivery id (the storage record key). */
  readonly id: string
  /** Owning client id. */
  readonly clientId: string
  /** Owning client's Chinese name, joined for display. */
  readonly clientNameCn: string
  /** What went out. */
  readonly title: string
  /** Channel the package left by. */
  readonly channel: WorkbenchDeliveryChannel
  /** Lifecycle state. */
  readonly status: WorkbenchDeliveryStatus
  /** Send time, epoch milliseconds; the follow-up ladder measures from here. */
  readonly createdAt: number
  /** Whole days since the send date (UTC); grows while the row stays open. */
  readonly daysSinceSent: number
  /** Follow-up tier the row currently sits in. */
  readonly followUpTier: WorkbenchFollowUpTier
}

/** The full delivery ledger read, longest-waiting open rows first. */
export interface WorkbenchDeliveryList {
  /** Every stored delivery row, open rows first, each group oldest sent first. */
  readonly deliveries: readonly WorkbenchDelivery[]
}

/** One delivery recording request; the row opens in `sent`, sent now. */
export interface WorkbenchDeliveryCreate {
  /** Owning client id; must reference a stored client. */
  readonly clientId: string
  /** What went out. */
  readonly title: string
  /** Channel the package left by; defaults to `email`. */
  readonly channel?: WorkbenchDeliveryChannel
}

/**
 * Reminder tiers a follow-up action can carry: the delivery rungs
 * (`nudge`/`chase`/`escalate`) and the obligation rungs
 * (`d30`/`d15`/`d7`/`d1`/`overdue`) joined, since the follow-up center rows
 * over both ladders with one vocabulary.
 */
export type WorkbenchReminderTier = 'nudge' | 'chase' | 'escalate' | 'd30' | 'd15' | 'd7' | 'd1' | 'overdue'

/** What one follow-up targets: a signature delivery or a filing obligation. */
export type WorkbenchFollowUpTargetKind = 'delivery' | 'obligation'

/**
 * One row of the follow-up center (S-FOLLOW-01): an open delivery sitting in
 * a chase rung or an open obligation sitting in a reminder rung, with the
 * host-drafted message the chase sends and what has already been logged.
 */
export interface WorkbenchFollowUp {
  /** Stable row id, `${targetKind}:${targetId}`. */
  readonly id: string
  /** What the chase targets. */
  readonly targetKind: WorkbenchFollowUpTargetKind
  /** The target row's id (the `deliveries` or `obligations` table key). */
  readonly targetId: string
  /** Owning client id. */
  readonly clientId: string
  /** Owning client's Chinese name, joined for display. */
  readonly clientNameCn: string
  /** Delivery title, or `${kind} ${periodLabel}` for an obligation. */
  readonly title: string
  /** Ladder rung the target sits in today. */
  readonly tier: WorkbenchReminderTier
  /** Channel the stage-1 SOP suggests for this rung. */
  readonly suggestedChannel: WorkbenchDeliveryChannel
  /** Filing due date, `YYYY-MM-DD`; absent for a delivery row. */
  readonly dueDate?: string
  /** Days since the delivery went out, or days to the due date (negative once overdue). */
  readonly days: number
  /** The host-drafted chase message for this rung, filled with the row's facts. */
  readonly message: string
  /** How many reminders have been logged against the target. */
  readonly reminderCount: number
  /** When the latest reminder was logged, epoch milliseconds; absent before the first. */
  readonly lastReminderAt?: number
}

/** The follow-up center read, most urgent rows first. */
export interface WorkbenchFollowUpList {
  /** Every actionable row, most urgent ladder rung first. */
  readonly followUps: readonly WorkbenchFollowUp[]
}

/** One follow-up logging request: chase a target by a channel, with a message. */
export interface WorkbenchFollowUpCreate {
  /** What the chase targets. */
  readonly targetKind: WorkbenchFollowUpTargetKind
  /** The target row's id. */
  readonly targetId: string
  /** Channel to send by; defaults to the rung's suggested channel. */
  readonly channel?: WorkbenchDeliveryChannel
  /** Message to carry; defaults to the host's draft for the rung. */
  readonly message?: string
}

/** One logged reminder as the client reads it. */
export interface WorkbenchReminder {
  /** Stable reminder id (the storage record key). */
  readonly id: string
  /** What the chase targeted. */
  readonly targetKind: WorkbenchFollowUpTargetKind
  /** The target row's id. */
  readonly targetId: string
  /** Ladder rung the target sat in when the reminder was logged. */
  readonly tier: WorkbenchReminderTier
  /** Channel the reminder went out by. */
  readonly channel: WorkbenchDeliveryChannel
  /** Message the reminder carried. */
  readonly message: string
  /** Log time, epoch milliseconds. */
  readonly createdAt: number
}

/** Result of one follow-up logging: the stored reminder row. */
export interface WorkbenchReminderLogged {
  /** The freshly logged reminder. */
  readonly reminder: WorkbenchReminder
}

/** One row of the current-year statutory-filing schedule. */
export interface WorkbenchScheduleRow {
  /** Owning client id. */
  readonly clientId: string
  /** Owning client's Chinese name, joined for display. */
  readonly clientNameCn: string
  /** Filing kind; a projected row is always `NAR1`. */
  readonly kind: WorkbenchObligationKind
  /** Human period label the filing covers. */
  readonly periodLabel: string
  /** Filing due date, `YYYY-MM-DD`. */
  readonly dueDate: string
  /** Lifecycle state; a projected row is always `open`. */
  readonly status: WorkbenchObligationStatus
  /** `ledger` when a stored obligation backs the row, `derived` for the projected NAR1 anniversary filing. */
  readonly source: 'ledger' | 'derived'
  /** Reminder tier the row currently sits in. */
  readonly dueTier: WorkbenchDueTier
}

/**
 * The current-year statutory-filing schedule: every stored obligation due in
 * the year plus one projected NAR1 row per client whose incorporation
 * anniversary falls in the year without a recorded NAR1 filing, soonest due
 * first.
 */
export interface WorkbenchSchedule {
  /** The schedule year, `YYYY`. */
  readonly year: string
  /** Every row due in the year, soonest due first. */
  readonly rows: readonly WorkbenchScheduleRow[]
}

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
