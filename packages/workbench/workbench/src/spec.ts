/**
 * The workbench storage domain: a global singleton holding the credits
 * balance plus per-record tables — the credits ledger, the secretary-company
 * client master (S-CORE-01), the statutory-filing obligation ledger
 * (S-COMPL-01), the signature-delivery ledger (S-DELIV-01), and the
 * follow-up reminder log (S-FOLLOW-01). The balance global is the
 * authoritative read; each grant appends one immutable ledger document
 * (`<root>/workbench/entries/<uuid>.json`) and then replaces the global, both
 * on the domain's single write chain. Client, obligation, delivery, and
 * reminder records follow the same per-record layout; those tables postdate
 * the credits medium, and per-record reads treat a missing declared table as
 * empty, so the domain version stays 1.
 * @module @deepseek-ai/dsh-workbench/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable, type DomainGlobalSpec, type DomainTableSpec } from '@deepseek-ai/dsh-storage-domain'

/** Maximum grant reason length; a wire-boundary constant, not a tunable. */
export const MAX_REASON_LENGTH = 200

/** Maximum client name / address / contact length; a wire-boundary constant, not a tunable. */
export const MAX_CLIENT_FIELD_LENGTH = 120

/** Maximum obligation period label length; a wire-boundary constant, not a tunable. */
export const MAX_PERIOD_LENGTH = 32

/** Maximum delivery title length; a wire-boundary constant, not a tunable. */
export const MAX_DELIVERY_TITLE_LENGTH = 120

/** Maximum stored reminder message length; a wire-boundary constant, not a tunable. */
export const MAX_REMINDER_MESSAGE_LENGTH = 500

/** `YYYY-MM-DD` calendar date as the wire and storage format for civil dates. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Compliance states a client master row can hold. */
export const COMPLIANCE_STATUSES = ['green', 'yellow', 'red'] as const

/** Statutory filing kinds the stage-1 ledger tracks (Hong Kong secretary company). */
export const OBLIGATION_KINDS = ['NAR1', 'AB56', 'PTR', 'ITR'] as const

/** Outgoing channels a delivery can name (stage-1 S-CHAN-01 vocabulary). */
export const DELIVERY_CHANNELS = ['email', 'wechat', 'whatsapp'] as const

/** One stored client master row (S-CORE-01, MVP field set). */
export const clientRecordSchema = z.object({
  /** Chinese registered name; the primary display name. */
  nameCn: z.string().min(1).max(MAX_CLIENT_FIELD_LENGTH),
  /** English registered name, when provided. */
  nameEn: z.string().max(MAX_CLIENT_FIELD_LENGTH).optional(),
  /** Business Registration number, when provided. */
  brNo: z.string().max(MAX_CLIENT_FIELD_LENGTH).optional(),
  /** Companies Registry number, when provided. */
  crNo: z.string().max(MAX_CLIENT_FIELD_LENGTH).optional(),
  /** Incorporation date, `YYYY-MM-DD`; anchors NAR1 anniversary scheduling. */
  incorporationDate: z.string().regex(DATE_PATTERN),
  /** Registered office address, when provided. */
  registeredAddress: z.string().max(MAX_CLIENT_FIELD_LENGTH).optional(),
  /** Primary contact email, when provided. */
  contactEmail: z.string().max(MAX_CLIENT_FIELD_LENGTH).optional(),
  /** WeChat contact handle, when provided. */
  contactWechat: z.string().max(MAX_CLIENT_FIELD_LENGTH).optional(),
  /** WhatsApp contact number, when provided. */
  contactWhatsapp: z.string().max(MAX_CLIENT_FIELD_LENGTH).optional(),
  /** Rolled-up compliance state; the ledger rows drive what the UI suggests. */
  complianceStatus: z.enum(COMPLIANCE_STATUSES),
  /** Creation time, epoch milliseconds. */
  createdAt: z.number().int().nonnegative(),
})

/** One stored client master record, inferred from {@link clientRecordSchema}. */
export type ClientRecord = z.infer<typeof clientRecordSchema>

/** One stored statutory-filing obligation row (S-COMPL-01). */
export const obligationRecordSchema = z.object({
  /** Owning client id (the `clients` table key). */
  clientId: z.string().min(1).max(MAX_CLIENT_FIELD_LENGTH),
  /** Filing kind; the vocabulary {@link OBLIGATION_KINDS} fixes. */
  kind: z.enum(OBLIGATION_KINDS),
  /** Human period label the filing covers (typically the year). */
  periodLabel: z.string().min(1).max(MAX_PERIOD_LENGTH),
  /** Filing due date, `YYYY-MM-DD`; the secretary owns the correctness. */
  dueDate: z.string().regex(DATE_PATTERN),
  /** Lifecycle state: recorded filings stay `open` until marked submitted. */
  status: z.enum(['open', 'submitted']),
  /** Creation time, epoch milliseconds. */
  createdAt: z.number().int().nonnegative(),
})

/** One stored obligation record, inferred from {@link obligationRecordSchema}. */
export type ObligationRecord = z.infer<typeof obligationRecordSchema>

