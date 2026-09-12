/**
 * The secretary-company clients page (stage-1 SOP): the follow-up center
 * (S-FOLLOW-01), the client master (S-CORE-01), the statutory-filing
 * obligation ledger (S-COMPL-01), the current year's filing schedule, and the
 * signature-delivery ledger (S-DELIV-01). Every read and write goes through
 * the host workbench Remote; the page only validates field presence locally
 * and maps the host's wire error codes to friendly copy.
 *
 * The follow-up center folds open deliveries past their chase rung and open
 * obligations inside a reminder rung into one queue, most urgent rung first;
 * each row pre-fills the host's chase message and the rung's suggested
 * channel, and logging a reminder sends both back to the host for storage.
 * The schedule folds ledger rows due in the year together with one projected
 * NAR1 row per client whose incorporation anniversary has no recorded filing
 * yet, so the page never derives dates the host already decided. Reminder
 * tiers (d30/d15/d7/d1/overdue) render as badges beside each due date, and
 * delivery rows carry the follow-up ladder (nudge T+3 / chase T+7 / escalate
 * T+14) the 催办 workflow acts on.
 */
import { useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type {
  WorkbenchClientCreate, WorkbenchDelivery, WorkbenchDeliveryChannel, WorkbenchDeliveryStatus, WorkbenchDueTier,
  WorkbenchFollowUp, WorkbenchFollowUpCreate, WorkbenchFollowUpTier, WorkbenchObligation, WorkbenchObligationCreate,
  WorkbenchObligationKind, WorkbenchReminderTier,
} from '@deepseek-ai/dsh-workbench/types'
import type { ClientsState, MutationOutcome } from '../workbench-store.ts'
import type { WorkbenchKey } from '../locales.ts'
import css from './WorkbenchPages.module.css'

/** Everything the clients page renders from. */
export interface ClientsPageProps {
  /** Clients-page snapshot owned by the controller. */
  clients: ClientsState
  /** Create one client master row. */
  onAddClient: (payload: WorkbenchClientCreate) => Promise<MutationOutcome>
  /** Remove one client master row; its obligations go with it. */
  onRemoveClient: (id: string) => Promise<MutationOutcome>
  /** Record one filing obligation against a client. */
  onAddObligation: (payload: WorkbenchObligationCreate) => Promise<MutationOutcome>
  /** Move one obligation between `open` and `submitted`. */
  onMarkObligation: (id: string, status: 'open' | 'submitted') => Promise<MutationOutcome>
  /** Remove one obligation row. */
  onRemoveObligation: (id: string) => Promise<MutationOutcome>
  /** Record one signature delivery against a client. */
  onAddDelivery: (payload: { clientId: string; title: string; channel: WorkbenchDeliveryChannel }) => Promise<MutationOutcome>
  /** Move one delivery along its lifecycle. */
  onMarkDelivery: (id: string, status: WorkbenchDeliveryStatus) => Promise<MutationOutcome>
  /** Remove one delivery row. */
  onRemoveDelivery: (id: string) => Promise<MutationOutcome>
  /** Log one follow-up reminder against an open target. */
  onRecordFollowUp: (payload: WorkbenchFollowUpCreate) => Promise<MutationOutcome>
  /** Namespace-bound translate. */
  t: TranslateNS<'workbench'>
}

/** `YYYY-MM-DD`, the date format the host storage schema enforces. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Filing kinds the ledger records, in display order. */
const KINDS: readonly WorkbenchObligationKind[] = ['NAR1', 'AB56', 'PTR', 'ITR']

/** Channels a delivery can name, in display order. */
const CHANNELS: readonly WorkbenchDeliveryChannel[] = ['email', 'wechat', 'whatsapp']

/** Reminder-tier label keys, one per tier the host derives. */
const TIER_KEYS: Record<WorkbenchDueTier, WorkbenchKey> = {
  ok: 'clients.tier.ok',
  d30: 'clients.tier.d30',
  d15: 'clients.tier.d15',
  d7: 'clients.tier.d7',
  d1: 'clients.tier.d1',
  overdue: 'clients.tier.overdue',
}

/** Follow-up-tier label keys, one per tier the host derives. */
const FOLLOW_UP_KEYS: Record<WorkbenchFollowUpTier, WorkbenchKey> = {
  fresh: 'clients.followUp.fresh',
  nudge: 'clients.followUp.nudge',
  chase: 'clients.followUp.chase',
  escalate: 'clients.followUp.escalate',
  done: 'clients.followUp.done',
}

/**
 * Reminder-rung label keys for the follow-up center: the delivery rungs reuse
 * the ladder labels, the obligation rungs reuse the due-tier labels, so both
 * ladders read with one vocabulary.
 */
const REMINDER_TIER_KEYS: Record<WorkbenchReminderTier, WorkbenchKey> = {
  nudge: 'clients.followUp.nudge',
  chase: 'clients.followUp.chase',
  escalate: 'clients.followUp.escalate',
  d30: 'clients.tier.d30',
  d15: 'clients.tier.d15',
  d7: 'clients.tier.d7',
  d1: 'clients.tier.d1',
  overdue: 'clients.tier.overdue',
}

/** Next lifecycle step per status; `returned` closes the row, so it maps to null. */
const NEXT_STEP: Record<WorkbenchDeliveryStatus, { next: WorkbenchDeliveryStatus; label: WorkbenchKey } | null> = {
  sent: { next: 'viewed', label: 'clients.delivery.advance.viewed' },
  viewed: { next: 'signed', label: 'clients.delivery.advance.signed' },
  signed: { next: 'returned', label: 'clients.delivery.advance.returned' },
  returned: null,
}

/**
 * Render the clients page.
 * @param props - the snapshot plus the follow-up, master, ledger, and
 *   delivery actions.
 * @returns the follow-up center, the schedule, the client master with its
 *   creation form, the obligation ledger with its recording form, and the
 *   signature-delivery ledger with its recording form.
 */
export function ClientsPage({
  clients, onAddClient, onRemoveClient, onAddObligation, onMarkObligation, onRemoveObligation,
  onAddDelivery, onMarkDelivery, onRemoveDelivery, onRecordFollowUp, t,
}: ClientsPageProps) {
  const [nameCn, setNameCn] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [brNo, setBrNo] = useState('')
  const [crNo, setCrNo] = useState('')
  const [incorporationDate, setIncorporationDate] = useState('')
  const [registeredAddress, setRegisteredAddress] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactWechat, setContactWechat] = useState('')
  const [contactWhatsapp, setContactWhatsapp] = useState('')
  const [addPending, setAddPending] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [obligationClientId, setObligationClientId] = useState('')
  const [obligationKind, setObligationKind] = useState<WorkbenchObligationKind>('NAR1')
  const [periodLabel, setPeriodLabel] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [recordPending, setRecordPending] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)

  const [deliveryClientId, setDeliveryClientId] = useState('')
  const [deliveryTitle, setDeliveryTitle] = useState('')
  const [deliveryChannel, setDeliveryChannel] = useState<WorkbenchDeliveryChannel>('email')
  const [deliveryPending, setDeliveryPending] = useState(false)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  const resetClientForm = (): void => {
    setNameCn('')
    setNameEn('')
    setBrNo('')
    setCrNo('')
    setIncorporationDate('')
    setRegisteredAddress('')
    setContactEmail('')
    setContactWechat('')
    setContactWhatsapp('')
  }

  const submitClient = async (): Promise<void> => {
    const trimmed = nameCn.trim()
    if (trimmed.length === 0 || !DATE_PATTERN.test(incorporationDate)) {
      setAddError(t('clients.add.invalid'))
      return
    }
    setAddPending(true)
    const outcome = await onAddClient({
      nameCn: trimmed,
      ...(nameEn.trim() !== '' && { nameEn: nameEn.trim() }),
      ...(brNo.trim() !== '' && { brNo: brNo.trim() }),
      ...(crNo.trim() !== '' && { crNo: crNo.trim() }),
      incorporationDate,
      ...(registeredAddress.trim() !== '' && { registeredAddress: registeredAddress.trim() }),
      ...(contactEmail.trim() !== '' && { contactEmail: contactEmail.trim() }),
      ...(contactWechat.trim() !== '' && { contactWechat: contactWechat.trim() }),
      ...(contactWhatsapp.trim() !== '' && { contactWhatsapp: contactWhatsapp.trim() }),
    })
    setAddPending(false)
    if (!outcome.ok) {
      setAddError(t('clients.add.failed', { message: outcome.error }))
      return
    }
    setAddError(null)
    resetClientForm()
  }

  const submitObligation = async (): Promise<void> => {
    const trimmed = periodLabel.trim()
    if (obligationClientId === '' || trimmed.length === 0 || !DATE_PATTERN.test(dueDate)) {
      setRecordError(t('clients.obligations.record.invalid'))
      return
    }
    setRecordPending(true)
    const outcome = await onAddObligation({
      clientId: obligationClientId,
      kind: obligationKind,
      periodLabel: trimmed,
      dueDate,
    })
    setRecordPending(false)
    if (!outcome.ok) {
      setRecordError(t('clients.obligations.record.failed', { message: outcome.error }))
      return
    }
    setRecordError(null)
    setPeriodLabel('')
    setDueDate('')
  }

  const submitDelivery = async (): Promise<void> => {
    const trimmed = deliveryTitle.trim()
    if (deliveryClientId === '' || trimmed.length === 0) {
      setDeliveryError(t('clients.delivery.record.invalid'))
      return
    }
    setDeliveryPending(true)
    const outcome = await onAddDelivery({
      clientId: deliveryClientId,
      title: trimmed,
      channel: deliveryChannel,
    })
    setDeliveryPending(false)
    if (!outcome.ok) {
      setDeliveryError(t('clients.delivery.record.failed', { message: outcome.error }))
      return
    }
    setDeliveryError(null)
    setDeliveryTitle('')
  }

  return (
    <>
      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('clients.followUpCenter.title')}</h3>
        {clients.status !== 'ready'
          ? (
            <p className={css.empty}>
              {clients.status === 'error'
                ? t('clients.read.error', { message: clients.error ?? '' })
                : t('clients.read.loading')}
            </p>
          )
          : clients.followUps.length === 0
            ? <p className={css.empty}>{t('clients.followUpCenter.empty')}</p>
            : (
              <ul className={css.followUpList}>
                {clients.followUps.map(followUp => (
                  <FollowUpRow
                    // Rung in the key: a rung change means a new draft and a
                    // new suggested channel, so the row's editable state resets.
                    key={`${followUp.id}:${followUp.tier}`}
                    followUp={followUp}
                    onRecord={onRecordFollowUp}
                    t={t}
                  />
                ))}
              </ul>
            )}
      </section>

      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('clients.schedule.title', { year: clients.schedule?.year ?? '' })}</h3>
        {renderSchedule(clients, t)}
      </section>

      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('clients.master.title')}</h3>
        {clients.status !== 'ready'
          ? (
            <p className={css.empty}>
              {clients.status === 'error'
                ? t('clients.read.error', { message: clients.error ?? '' })
                : t('clients.read.loading')}
            </p>
          )
          : clients.clients.length === 0
            ? <p className={css.empty}>{t('clients.master.empty')}</p>
            : (
              <ul className={css.ledgerList}>
                {clients.clients.map(client => (
                  <li key={client.id} className={css.clientRow}>
                    <span className={css.clientName}>
                      {client.nameCn}
                      {client.nameEn !== undefined && <span className={css.clientAlt}>{client.nameEn}</span>}
                    </span>
                    <span className={css.clientMeta}>
                      {[
                        client.brNo !== undefined && `BR ${client.brNo}`,
                        client.crNo !== undefined && `CR ${client.crNo}`,
                        t('clients.master.incorporation', { date: client.incorporationDate }),
                      ].filter(Boolean).join(' · ')}
                    </span>
                    <span className={`${css.badge} ${css[client.complianceStatus]}`}>
                      {t(`clients.compliance.${client.complianceStatus}`)}
                    </span>
                    <span className={css.clientMeta}>
                      {client.openObligations > 0
                        ? t('clients.master.openObligations', { n: client.openObligations })
                        : t('clients.master.noObligations')}
                      {client.openDeliveries > 0
                        && ` · ${t('clients.master.openDeliveries', { n: client.openDeliveries })}`}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => { void onRemoveClient(client.id) }}
                    >
                      {t('clients.master.remove')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
        <div className={css.clientForm}>
          <label className={css.field}>
            {t('clients.add.nameCn')}
            <input
              className={css.phoneInput}
              type="text"
              maxLength={120}
              placeholder={t('clients.add.nameCnPlaceholder')}
              value={nameCn}
              onChange={(event) => { setNameCn(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            {t('clients.add.incorporation')}
            <input
              className={css.phoneInput}
              type="date"
              value={incorporationDate}
              onChange={(event) => { setIncorporationDate(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            {t('clients.add.nameEn')}
            <input
              className={css.phoneInput}
              type="text"
              maxLength={120}
              value={nameEn}
              onChange={(event) => { setNameEn(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            {t('clients.add.brNo')}
            <input
              className={css.phoneInput}
              type="text"
              maxLength={120}
              value={brNo}
              onChange={(event) => { setBrNo(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            {t('clients.add.crNo')}
            <input
              className={css.phoneInput}
              type="text"
              maxLength={120}
              value={crNo}
              onChange={(event) => { setCrNo(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            {t('clients.add.address')}
            <input
              className={css.phoneInput}
              type="text"
              maxLength={120}
              value={registeredAddress}
              onChange={(event) => { setRegisteredAddress(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            {t('clients.add.email')}
            <input
              className={css.phoneInput}
              type="email"
              maxLength={120}
              value={contactEmail}
              onChange={(event) => { setContactEmail(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            {t('clients.add.wechat')}
            <input
              className={css.phoneInput}
              type="text"
              maxLength={120}
              value={contactWechat}
              onChange={(event) => { setContactWechat(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            {t('clients.add.whatsapp')}
            <input
              className={css.phoneInput}
              type="text"
              maxLength={120}
              value={contactWhatsapp}
              onChange={(event) => { setContactWhatsapp(event.target.value) }}
            />
          </label>
        </div>
        <div className={css.submitRow}>
          <Button
            type="button"
            variant="primary"
            disabled={nameCn.trim().length === 0 || !DATE_PATTERN.test(incorporationDate) || addPending}
            onClick={() => { void submitClient() }}
          >
            {addPending ? t('clients.add.submitting') : t('clients.add.submit')}
          </Button>
        </div>
        {addError !== null && <p className={css.formError} role="alert">{addError}</p>}
      </section>

      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('clients.obligations.title')}</h3>
        {clients.status === 'ready' && clients.obligations.length === 0
          ? <p className={css.empty}>{t('clients.obligations.empty')}</p>
          : clients.status === 'ready' && (
            <ul className={css.ledgerList}>
              {clients.obligations.map((obligation: WorkbenchObligation) => (
                <li key={obligation.id} className={css.obligationRow}>
                  <span className={css.clientName}>{obligation.clientNameCn}</span>
                  <span className={css.kindBadge}>{obligation.kind}</span>
                  <span className={css.clientMeta}>{obligation.periodLabel}</span>
                  <span className={css.clientMeta}>
                    {t('clients.obligations.due', { date: obligation.dueDate })}
                  </span>
                  <span className={`${css.badge} ${css[obligation.dueTier]}`}>
                    {t(TIER_KEYS[obligation.dueTier])}
                  </span>
                  <span className={`${css.badge} ${css[obligation.status]}`}>
                    {t(`clients.obligationStatus.${obligation.status}`)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      void onMarkObligation(obligation.id, obligation.status === 'open' ? 'submitted' : 'open')
                    }}
                  >
                    {obligation.status === 'open'
                      ? t('clients.obligations.mark')
                      : t('clients.obligations.reopen')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { void onRemoveObligation(obligation.id) }}
                  >
                    {t('clients.obligations.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        <div className={css.clientForm}>
          <label className={css.field}>
            {t('clients.obligations.record.client')}
            <select
              className={css.phoneInput}
              value={obligationClientId}
              onChange={(event) => { setObligationClientId(event.target.value) }}
            >
              <option value="">{t('clients.obligations.record.clientPlaceholder')}</option>
              {clients.clients.map(client => (
                <option key={client.id} value={client.id}>{client.nameCn}</option>
              ))}
            </select>
          </label>
          <label className={css.field}>
            {t('clients.obligations.record.kind')}
            <select
              className={css.phoneInput}
              value={obligationKind}
              onChange={(event) => { setObligationKind(event.target.value as WorkbenchObligationKind) }}
            >
              {KINDS.map(kind => (
                <option key={kind} value={kind}>{t(`clients.kind.${kind}`)}</option>
              ))}
            </select>
          </label>
          <label className={css.field}>
            {t('clients.obligations.record.period')}
            <input
              className={css.phoneInput}
              type="text"
              maxLength={32}
              placeholder={t('clients.obligations.record.periodPlaceholder')}
              value={periodLabel}
              onChange={(event) => { setPeriodLabel(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            {t('clients.obligations.record.due')}
            <input
              className={css.phoneInput}
              type="date"
              value={dueDate}
              onChange={(event) => { setDueDate(event.target.value) }}
            />
          </label>
        </div>
        <div className={css.submitRow}>
          <Button
            type="button"
            variant="primary"
            disabled={obligationClientId === ''
              || periodLabel.trim().length === 0
              || !DATE_PATTERN.test(dueDate)
              || recordPending}
            onClick={() => { void submitObligation() }}
          >
            {recordPending ? t('clients.obligations.record.submitting') : t('clients.obligations.record.submit')}
          </Button>
        </div>
        {recordError !== null && <p className={css.formError} role="alert">{recordError}</p>}
      </section>

      <section className={css.section}>
        <h3 className={css.sectionTitle}>{t('clients.delivery.title')}</h3>
        {clients.status === 'ready' && clients.deliveries.length === 0
          ? <p className={css.empty}>{t('clients.delivery.empty')}</p>
          : clients.status === 'ready' && (
            <ul className={css.ledgerList}>
              {clients.deliveries.map((delivery: WorkbenchDelivery) => {
                const step = NEXT_STEP[delivery.status]
                return (
                  <li key={delivery.id} className={css.deliveryRow}>
                    <span className={css.clientName}>{delivery.clientNameCn}</span>
                    <span className={css.deliveryTitle}>{delivery.title}</span>
                    <span className={css.channelBadge}>{t(`clients.channel.${delivery.channel}`)}</span>
                    <span className={`${css.badge} ${css[delivery.status]}`}>
                      {t(`clients.deliveryStatus.${delivery.status}`)}
                    </span>
                    <span className={css.clientMeta}>
                      {delivery.daysSinceSent === 0
                        ? t('clients.delivery.sentToday')
                        : t('clients.delivery.days', { n: delivery.daysSinceSent })}
                    </span>
                    <span className={`${css.badge} ${css[delivery.followUpTier]}`}>
                      {t(FOLLOW_UP_KEYS[delivery.followUpTier])}
                    </span>
                    {step !== null && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => { void onMarkDelivery(delivery.id, step.next) }}
                      >
                        {t(step.label)}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => { void onRemoveDelivery(delivery.id) }}
                    >
                      {t('clients.delivery.remove')}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        <div className={css.clientForm}>
          <label className={css.field}>
            {t('clients.delivery.record.client')}
            <select
              className={css.phoneInput}
              value={deliveryClientId}
              onChange={(event) => { setDeliveryClientId(event.target.value) }}
            >
              <option value="">{t('clients.delivery.record.clientPlaceholder')}</option>
              {clients.clients.map(client => (
                <option key={client.id} value={client.id}>{client.nameCn}</option>
              ))}
            </select>
          </label>
          <label className={css.field}>
            {t('clients.delivery.record.title')}
            <input
              className={css.phoneInput}
              type="text"
              maxLength={120}
              placeholder={t('clients.delivery.record.titlePlaceholder')}
              value={deliveryTitle}
              onChange={(event) => { setDeliveryTitle(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            {t('clients.delivery.record.channel')}
            <select
              className={css.phoneInput}
              value={deliveryChannel}
              onChange={(event) => { setDeliveryChannel(event.target.value as WorkbenchDeliveryChannel) }}
            >
              {CHANNELS.map(channel => (
                <option key={channel} value={channel}>{t(`clients.channel.${channel}`)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className={css.submitRow}>
          <Button
            type="button"
            variant="primary"
            disabled={deliveryClientId === '' || deliveryTitle.trim().length === 0 || deliveryPending}
            onClick={() => { void submitDelivery() }}
          >
            {deliveryPending ? t('clients.delivery.record.submitting') : t('clients.delivery.record.submit')}
          </Button>
        </div>
        {deliveryError !== null && <p className={css.formError} role="alert">{deliveryError}</p>}
      </section>
    </>
  )
}

/**
 * Render the current year's schedule, or its loading/error/empty state.
 * @param clients - the snapshot carrying the schedule.
 * @param t - namespace-bound translate.
 * @returns the schedule list, a status line, or null while not ready.
 */
function renderSchedule(clients: ClientsState, t: TranslateNS<'workbench'>): ReactNode {
  if (clients.schedule === null) {
    if (clients.status === 'error') return <p className={css.empty}>{t('clients.read.error', { message: clients.error ?? '' })}</p>
    if (clients.status !== 'ready') return <p className={css.empty}>{t('clients.read.loading')}</p>
    return <p className={css.empty}>{t('clients.schedule.empty')}</p>
  }
  if (clients.schedule.rows.length === 0) return <p className={css.empty}>{t('clients.schedule.empty')}</p>
  return (
    <ul className={css.ledgerList}>
      {clients.schedule.rows.map(row => (
        <li key={`${row.clientId}-${row.kind}-${row.periodLabel}-${row.dueDate}`} className={css.scheduleRow}>
          <span className={css.clientName}>{row.clientNameCn}</span>
          <span className={css.kindBadge}>{row.kind}</span>
          <span className={css.clientMeta}>{row.periodLabel}</span>
          <span className={css.clientMeta}>{t('clients.obligations.due', { date: row.dueDate })}</span>
          <span className={`${css.badge} ${css[row.dueTier]}`}>{t(TIER_KEYS[row.dueTier])}</span>
          <span className={css.clientMeta}>
            {row.source === 'derived' ? t('clients.source.derived') : t('clients.source.ledger')}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * One follow-up-center row: the target's facts with its rung badge, the
 * editable chase message pre-filled with the host's draft, the channel picker
 * pre-set to the rung's suggestion, and the logging action. The parent keys
 * the row by id and rung, so a rung change resets this local state to the new
 * draft.
 * @param props - the queue row, the logging action, and translate.
 * @returns the row element.
 */
function FollowUpRow({ followUp, onRecord, t }: {
  followUp: WorkbenchFollowUp
  onRecord: (payload: WorkbenchFollowUpCreate) => Promise<MutationOutcome>
  t: TranslateNS<'workbench'>
}) {
  const [message, setMessage] = useState(followUp.message)
  const [channel, setChannel] = useState<WorkbenchDeliveryChannel>(followUp.suggestedChannel)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    setPending(true)
    const outcome = await onRecord({
      targetKind: followUp.targetKind,
      targetId: followUp.targetId,
      channel,
      message: message.trim(),
    })
    setPending(false)
    if (!outcome.ok) {
      setError(t('clients.followUpCenter.failed', { message: outcome.error }))
      return
    }
    setError(null)
  }

  return (
    <li className={css.followUpRow}>
      <div className={css.followUpHead}>
        <span className={css.clientName}>{followUp.clientNameCn}</span>
        <span className={css.kindBadge}>{t(`clients.followUpCenter.kind.${followUp.targetKind}`)}</span>
        <span className={css.deliveryTitle}>{followUp.title}</span>
        <span className={`${css.badge} ${css[followUp.tier]}`}>{t(REMINDER_TIER_KEYS[followUp.tier])}</span>
        <span className={css.clientMeta}>
          {followUp.dueDate === undefined
            ? t('clients.delivery.days', { n: followUp.days })
            : t('clients.obligations.due', { date: followUp.dueDate })}
        </span>
        {followUp.reminderCount > 0
          && <span className={css.clientMeta}>{t('clients.followUpCenter.reminders', { n: followUp.reminderCount })}</span>}
      </div>
      <div className={css.followUpBody}>
        <label className={css.field}>
          {t('clients.followUpCenter.message')}
          <textarea
            className={css.phoneInput}
            rows={2}
            maxLength={500}
            value={message}
            onChange={(event) => { setMessage(event.target.value) }}
          />
        </label>
        <label className={css.field}>
          {t('clients.followUpCenter.channel')}
          <select
            className={css.phoneInput}
            value={channel}
            onChange={(event) => { setChannel(event.target.value as WorkbenchDeliveryChannel) }}
          >
            {CHANNELS.map(option => (
              <option key={option} value={option}>{t(`clients.channel.${option}`)}</option>
            ))}
          </select>
        </label>
        <div className={css.followUpAction}>
          <Button
            type="button"
            variant="primary"
            disabled={pending || message.trim().length === 0}
            onClick={() => { void submit() }}
          >
            {pending ? t('clients.followUpCenter.submitting') : t('clients.followUpCenter.submit')}
          </Button>
        </div>
      </div>
      {error !== null && <p className={css.formError} role="alert">{error}</p>}
    </li>
  )
}
