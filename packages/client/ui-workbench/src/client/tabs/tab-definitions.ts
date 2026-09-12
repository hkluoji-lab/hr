/**
 * Stage one of the workbench's right-Sidebar contribution: what the four
 * session-scoped tab types ARE — session deliverables, subtask progress, the
 * deployment's credits, and the AI team's live state.
 *
 * All four are pages, not viewers: they claim no address. The deliverables
 * page opens files through `tabActions.openResource`; the progress page
 * navigates to child Sessions through the Session Controller. Their bodies
 * register in the keyed `sidebar.right.pane.tab` seat under these ids.
 */
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import {
  IconAgentPresetOutline16, IconBranchOutline16, IconDataOutline16, IconGoalOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '../locales.ts'

/** Deliverables tab kind this package owns. */
export const DELIVERABLES_KIND = 'workbench-deliverables'

/** Progress tab kind this package owns. */
export const PROGRESS_KIND = 'workbench-progress'

/** Credits tab kind this package owns. */
export const CREDITS_KIND = 'workbench-credits'

/** Team-status tab kind this package owns. */
export const TEAM_STATUS_KIND = 'workbench-team-status'

/** Body registration key of the deliverables tab. */
export const DELIVERABLES_ID = '@deepseek-ai/dsh-client-ui-workbench/deliverables'

/** Body registration key of the progress tab. */
export const PROGRESS_ID = '@deepseek-ai/dsh-client-ui-workbench/progress'

/** Body registration key of the credits tab. */
export const CREDITS_ID = '@deepseek-ai/dsh-client-ui-workbench/credits'

/** Body registration key of the team-status tab. */
export const TEAM_STATUS_ID = '@deepseek-ai/dsh-client-ui-workbench/team-status'

/**
 * The deliverables type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function deliverablesDefinition(t: TranslateNS<'workbench'>): SidebarRightTabDefinition {
  return {
    id: DELIVERABLES_ID,
    kind: DELIVERABLES_KIND,
    priority: 'builtin',
    title: () => t('tab.deliverables.type'),
    guide: [{
      order: 110,
      title: () => t('tab.deliverables.guide.title'),
      description: () => t('tab.deliverables.guide.description'),
      icon: IconDataOutline16,
    }],
  }
}

/**
 * The subtask-progress type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function progressDefinition(t: TranslateNS<'workbench'>): SidebarRightTabDefinition {
  return {
    id: PROGRESS_ID,
    kind: PROGRESS_KIND,
    priority: 'builtin',
    title: () => t('tab.progress.type'),
    guide: [{
      order: 111,
      title: () => t('tab.progress.guide.title'),
      description: () => t('tab.progress.guide.description'),
      icon: IconBranchOutline16,
    }],
  }
}

/**
 * The deployment-credits type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function creditsDefinition(t: TranslateNS<'workbench'>): SidebarRightTabDefinition {
  return {
    id: CREDITS_ID,
    kind: CREDITS_KIND,
    priority: 'builtin',
    title: () => t('tab.credits.type'),
    guide: [{
      order: 112,
      title: () => t('tab.credits.guide.title'),
      description: () => t('tab.credits.guide.description'),
      icon: IconGoalOutline16,
    }],
  }
}

/**
 * The AI-team-status type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function teamStatusDefinition(t: TranslateNS<'workbench'>): SidebarRightTabDefinition {
  return {
    id: TEAM_STATUS_ID,
    kind: TEAM_STATUS_KIND,
    priority: 'builtin',
    title: () => t('tab.team.type'),
    guide: [{
      order: 113,
      title: () => t('tab.team.guide.title'),
      description: () => t('tab.team.guide.description'),
      icon: IconAgentPresetOutline16,
    }],
  }
}
