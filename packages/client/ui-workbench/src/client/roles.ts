/**
 * The six AI-company roles the workbench hero presents. Each role decorates
 * one agent preset whose published name contains the role's Chinese keyword:
 * the emoji glyph stands in for the design's cropped icon art, and every
 * human-facing string stays a locale key (no hardcoded copy in components).
 */
import type { WorkbenchKey } from './locales.ts'

/** Stable role id, shared with the host member-binding contract. */
export type RoleId = 'recruiting' | 'finance' | 'legal' | 'financing' | 'admin' | 'marketing'

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

/** One preset task a role's workbench card can start with one click. */
export interface RoleAction {
  /** Stable action id within the role. */
  id: string
  /** Locale key of the button label. */
  labelKey: WorkbenchKey
  /** Locale key of the brief submitted as the session's first user message. */
  briefKey: WorkbenchKey
}

/** The preset actions each company role's card offers, in display order. */
export const ROLE_ACTIONS: Record<RoleId, readonly RoleAction[]> = {
  recruiting: [
    { id: 'screen', labelKey: 'team.action.recruiting.screen', briefKey: 'team.brief.recruiting.screen' },
    { id: 'interview', labelKey: 'team.action.recruiting.interview', briefKey: 'team.brief.recruiting.interview' },
  ],
  finance: [
    { id: 'books', labelKey: 'team.action.finance.books', briefKey: 'team.brief.finance.books' },
    { id: 'monthly', labelKey: 'team.action.finance.monthly', briefKey: 'team.brief.finance.monthly' },
  ],
  legal: [
    { id: 'compliance', labelKey: 'team.action.legal.compliance', briefKey: 'team.brief.legal.compliance' },
    { id: 'charter', labelKey: 'team.action.legal.charter', briefKey: 'team.brief.legal.charter' },
  ],
  financing: [
    { id: 'materials', labelKey: 'team.action.financing.materials', briefKey: 'team.brief.financing.materials' },
    { id: 'diligence', labelKey: 'team.action.financing.diligence', briefKey: 'team.brief.financing.diligence' },
  ],
  admin: [
    { id: 'chase', labelKey: 'team.action.admin.chase', briefKey: 'team.brief.admin.chase' },
    { id: 'archive', labelKey: 'team.action.admin.archive', briefKey: 'team.brief.admin.archive' },
  ],
  marketing: [
    { id: 'plan', labelKey: 'team.action.marketing.plan', briefKey: 'team.brief.marketing.plan' },
    { id: 'review', labelKey: 'team.action.marketing.review', briefKey: 'team.brief.marketing.review' },
  ],
}

/** The six roles in hero display order. */
export const ROLES: readonly RoleMeta[] = [
  {
    id: 'recruiting',
    match: '招聘',
    emoji: '🧑‍💼',
    descKey: 'role.recruiting.desc',
    tagKeys: [
      'role.recruiting.tag.screen',
      'role.recruiting.tag.interview',
      'role.recruiting.tag.offer',
      'role.recruiting.tag.onboard',
    ],
  },
  {
    id: 'finance',
    match: '财务',
    emoji: '💰',
    descKey: 'role.finance.desc',
    tagKeys: [
      'role.finance.tag.books',
      'role.finance.tag.invoice',
      'role.finance.tag.monthly',
      'role.finance.tag.reconcile',
    ],
  },
  {
    id: 'legal',
    match: '法务',
    emoji: '⚖️',
    descKey: 'role.legal.desc',
    tagKeys: [
      'role.legal.tag.charter',
      'role.legal.tag.contract',
      'role.legal.tag.resolution',
      'role.legal.tag.compliance',
    ],
  },
  {
    id: 'financing',
    match: '融资',
    emoji: '📈',
    descKey: 'role.financing.desc',
    tagKeys: [
      'role.financing.tag.bp',
      'role.financing.tag.diligence',
      'role.financing.tag.pitch',
      'role.financing.tag.term',
    ],
  },
  {
    id: 'admin',
    match: '行政',
    emoji: '📋',
    descKey: 'role.admin.desc',
    tagKeys: [
      'role.admin.tag.schedule',
      'role.admin.tag.minutes',
      'role.admin.tag.chase',
      'role.admin.tag.archive',
    ],
  },
  {
    id: 'marketing',
    match: '营销',
    emoji: '📣',
    descKey: 'role.marketing.desc',
    tagKeys: [
      'role.marketing.tag.content',
      'role.marketing.tag.lead',
      'role.marketing.tag.campaign',
      'role.marketing.tag.review',
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
