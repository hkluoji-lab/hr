# Agent Note: Workbench follow-up center over both ladders

Status: implemented

English | [中文](2026-09-12-workbench-follow-up-center.zh.md)

## Problem

The stage-1 SOP's follow-up skill (S-FOLLOW-01) is where the two prior ledgers meet: a delivery that has entered its chase rung (T+3/T+7/T+14) and an obligation that has entered a reminder rung (d30/d15/d7/d1/overdue) both need chasing today, but the secretary had to watch two separate sections on one page and nothing recorded that a chase happened — repeat follow-ups could double-send, and nobody could answer "how many times has this client been nudged". The workbench needed one folded chase queue over both ladders, a host-drafted message per rung (the SOP's 话术分档), and a logging action that records each reminder.

## Decision

**One `reminders` table extends the `workbench` domain in place, version 1 unchanged.** Each row stores `targetKind` (`delivery`/`obligation`), `targetId`, `tier`, `channel`, `message` (1–500 characters), and `createdAt`, keyed by random UUID. The reminder log is append-only history, not state: no read derives from a stored reminder except the per-target count and last-reminder timestamp.

**`followUps()` folds both ladders into one queue on the host.** Open deliveries whose `followUpTier` is a chase rung and open obligations whose `dueTier` is a reminder rung become rows keyed `targetKind:targetId`, joined with the client's current name. Each row carries the rung, the rung's suggested channel (`nudge` → whatsapp, `chase` → wechat, `escalate`/`d30`/`d15`/`overdue` → email, `d7`/`d1` → whatsapp — the SOP's fixed channel-per-rung mapping), the host-drafted Chinese message for that rung filled with the row's facts, the day count, and the reminders already logged. Rows sort by a fixed severity rank — `overdue` first, then `escalate`, `d1`, `chase`, `d7`, `d15`, `nudge`, `d30` — so the page reads as today's chase list; ties break by client name then title. The message copy is client-facing, so it stays Chinese regardless of the workbench UI locale.

**`recordFollowUp` re-derives the tier instead of trusting the caller.** The request names only the target plus optional channel/message overrides; the rung comes from today's date against the target's send/due date, so a logged reminder stays truthful even if the secretary answers days late. A target that has closed since the queue was rendered rejects with `workbench/follow-up-not-open`; one that has not entered its ladder yet rejects with `gateway/bad-request`; unknown ids reject with the owning ledger's code. Channel defaults to the rung's suggestion, message to the host's draft — both accept the secretary's override, which is the everyday path when the draft needs a personal touch.

**The page renders one chase-queue section with per-row editing.** The store's read becomes a quintuple (`workbench.followUps` joins the quadruple), and `recordFollowUp` refreshes the whole snapshot after logging so the reminder count comes back from the host rather than being derived client-side. Each row pre-fills the textarea with the host's draft and the channel picker with the rung's suggestion; the row is keyed by id *and* rung, so a rung change resets the local edit state to the new draft instead of leaving stale text.

## Alternatives considered

**Per-target reminder state on the delivery/obligation rows.** A counter or last-chased-at column would fold the queue faster but freezes history into mutable state, cannot answer "what exactly was sent", and needs a migration for every new ladder. Rejected; an append-only table keyed by target keeps the ladders stateless.

**Letting the client pass the tier it rendered.** The queue read and the logging write would disagree whenever time passed between them, and a stale page could log a `nudge` against a row now in `escalate`. Rejected; the host re-derives at write time.

**One reminder row per rung per target (upsert).** Overwriting would cap the table's growth but loses the repeated-chase history the count already surfaces and needs delete logic on target removal. Rejected; append-only rows are simpler and the per-target volume is small.

**Moving the message drafts client-side.** Drafts in the UI would fork the SOP's 话术分档 per surface and leave the wire contract unable to default. Rejected; the host owns the copy, the page only edits it.

## Consequences

Old media open unchanged with an empty `reminders` table. Removing a delivery/obligation does not cascade to its reminders — the history rows keep the target id, and the queue recomputes from the live ledgers, so orphaned reminders are inert. Logging a reminder never advances the target itself: a `signed` delivery or `submitted` obligation still needs its own lifecycle action, and reminders logged before that moment stay as history. The queue can never contain a reminder-only row — every row projects an open target in a rung today.

## Testing

Workbench host tests cover the fold (fresh rows and far-out obligations hidden, a nudge-rung delivery and an overdue obligation queued with suggested channel and drafted message, the severity sort across the reminder ladder), the logging (derived tier/channel/message by default, secretary overrides accepted, refusal against unknown targets, closed targets, and targets not yet in their ladder), and persistence across a restart. Client tests cover the store round trip (quintuple read, record action refreshing the snapshot) and the page (queue rendering with rung badges and reminder counts, the editable draft and channel picker, the logging action, and error copy on refusal).
