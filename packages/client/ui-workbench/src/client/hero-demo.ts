/**
 * Placeholder content for the hero's right-side cards. The bounty balance
 * reads the host credits service when a deployment composes one; the
 * month-left figure and progress rows have no backing service yet, so they
 * reproduce the design mock as typed placeholders pending that data seam.
 */
import type { WorkbenchKey } from './locales.ts'

/** Bounty card fallback: 87,420 points left this month. */
export const DEMO_CREDITS_MONTH_LEFT = 87420

/** One progress bar placeholder. */
export interface DemoProgress {
  /** Locale key of the flow name. */
  readonly labelKey: WorkbenchKey
  /** Completion percent, 0-100. */
  readonly percent: number
}

/** The three progress rows in design order. */
export const DEMO_PROGRESS: readonly DemoProgress[] = [
  { labelKey: 'right.progress.secretary', percent: 60 },
  { labelKey: 'right.progress.finance', percent: 30 },
  { labelKey: 'right.progress.legal', percent: 90 },
]
