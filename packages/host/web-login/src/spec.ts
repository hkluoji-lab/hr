/**
 * The web-login storage domain: one durable `accounts` table keyed by phone
 * number. SMS challenges stay in memory (short-lived, disposable); accounts
 * are the durable fact of registration — `single` layout, tiny records. The
 * domain name is `web_login` (unit names carry no hyphens).
 * @module @deepseek-ai/dsh-web-login/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable, type DomainTableSpec } from '@deepseek-ai/dsh-storage-domain'

/**
 * The AI-company roles a member phone can hold. The ids match the client
 * workbench's role vocabulary (`ui-workbench` roles.ts); `owner` is not a
 * member role — it is derived from the earliest registered account.
 */
export const ROLE_IDS = ['secretary', 'accountant', 'legal', 'audit'] as const

/** One AI-company role id. */
export type RoleId = (typeof ROLE_IDS)[number]

/** Member-role array: at least one, no duplicates, known ids only. */
export const memberRolesSchema: z.ZodType<RoleId[]> = z.array(z.enum(ROLE_IDS))
  .min(1)
  .max(ROLE_IDS.length)
  .refine(roles => new Set(roles).size === roles.length, { message: 'duplicate role' })

/** One stored login account. The key is the account phone number. */
export const accountSchema = z.object({
  /** Masked phone shown in UI (`138****1234`); derived from the key at write time. */
  displayName: z.string().min(1),
  /** First login (registration) time, epoch milliseconds. */
  createdAt: z.number().int().nonnegative(),
  /** Most recent login time, epoch milliseconds. */
  lastLoginAt: z.number().int().nonnegative(),
})

/** One stored account record, inferred from {@link accountSchema}. */
export type AccountRecord = z.infer<typeof accountSchema>

/** One phone's bound member roles. The key is the member's phone number. */
export const memberSchema = z.object({
  /** The bound AI-company roles. */
  roles: memberRolesSchema,
  /** Masked phone of the owner who granted the binding. */
  grantedBy: z.string().min(1),
  /** Grant time, epoch milliseconds. */
  grantedAt: z.number().int().nonnegative(),
})

/** One stored member record, inferred from {@link memberSchema}. */
export type MemberRecord = z.infer<typeof memberSchema>

/** One outstanding invitation. The key is the invite code. */
export const inviteSchema = z.object({
  /** The AI-company roles the redeemer will be granted. */
  roles: memberRolesSchema,
  /** Masked phone of the owner who created the invite. */
  createdBy: z.string().min(1),
  /** Creation time, epoch milliseconds. */
  createdAt: z.number().int().nonnegative(),
  /** Instant the invite stops being redeemable, epoch milliseconds. */
  expiresAt: z.number().int().nonnegative(),
  /** Redeem time; present once consumed (an invite is single-use). */
  acceptedAt: z.number().int().nonnegative().optional(),
})

/** One stored invite record, inferred from {@link inviteSchema}. */
export type InviteRecord = z.infer<typeof inviteSchema>

/**
 * Password policy: 8–64 characters with at least one letter and one digit.
 * The same rule renders as the login page's front-end hint and rejects on
 * the wire, so a stored credential always satisfies it.
 */
export const passwordSchema: z.ZodType<string> = z.string()
  .min(8)
  .max(64)
  .refine(password => /[a-zA-Z]/.test(password) && /\d/.test(password), {
    message: 'password needs at least one letter and one digit',
  })

/** One stored password credential. The key is the account phone number. */
export const credentialSchema = z.object({
  /** Self-describing scrypt hash: `scrypt$N$r$p$saltHex$hashHex`. */
  passwordHash: z.string().min(1),
  /** First password-set time, epoch milliseconds. */
  createdAt: z.number().int().nonnegative(),
  /** Most recent password-set time, epoch milliseconds. */
  updatedAt: z.number().int().nonnegative(),
})

/** One stored credential record, inferred from {@link credentialSchema}. */
export type CredentialRecord = z.infer<typeof credentialSchema>

/**
 * Concrete web-login domain declaration: name, version, and layout pinned to
 * literals. The version stays 1 across the members/invites addition: `single`-
 * layout reads match the version exactly, so bumping it would strand every
 * existing `web_login.json` medium, while the record schemas of the declared
 * tables are unchanged and a missing declared table parses as empty — the
 * accounts table predates the addition with the same schema.
 */
export type WebLoginDomainSpec = ReturnType<typeof defineDomain<{
  name: 'web_login'
  version: 1
  layout: 'single'
  tables: {
    accounts: DomainTableSpec<string, AccountRecord>
    members: DomainTableSpec<string, MemberRecord>
    invites: DomainTableSpec<string, InviteRecord>
    credentials: DomainTableSpec<string, CredentialRecord>
  }
}>>

/**
 * Build the web-login domain spec.
 * @returns the `web-login` domain declaration (per-phone accounts and member
 *   bindings, per-code invitations, per-phone password credentials).
 */
export function webLoginDomainSpec(): WebLoginDomainSpec {
  return defineDomain({
    name: 'web_login',
    version: 1,
    layout: 'single',
    tables: {
      accounts: domainTable<string, AccountRecord>(accountSchema),
      members: domainTable<string, MemberRecord>(memberSchema),
      invites: domainTable<string, InviteRecord>(inviteSchema),
      credentials: domainTable<string, CredentialRecord>(credentialSchema),
    },
  })
}

/**
 * Mask a phone number for display: first 3 and last 4 digits with a fixed
 * middle mask. The pattern is validated before storage, so the slice is safe.
 * @param phone - a `^1\d{10}$` phone number.
 * @returns the masked display name, e.g. `138****1234`.
 */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}
