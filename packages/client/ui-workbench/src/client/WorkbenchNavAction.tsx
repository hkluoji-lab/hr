/**
 * A sidebar-foot nav entry for one workbench surface: the hero dashboard
 * (`home`) or one frame-wide page. Every entry is additive in the
 * `sidebar.footer.action` list, so the sidebar shell and its workspace and
 * settings regions stay untouched. The rail shows the target's glyph with a
 * tooltip; the wide column adds the label, like the Settings trigger.
 */
import { useSyncExternalStore } from 'react'
import {
  IconAgentPresetOutline16,
  IconDataOutline16,
  IconGaugeOutline16,
  IconListPenOutline16,
  IconSparkle16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-sidebar SlotMap merge (the footer-action seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { WorkbenchController, WorkbenchPageId } from './workbench-store.ts'
import { NS, type WorkbenchKey } from './locales.ts'
import css from './WorkbenchNavAction.module.css'

/** A surface a sidebar-foot entry activates. */
export type WorkbenchNavTarget = 'home' | WorkbenchPageId

/** Glyph and label of each nav target. */
const TARGETS: Record<WorkbenchNavTarget, { readonly icon: typeof IconGaugeOutline16; readonly label: WorkbenchKey }> = {
  home: { icon: IconGaugeOutline16, label: 'nav.home' },
  hall: { icon: IconListPenOutline16, label: 'nav.hall' },
  assistant: { icon: IconSparkle16, label: 'nav.assistant' },
  team: { icon: IconAgentPresetOutline16, label: 'nav.team' },
  report: { icon: IconDataOutline16, label: 'nav.report' },
}

/** Registration-side business face for one sidebar-foot nav entry. */
export interface WorkbenchNavInjected {
  /** The surface this entry activates. */
  target: WorkbenchNavTarget
  /** Whether this entry's surface is currently showing. */
  useActive: () => boolean
  /** Activate this entry's surface. */
  activate: () => void
}

/** Full component props. */
export type WorkbenchNavActionProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<typeof NS>
  & InjectFace<WorkbenchNavInjected>

/**
 * Render one workbench nav entry.
 * @param props - the sidebar's `wide` state plus this entry's face.
 * @returns the labelled row (wide) or the rail glyph button.
 */
export function WorkbenchNavAction({ wide, t, target, useActive, activate }: WorkbenchNavActionProps) {
  const active = useActive()
  const label = t(TARGETS[target].label)
  const Icon = TARGETS[target].icon
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

  // The wide row carries its own visible label; the tooltip serves the rail.
  return wide
    ? button
    : <Tooltip label={label} delayMs={500}>{button}</Tooltip>
}

/** The Session Controller slice a nav entry reads and clears. */
export interface WorkbenchNavSessions {
  /** Clear the current Session selection, landing on the hero. */
  clear: () => void
  list: {
    subscribe: (listener: () => void) => () => void
    getSnapshot: () => { current: string | undefined }
  }
}

/**
 * Build one nav entry's face: `home` clears the session selection and closes
 * any page, a page target toggles that page, and the entry reports its own
 * active state from both stores.
 * @param sessions - the Session Controller service.
 * @param controller - the workbench controller owning page state.
 * @param target - the surface this entry activates.
 * @returns the inject face for the footer slot.
 */
export function navActionFace(
  sessions: WorkbenchNavSessions,
  controller: WorkbenchController,
  target: WorkbenchNavTarget,
): WorkbenchNavInjected {
  const subscribe = (listener: () => void): (() => void) => {
    const stopSessions = sessions.list.subscribe(listener)
    const stopPages = controller.pages.subscribe(listener)
    return () => {
      stopSessions()
      stopPages()
    }
  }
  const active = (): boolean => target !== 'home'
    ? controller.pages.getSnapshot().open === target
    : controller.pages.getSnapshot().open === null && sessions.list.getSnapshot().current === undefined
  return {
    target,
    useActive: () => useSyncExternalStore(subscribe, active),
    activate: () => {
      if (target === 'home') {
        controller.closePage()
        sessions.clear()
        return
      }
      controller.togglePage(target)
    },
  }
}
