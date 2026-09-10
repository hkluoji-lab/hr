/**
 * The blank-session workbench dashboard: a time-aware greeting, a subtitle
 * counting the live AI team, four quick-action cards, and the agent-preset
 * roster rendered as team-member cards. Every member card starts a session
 * composed for that member; the dashboard renders the greeting and quick
 * actions even when the deployment composes no presets.
 */
import { useEffect } from 'react'
import {
  IconAgentPresetOutline16,
  IconDataOutline16,
  IconFolderOpenOutline16,
  IconPlusOutline16,
  IconSparkle16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
// Type-only: pulls the ui-conversation SlotMap merge (the hero dashboard seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { MemberCard } from './MemberCard.tsx'
import type { WorkbenchPageId, WorkbenchState } from './workbench-store.ts'
import { NS } from './locales.ts'
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

/** Greeting key by local hour: morning before 12, afternoon before 18. */
function greetingKey(hour: number): 'greeting.morning' | 'greeting.afternoon' | 'greeting.evening' {
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

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className={css.root} aria-label={t('team.title')}>
      <h2 className={css.greeting}>{t(greetingKey(new Date().getHours()))}</h2>
      <div className={css.subtitleRow}>
        <p className={css.subtitle}>
          {t('subtitle', { online: state.online + state.busy, busy: state.busy })}
        </p>
        {state.credits !== null && (
          <span className={css.credits}>
            <IconSparkle16 size={14} />
            <span className={css.creditsValue}>{state.credits}</span>
            <span className={css.creditsLabel}>{t('credits.label')}</span>
          </span>
        )}
      </div>

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

      <div className={css.teamHeader}>
        <span className={css.teamLine} />
        <span className={css.teamTitle}>{t('team.title')}</span>
        <span className={css.teamLine} />
      </div>

      {state.status === 'unavailable'
        ? <p className={css.teamEmpty}>{t('team.empty')}</p>
        : (
          <div className={css.memberGrid}>
            {state.members.map(member => (
              <MemberCard key={member.id} member={member} onStart={startWithPreset} t={t} />
            ))}
          </div>
        )}
    </section>
  )
}