/** One stored signature-delivery row (S-DELIV-01): a file package sent out awaiting the client. */
export const deliveryRecordSchema = z.object({
  /** Owning client id (the `clients` table key). */
  clientId: z.string().min(1).max(MAX_CLIENT_FIELD_LENGTH),
  /** What went out, e.g. `2026 年报 NAR1 套装`; the secretary owns the wording. */
  title: z.string().min(1).max(MAX_DELIVERY_TITLE_LENGTH),
  /** Channel the package left by; the vocabulary {@link DELIVERY_CHANNELS} fixes. */
  channel: z.enum(DELIVERY_CHANNELS),
  /** Lifecycle state: every row opens `sent`; `signed`/`returned` close it. */
  status: z.enum(['sent', 'viewed', 'signed', 'returned']),
  /** Send time, epoch milliseconds; the follow-up ladder measures from here. */
  createdAt: z.number().int().nonnegative(),
})

/** One stored delivery record, inferred from {@link deliveryRecordSchema}. */
export type DeliveryRecord = z.infer<typeof deliveryRecordSchema>

/**
 * Reminder tiers a follow-up action can carry at log time, fixed by the two
 * stage-1 ladders: the delivery follow-up rungs (`nudge`/`chase`/`escalate`)
 * and the obligation reminder rungs (`d30`/`d15`/`d7`/`d1`/`overdue`).
 */
export const REMINDER_TIERS = ['nudge', 'chase', 'escalate', 'd30', 'd15', 'd7', 'd1', 'overdue'] as const

/** Outgoing channels a reminder can name; the S-CHAN-01 vocabulary again. */
export const REMINDER_CHANNELS = DELIVERY_CHANNELS

/** One stored follow-up reminder row (S-FOLLOW-01): one logged chase action. */
export const reminderRecordSchema = z.object({
  /** What the chase targets: a signature delivery or a filing obligation. */
  targetKind: z.enum(['delivery', 'obligation']),
  /** The target row's id (the `deliveries` or `obligations` table key). */
  targetId: z.string().min(1).max(MAX_CLIENT_FIELD_LENGTH),
  /** Ladder rung the target sat in when the reminder was logged. */
  tier: z.enum(REMINDER_TIERS),
  /** Channel the reminder went out by. */
  channel: z.enum(REMINDER_CHANNELS),
  /** Message the reminder carried; the host draft or the secretary's edit. */
  message: z.string().min(1).max(MAX_REMINDER_MESSAGE_LENGTH),
  /** Log time, epoch milliseconds. */
  createdAt: z.number().int().nonnegative(),
})

/** One stored reminder record, inferred from {@link reminderRecordSchema}. */
export type ReminderRecord = z.infer<typeof reminderRecordSchema>

/** Durable record of one credits grant. */
export const creditEntrySchema = z.object({
  /** Points granted; always positive. */
  amount: z.number().int().positive(),
  /** Why the points were granted; trimmed non-empty text. */
  reason: z.string().min(1).max(MAX_REASON_LENGTH),
  /** Grant time, epoch milliseconds. */
  at: z.number().int().nonnegative(),
})

/** One stored ledger record, inferred from {@link creditEntrySchema}. */
export type CreditEntryRecord = z.infer<typeof creditEntrySchema>

/** Authoritative credits state. */
export const creditsSchema = z.object({
  /** Spendable points; the schema refuses a negative durable balance. */
  balance: z.number().int().nonnegative(),
})

/** The credits global value. */
export type CreditsState = z.infer<typeof creditsSchema>

/** Concrete workbench domain declaration: name, version, and layout pinned to literals. */
export type WorkbenchDomainSpec = ReturnType<typeof defineDomain<{
  name: 'workbench'
  version: 1
  layout: 'per-record'
  global: DomainGlobalSpec<CreditsState>
  tables: {
    entries: DomainTableSpec<string, CreditEntryRecord>
    clients: DomainTableSpec<string, ClientRecord>
    obligations: DomainTableSpec<string, ObligationRecord>
    deliveries: DomainTableSpec<string, DeliveryRecord>
    reminders: DomainTableSpec<string, ReminderRecord>
  }
}>>

/**
 * Build the workbench domain spec.
 * @param startingBalance - balance served before the first grant on a fresh
 *   medium; deployment-tunable through the plugin Config.
 * @returns the `workbench` domain declaration (global + per-record tables).
 */
export function workbenchDomainSpec(startingBalance: number): WorkbenchDomainSpec {
  return defineDomain({
    name: 'workbench',
    version: 1,
    layout: 'per-record',
    global: { schema: creditsSchema, initial: { balance: startingBalance } },
    tables: {
      entries: domainTable<string, CreditEntryRecord>(creditEntrySchema),
      clients: domainTable<string, ClientRecord>(clientRecordSchema),
      obligations: domainTable<string, ObligationRecord>(obligationRecordSchema),
      deliveries: domainTable<string, DeliveryRecord>(deliveryRecordSchema),
      reminders: domainTable<string, ReminderRecord>(reminderRecordSchema),
    },
  })
}

