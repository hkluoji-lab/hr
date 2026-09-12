/**
 * The month report page: the current month's task tally beside the credits
 * balance, the grant form, and the recent ledger. Granting posts to the host
 * Remote and refreshes both the balance and the ledger from its answer, so the
 * surface never re-derives what the host already decided.
 */
import { useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { timeLabel } from '../time-label.ts'
import type { LedgerState, MonthReport } from '../workbench-store.ts'
import css from './WorkbenchPages.module.css'

/** Longest grant reason the host accepts; the input clamps to it. */
const MAX_REASON = 200

/** Everything the report page renders from. */
export interface ReportPageProps {
  /** Bounded ledger page and its read lifecycle. */
  ledger: LedgerState
  /** The month's task and credits tally. */
  report: MonthReport
  /** Persisted balance, or null when the host composes no workbench service. */
  credits: number | null
  /** Reference instant for the ledger's relative-time labels. */
  now: number
  /** Grant points; resolves to the host failure message, or null on success. */
  onGrant: (amount: number, reason: string) => Promise<string | null>
  /** Namespace-bound translate. */
  t: TranslateNS<'workbench'>
}

/** One metric tile. */
function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className={css.metric}>
      <span className={css.metricValue}>{value}</span>
      <span className={css.metricLabel}>{label}</span>
    </div>
  )
}

/**
 * Render the month report.
 * @param props - the ledger, the tally, the balance, and the grant action.
 * @returns the metrics, the grant form, and the ledger list.
 */
export function ReportPage({ ledger, report, credits, now, onGrant, t }: ReportPageProps) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (): Promise<void> => {
    const parsed = Number(amount)
    if (!Number.isInteger(parsed) || parsed <= 0 || reason.trim().length === 0) {
      setError(t('report.grant.invalid'))
      return
    }
    setPending(true)
    const failure = await onGrant(parsed, reason.trim())
    setPending(false)
    if (failure !== null) {
      setError(t('report.grant.failed', { message: failure }))
      return
    }
    setError(null)
    setAmount('')
    setReason('')
  }

  return (
    <>
      <div className={css.metrics}>
        <Metric value={report.total} label={t('report.metric.tasks')} />
        <Metric value={report.running} label={t('hall.status.running')} />
        <Metric value={report.done} label={t('hall.status.done')} />
        <Metric value={report.granted} label={t('report.metric.granted')} />
      </div>

      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('report.grant.title')}</h3>
        {credits !== null && (
          <p className={css.balance}>
            {t('report.balance')}
            <span className={css.balanceValue}>{credits}</span>
          </p>
        )}
        <form className={css.form} onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <label className={css.field}>
            {t('report.grant.amount')}
            <Input
              type="number"
              min={1}
              value={amount}
              disabled={pending}
              onChange={(event) => { setAmount(event.currentTarget.value) }}
            />
          </label>
          <label className={css.field}>
            {t('report.grant.reason')}
            <Input
              type="text"
              maxLength={MAX_REASON}
              value={reason}
              disabled={pending}
              onChange={(event) => { setReason(event.currentTarget.value) }}
            />
          </label>
          <Button type="submit" variant="primary" disabled={pending}>{t('report.grant.submit')}</Button>
        </form>
        {error !== null && <p className={css.formError} role="alert">{error}</p>}
      </section>

      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('report.ledger.title')}</h3>
        {ledger.entries.length === 0
          ? <p className={css.empty}>{t('report.ledger.empty')}</p>
          : (
            <ul className={css.ledgerList}>
              {ledger.entries.map(entry => (
                <li key={entry.id} className={css.ledgerRow}>
                  <span className={css.ledgerAmount}>+{entry.amount}</span>
                  <span className={css.ledgerReason}>{entry.reason}</span>
                  <span className={css.ledgerTime}>{timeLabel(entry.at, now, t)}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  )
}
