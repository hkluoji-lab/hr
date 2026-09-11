/**
 * A sidebar navigation entry for one workbench surface: the design's primary
 * list under New Session. Every entry is additive in the `sidebar.nav` list, so
 * the sidebar shell keeps ownership of the brand row, the New Session control,
 * and the browsing region. The rail shows the target's glyph with a tooltip;
 * the wide column adds the label.
 *
 * Four targets toggle a frame-wide page; `projects` is a command that reveals
 * the sidebar's own project/Workspace browser instead of covering the frame.
 * The AI-team entry additionally renders the design's role groups inline: the
 * four secretary-company roles, each expandable to its capability entries that
 * open the team page (wide column only; the rail shows the glyph alone).
 */
import { useState, useSyncExternalStore } from 'react'
import {
  IconAgentPresetOutline16,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconFolderClose16,
  IconListPenOutline16,
  IconPlayOutline16,
  IconSparkle16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-sidebar SlotMap merge (the navigation seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { WorkbenchController, WorkbenchPageId } from './workbench-store.ts'
import { ROLES, type RoleMeta } from './roles.ts'
import { NS, type WorkbenchKey } from './locales.ts'
import css from './WorkbenchNavAction.module.css'

/** A surface a sidebar navigation entry activates. */
export type WorkbenchNavTarget = 'hall' | 'assistant' | 'active' | 'team' | 'projects'

/** Glyph, label, and the page each nav target drives (null = command). */
const TARGETS: Record<WorkbenchNavTarget, {
  readonly icon: typeof IconListPenOutline16
  readonly label: WorkbenchKey
  readonly page: WorkbenchPageId | null
}> = {
  hall: { icon: IconListPenOutline16, label: 'nav.hall', page: 'hall' },
  assistant: { icon: IconSparkle16, label: 'nav.assistant', page: 'assistant' },
  active: { icon: IconPlayOutline16, label: 'nav.active', page: 'active' },
  team: { icon: IconAgentPresetOutline16, label: 'nav.team', page: 'team' },
  projects: { icon: IconFolderClose16, label: 'nav.projects', page: null },
}

/** Registration-side business face for one sidebar navigation entry. */
export interface WorkbenchNavInjected {
  /** The surface this entry activates. */
  target: WorkbenchNavTarget
  /** Whether this entry's surface is currently showing. */
  useActive: () => boolean
  /** Activate this entry's surface. */
  activate: () => void
  /** Open the AI-team page; the role capability children activate through it. */
  openTeam: () => void
}

/** Full component props. */
export type WorkbenchNavActionProps =
  PropsRuntime<'sidebar.nav'>
  & PropsLocale<typeof NS>
  & InjectFace<WorkbenchNavInjected>

/**
 * Render one workbench navigation entry.
 * @param props - the sidebar's `wide` state plus this entry's face.
 * @returns the labelled row (wide) or the rail glyph button; the team entry
 *   appends its role groups.
 */
export function WorkbenchNavAction({ wide, t, target, useActive, activate, openTeam }: WorkbenchNavActionProps) {
  const active = useActive()
  const label = t(TARGETS[target].label)
  const Icon = TARGETS[target].icon

  // Expansion is this row's presentation state, not page state; the design
  // shows the group and the secretary role already open.
  const [groupOpen, setGroupOpen] = useState(true)
  const [rolesOpen, setRolesOpen] = useState<ReadonlySet<RoleMeta['id']>>(() => new Set(['secretary']))

  const button = (
    <button
      type="button"
      className={`${css.action} ${wide ? css.wide : css.rail}${active ? ` ${css.active}` : ''}`}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={() => { activate() }}
    >
      <Icon size={wide ? 16 : 18} />
      {wide && <span className={css.label}>{label}</span>}
    </button>
  )

  if (!wide) {
    // The wide row carries its own visible label; the tooltip serves the rail.
    return <Tooltip label={label} delayMs={500}>{button}</Tooltip>
  }

  if (target !== 'team') return button

  const toggleRole = (id: RoleMeta['id']): void => {
    setRolesOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className={css.group}>
      <div className={css.rowWrap}>
        {button}
        <button
          type="button"
          className={css.chevron}
          aria-label={t('nav.team.toggle')}
          aria-expanded={groupOpen}
          onClick={() => { setGroupOpen(open => !open) }}
        >
          {groupOpen ? <IconChevronDownOutline14 size={14} /> : <IconChevronRightOutline14 size={14} />}
        </button>
      </div>
      {groupOpen && (
        <div className={css.children}>
          {ROLES.map(role => {
            const roleOpen = rolesOpen.has(role.id)
            return (
              <div key={role.id}>
                <button
                  type="button"
                  className={css.roleRow}
                  aria-expanded={roleOpen}
                  onClick={() => { toggleRole(role.id) }}
                >
                  <span className={css.roleGlyph} aria-hidden="true">{role.emoji}</span>
                  <span className={css.label}>{t(`nav.role.${role.id}`)}</span>
                  <span className={css.roleChevron} aria-hidden="true">
                    {roleOpen ? <IconChevronDownOutline14 size={12} /> : <IconChevronRightOutline14 size={12} />}
                  </span>
                </button>
                {roleOpen && (
                  <div className={css.roleChildren}>
                    {role.tagKeys.map(tagKey => (
                      <button
                        key={tagKey}
                        type="button"
                        className={css.childRow}
                        onClick={() => { openTeam() }}
                      >
                        <span className={css.childDot} aria-hidden="true" />
                        {t('nav.role.child', { tag: t(tagKey) })}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Build one nav entry's face: a page target toggles that page and reports its
 * own active state from the page store; the `projects` command reveals the
 * sidebar and is never current; `openTeam` shows the team page without
 * toggling, which the role capability children activate through.
 * @param controller - the workbench controller owning page state.
 * @param target - the surface this entry activates.
 * @returns the inject face for the navigation slot.
 */
export function navActionFace(
  controller: WorkbenchController,
  target: WorkbenchNavTarget,
): WorkbenchNavInjected {
  const page = TARGETS[target].page
  return {
    target,
    useActive: () => useSyncExternalStore(
      listener => controller.pages.subscribe(listener),
      () => page !== null && controller.pages.getSnapshot().open === page,
    ),
    activate: () => {
      if (page === null) {
        controller.viewProjects()
        return
      }
      controller.togglePage(page)
    },
    openTeam: () => { controller.openPage('team') },
  }
}
