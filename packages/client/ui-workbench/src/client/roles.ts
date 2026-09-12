/**
 * The four AI-company roles the workbench hero presents. Each role decorates
 * one agent preset whose published name contains the role's Chinese keyword:
 * the emoji glyph stands in for the design's cropped icon art, and every
 * human-facing string stays a locale key (no hardcoded copy in components).
 */
import type { WorkbenchKey } from './locales.ts'

/** Stable role id, shared with the host member-binding contract. */
export type RoleId = 'secretary' | 'accountant' | 'legal' | 'audit'

/** One role's presentation metadata. */
export interface RoleMeta {
  /** Stable role id. */
  id: RoleId
  /** Name substring (data, not copy) a preset needs to assume this role. */
  match: string
  /** Emoji glyph used as the member-card icon placeholder. */
  emoji: string
  /** Locale key of the one-line role scope. */
  descKey: WorkbenchKey
  /** Locale keys of the capability chips. */
  tagKeys: readonly WorkbenchKey[]
}

/** The four roles in hero display order. */
export const ROLES: readonly RoleMeta[] = [
  {
    id: 'secretary',
    match: '秘书',
    emoji: '📋',
    descKey: 'role.secretary.desc',
    tagKeys: [
      'role.secretary.tag.service',
      'role.secretary.tag.contract',
      'role.secretary.tag.chase',
      'role.secretary.tag.archive',
    ],
  },
  {
    id: 'accountant',
    match: '会计',
    emoji: '💰',
    descKey: 'role.accountant.desc',
    tagKeys: [
      'role.accountant.tag.books',
      'role.accountant.tag.invoice',
      'role.accountant.tag.monthly',
      'role.accountant.tag.reconcile',
    ],
  },
  {
    id: 'legal',
    match: '法务',
    emoji: '⚖️',
    descKey: 'role.legal.desc',
    tagKeys: [
      'role.legal.tag.charter',
      'role.legal.tag.resolution',
      'role.legal.tag.equity',
      'role.legal.tag.compliance',
    ],
  },
  {
    id: 'audit',
    match: '审计',
    emoji: '🔍',
    descKey: 'role.audit.desc',
    tagKeys: [
      'role.audit.tag.papers',
      'role.audit.tag.tick',
      'role.audit.tag.sample',
      'role.audit.tag.report',
    ],
  },
]

/**
 * Resolve the role a preset name belongs to, if any.
 * @param name - the preset's display name.
 * @returns the matching role metadata, or undefined for a non-role preset.
 */
export function roleOf(name: string): RoleMeta | undefined {
  return ROLES.find(role => name.includes(role.match))
}
