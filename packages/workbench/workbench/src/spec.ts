/**
 * The workbench storage domain: a global singleton holding the credits
 * balance plus a per-record ledger table. The balance global is the
 * authoritative read; each grant appends one immutable ledger document
 * (`<root>/workbench/entries/<uuid>.json`) and then replaces the global, both
 * on the domain's single write chain.
 * @module @deepseek-ai/dsh-workbench/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable, type DomainGlobalSpec, type DomainTableSpec } from '@deepseek-ai/dsh-storage-domain'

/** Maximum grant reason length; a wire-boundary constant, not a tunable. */
export const MAX_REASON_LENGTH = 200

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
  }
}>>

/**
 * Build the workbench domain spec.
 * @param startingBalance - balance served before the first grant on a fresh
 *   medium; deployment-tunable through the plugin Config.
 * @returns the `workbench` domain declaration (global + per-record ledger).
 */
export function workbenchDomainSpec(startingBalance: number): WorkbenchDomainSpec {
  return defineDomain({
    name: 'workbench',
    version: 1,
    layout: 'per-record',
    global: { schema: creditsSchema, initial: { balance: startingBalance } },
    tables: {
      entries: domainTable<string, CreditEntryRecord>(creditEntrySchema),
    },
  })
}

