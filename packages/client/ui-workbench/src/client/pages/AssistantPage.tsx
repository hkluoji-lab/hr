/**
 * The task assistant page: write a brief, optionally assign it to one team
 * member, and start the session that runs it.
 *
 * The session starts blank — the Workspace navigation service creates or
 * reuses it — and the controller submits the brief as that session's first
 * user message, so the form owns only the two choices it collects. The picker
 * presents the company's role roster (the same `roleMembers` fold the hero and
 * the team page show), so mode and other non-role presets are never assignable
 * here.
 */
import { useState } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { memberDotState, roleMembers, type WorkbenchState } from '../workbench-store.ts'
import css from './WorkbenchPages.module.css'

/** Longest brief the page submits; the textarea clamps to it. */
const MAX_BRIEF = 4000

/** Everything the assistant page renders from. */
export interface AssistantPageProps {
  /** Roster snapshot shared with the hero dashboard. */
  state: WorkbenchState
  /** Start a session for the brief, composed for one member's preset. */
  onAssign: (presetId: string | undefined, brief: string) => void
  /** Namespace-bound translate. */
  t: TranslateNS<'workbench'>
}

/**
 * Render the task assistant page.
 * @param props - the roster snapshot plus the assign action.
 * @returns the brief form with its member picker.
 */
export function AssistantPage({ state, onAssign, t }: AssistantPageProps) {
  const [brief, setBrief] = useState('')
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const trimmed = brief.trim()
  const roster = roleMembers(state.members)

  return (
    <form
      className={css.assistant}
      onSubmit={(event) => {
        event.preventDefault()
        if (trimmed.length > 0) onAssign(selected, trimmed)
      }}
    >
      <p className={css.assistantIntro}>{t('assistant.subtitle')}</p>
      <label className={css.field}>
        {t('assistant.brief')}
        <textarea
          className={css.briefInput}
          rows={6}
          maxLength={MAX_BRIEF}
          value={brief}
          placeholder={t('assistant.briefPlaceholder')}
          onChange={(event) => { setBrief(event.currentTarget.value) }}
        />
      </label>
      <div className={css.field}>
        {t('assistant.member')}
        <div className={css.memberRow}>
          <button
            type="button"
            className={css.memberChip}
            aria-pressed={selected === undefined}
            onClick={() => { setSelected(undefined) }}
          >
            {t('hall.defaultTeam')}
          </button>
          {roster.map(member => (
            <button
              key={member.id}
              type="button"
              className={css.memberChip}
              aria-pressed={selected === member.id}
              disabled={member.state === 'offline'}
              title={member.description || member.name}
              onClick={() => { setSelected(member.id) }}
            >
              <StateDot state={memberDotState(member.state)} />
              <span>{member.name}</span>
            </button>
          ))}
        </div>
        {roster.length === 0 && <p className={css.memberEmpty}>{t('assistant.empty')}</p>}
      </div>
      <div className={css.submitRow}>
        <Button type="submit" variant="primary" disabled={trimmed.length === 0}>
          {t('assistant.submit')}
        </Button>
      </div>
    </form>
  )
}
