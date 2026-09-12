# Agent Note: Workbench signature-delivery ledger and follow-up ladder

Status: implemented

English | [中文](2026-09-12-workbench-deliveries-followup.zh.md)

## Problem

The stage-1 secretary-company SOP's delivery skill (S-DELIV-01) tracks every file package the secretary sends out for signature — annual-return packs, contract sets — from send-out through view, sign, and returned-archive, with a graded follow-up ladder (T+3 nudge / T+7 chase / T+14 escalate) when the client goes quiet. Until now nothing on the host side recorded a send: a delivery's fate lived in the secretary's memory or chat history, and nobody could answer "what went out and how long has it been waiting". The workbench needed one stored row per send-out, a derived tier telling the follow-up workflow where each row stands today, and a page section that reads as the follow-up queue.

## Decision

**The deliveries table extends the `workbench` domain in place, version 1 unchanged.** The spec gains one per-record table keyed by random UUID; each row stores `clientId`, `title` (1–120 characters, the secretary owns the wording), `channel` (`email`/`wechat`/`whatsapp`, the stage-1 S-CHAN-01 vocabulary), `status` (`sent`/`viewed`/`signed`/`returned`), and `createdAt`. The row opens in `sent` the moment it is recorded — there is no draft state, because the ledger records sends that already left, not sends being composed. A medium predating the table reads it as empty, so existing deployments open unchanged.

**The Remote owns the join, the ordering, and the tier derivation.** `deliveries` joins each row with its client's current name, sorts open rows first (so the page reads as the follow-up queue) and each group oldest-sent-first, and derives `daysSinceSent` (whole UTC days) and `followUpTier` at call time: `fresh` before the first rung, `nudge` from day 3 while not yet viewed, `chase` from day 7 while not yet signed, `escalate` from day 14, and `done` once the row closes. `markDelivery` moves the row one lifecycle step at a time — the wire union validates the target status — and `removeDelivery` deletes it. Tiers are never stored: like the filing ladder, the delivery ladder re-grades on every read without a sweeper, and backdating `createdAt` on disk grades an old row correctly (the tests restart on a backdated medium to prove it).

**The page folds the ladder into one queue section.** `loadClients()` becomes a quadruple read (`workbench.deliveries` joins the triple), the snapshot carries the rows, and the ClientsPage gains a signature-delivery section: the ledger rows with channel, lifecycle, days-waiting, and tier badges, a one-step advance control per row (viewed → signed → returned; a closed row offers no advance), and a three-field recording form (client, title, channel) whose submit disables until the required fields hold. Copy routes through the locale dictionaries in both languages; tier classes reuse the same CSS-module naming-by-wire-id pattern the filing tiers use.

## Alternatives considered

**A separate deliveries package.** The rows join the client master the workbench domain already owns; splitting the ledger out would move one foreign key across plugins for no second consumer. Rejected; the domain extends in place.

**A multi-step record flow with draft rows.** A draft state would let the ladder start measuring on an unsent row and needs a sweeper to age drafts out. Rejected; the record action means "it left today", so the row opens in `sent` with `createdAt` = now.

**Storing per-nudge history on the row.** The SOP's stage-1 need is "what needs chasing today", not an audit trail; a stored history would grow per follow-up and force the read to pick a current row anyway. Deferred; the tier recomputes from the send date, and a follow-up log belongs to a later workflow stage that acts (emails, messages) rather than observes.

**Free-text channels.** Letting the secretary type a channel string would make the page unable to badge or filter by channel and would fork the vocabulary per deployment. Rejected; the wire enum fixes `email`/`wechat`/`whatsapp` for stage 1.

## Consequences

Existing `workbench` media open unchanged with an empty `deliveries` table; removing a client does not cascade to its deliveries (the rows keep the client id, and the read falls back to the raw id if the client row is gone), so the queue keeps showing a sent package even after its client master is deleted. The ladder is derived, not logged: a row sitting in `escalate` for a week shows one badge, not seven. Delivery rows are deployment-wide with no per-member ownership, matching this pass's client-side scoping. The send date is the host's UTC day at record time.

## Testing

Workbench host tests cover the delivery CRUD (record with default channel, mark across the lifecycle, remove, unknown-client and unknown-delivery refusals), the longest-waiting-first queue order with closed rows last, tier derivation across the rung boundaries (nudge/chase/escalate) including a restart on a backdated medium, and old-medium compatibility. Client tests cover the store round trips (the quadruple read, add/mark/remove delivery, wire-code refusals) and the page (row rendering with channel/lifecycle/tier badges, the recording form's local validation and optional-channel payload, the advance and remove controls scoped to their row).
