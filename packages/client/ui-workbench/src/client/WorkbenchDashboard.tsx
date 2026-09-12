/**
 * The blank-session workbench dashboard: a time-aware greeting with the user
 * name, a subtitle counting the day's work and the live AI team, four
 * quick-action cards, a task-stat strip, and the agent-preset roster rendered
 * as role member cards. Every role card starts a session composed for that
 * member; the dashboard renders the greeting and quick actions even when the
 * deployment composes no presets. On wide viewports the bounty/status/
 * progress/deliverables card stack fills the hero grid's second column
 * (HeroSideCards).
 */
import { useEffect, useRef } from 'react'
import {
  IconAgentPresetOutline16,
  IconDataOutline16,
  IconFolderOpenOutline16,
  IconPlusOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
// Type-only: pulls the ui-conversation SlotMap merge (the hero dashboard seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { MemberCard } from './MemberCard.tsx'
import { HeroSideCards } from './HeroSideCards.tsx'
import { roleMembers, type WorkbenchPageId, type WorkbenchState } from './workbench-store.ts'
import { NS, type WorkbenchKey } from './locales.ts'
import css from './WorkbenchDashboard.module.css'

/** Registration-side business face for the hero dashboard. */
export interface WorkbenchInjected {
  hooks: {
    /** Dashboard snapshot bound by the renderer as useWorkbench. */
    workbench: SnapshotStore<WorkbenchState>
  }
  /** Read the roster when the dashboard first renders. */
  load: () => Promise<void>
  /** Start a fresh task session with the deployment default composition. */
  startTask: () => void
  /** Start a session composed for one team member's preset. */
  startWithPreset: (id: string) => void
  /** Reveal the sidebar with the project/workspace browser. */
  viewProjects: () => void
  /** Open one frame-wide workbench page. */
  openPage: (page: WorkbenchPageId) => void
}

/** Full component props. */
export type WorkbenchDashboardProps =
  PropsRuntime<'conversation.hero.dashboard'>
  & PropsLocale<typeof NS>
  & InjectFace<WorkbenchInjected>

/** Greeting key by local hour: early morning, late morning, afternoon, evening. */
export type GreetingKey = 'greeting.early' | 'greeting.morning' | 'greeting.afternoon' | 'greeting.evening'

/** Map the local hour onto the four greeting segments; deep night greets as evening. */
function greetingKey(hour: number): GreetingKey {
  if (hour < 5) return 'greeting.evening'
  if (hour < 9) return 'greeting.early'
  if (hour < 12) return 'greeting.morning'
  if (hour < 18) return 'greeting.afternoon'
  return 'greeting.evening'
}

/** One quick-action card definition. */
interface QuickAction {
  readonly key: 'newTask' | 'callTeam' | 'viewProjects' | 'monthlyReport'
  readonly icon: typeof IconPlusOutline16
  readonly run: (handlers: Pick<WorkbenchDashboardProps, 'startTask' | 'viewProjects' | 'openPage'>) => void
}

/** The four shortcuts: start work, meet the team, browse projects, read the report. */
const QUICK_ACTIONS: readonly QuickAction[] = [
  { key: 'newTask', icon: IconPlusOutline16, run: ({ startTask }) => { startTask() } },
  { key: 'callTeam', icon: IconAgentPresetOutline16, run: ({ openPage }) => { openPage('team') } },
  { key: 'viewProjects', icon: IconFolderOpenOutline16, run: ({ viewProjects }) => { viewProjects() } },
  { key: 'monthlyReport', icon: IconDataOutline16, run: ({ openPage }) => { openPage('report') } },
]

/**
 * Render the hero workbench dashboard.
 * @param props - composed slot props.
 * @returns the dashboard element tree.
 */
export function WorkbenchDashboard({
  load, startTask, startWithPreset, viewProjects, openPage, useWorkbench, t,
}: WorkbenchDashboardProps) {
  const state = useWorkbench(snapshot => snapshot)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    void load()
  }, [load])

  // While this dashboard owns the blank-session hero, the conversation shell's
  // brand headline and workspace-chip row are core siblings with no opt-out
  // slot: hide them for this mount's lifetime and restore the inline value on
  // teardown. Starting a session unmounts the hero anyway; the cleanup covers
  // plugin/entry churn without leaving the core chrome permanently hidden.
  useEffect(() => {
    const slot = sectionRef.current?.parentElement
    if (!slot) return
    const chrome = [slot.previousElementSibling, slot.nextElementSibling]
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
    const previous = chrome.map(el => ({ el, display: el.style.display }))
    chrome.forEach((el) => { el.style.display = 'none' })
    return () => { previous.forEach(({ el, display }) => { el.style.display = display }) }
  }, [])

  const roster = roleMembers(state.members)
  const activeStaff = state.online + state.busy
  const stats: ReadonlyArray<{ key: WorkbenchKey; value: string }> = [
    { key: 'stat.today', value: String(state.todayCount) },
    { key: 'stat.running', value: String(state.runningCount) },
    { key: 'stat.done', value: String(state.doneCount) },
    { key: 'stat.active', value: `${activeStaff}/${state.members.length}` },
  ]

  return (
    <section ref={sectionRef} className={css.root} data-workbench-hero="" aria-label={t('team.brand')}>
      <div className={css.main}>
        <h2 className={css.greeting}>
          <span>{t(greetingKey(new Date().getHours()))}</span>
          <span className={css.userName}>{state.my.name ?? state.userName ?? t('greeting.name')}</span>
          {state.my.roles.length > 0 && (
            <span>{t('greeting.roles', { roles: state.my.roles.map(id => t(`nav.role.${id}`)).join(' · ') })}</span>
          )}
          <span>{t('greeting.suffix')}</span>
        </h2>
        <p className={css.subtitle}>
          {t('subtitle', { todo: state.todayCount, online: activeStaff })}
        </p>

        <div className={css.quickGrid}>
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.key}
                type="button"
                className={css.quickCard}
                onClick={() => { action.run({ startTask, viewProjects, openPage }) }}
              >
                <span className={css.quickIcon}><Icon size={18} /></span>
                <span className={css.quickLabel}>{t(`quick.${action.key}`)}</span>
              </button>
            )
          })}
        </div>

        <dl className={css.stats}>
          {stats.map(stat => (
            <div key={stat.key} className={css.stat}>
              <dt className={css.statLabel}>{t(stat.key)}</dt>
              <dd className={css.statValue}>{stat.value}</dd>
            </div>
          ))}
        </dl>

        <div className={css.teamHeader}>
          <span className={css.teamLine} />
          <span className={css.teamTitle}>{t('team.brand')}</span>
          <span className={css.teamLine} />
        </div>

        {state.status === 'unavailable'
          ? <p className={css.teamEmpty}>{t('team.empty')}</p>
          : (
            <div className={css.memberGrid}>
              {roster.map(member => (
                <MemberCard key={member.id} member={member} onStart={startWithPreset} t={t} />
              ))}
            </div>
          )}
      </div>

      <HeroSideCards state={state} t={t} />
    </section>
  )
}
