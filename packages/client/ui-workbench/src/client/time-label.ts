/**
 * Localize a dated row's trailing relative time through the workbench
 * dictionary. The bucketing itself belongs to ui-primitives so two surfaces
 * naming the same moment agree; the words stay here, per locale-owned copy.
 */
import { relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

/**
 * Read one row's trailing relative time.
 * @param at - epoch ms of the dated moment.
 * @param now - the current instant, epoch ms.
 * @param t - namespace-bound translate.
 * @returns the bucket's localized label.
 */
export function timeLabel(at: number, now: number, t: TranslateNS<'workbench'>): string {
  const { unit, n } = relativeTime(at, now)
  return unit === 'now' ? t('task.time.now') : t(`task.time.${unit}`, { n })
}
