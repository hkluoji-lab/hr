# Agent Note: Workbench client master and statutory-filing ledger

Status: implemented

English | [中文](2026-09-12-workbench-clients-filings.zh.md)

## Problem

The stage-1 secretary-company SOP names twelve skills; the two everything else reads are the client master (S-CORE-01) and the statutory-filing ledger (S-COMPL-01). Until now the workbench knew only credits and team status: a client's registry numbers lived in chat history, filing deadlines were tracked by hand, and the annual NAR1 anniversary had to be remembered per client. The workbench needed a host-owned place to store clients and filings, and a page that turns them into this year's filing calendar with the reminder ladder (d30/d15/d7/d1/overdue) the follow-up workflow acts on.

## Decision

**The data lives in the `workbench` domain, tables added in place.** The domain spec gains two per-record tables inside version 1: `clients` keyed by the master id `C-<year>-<serial>` (the serial advances past every id already stored for that year, so ids stay stable and readable) and `obligations` keyed by random UUID. A client row stores the SOP master fields — `nameCn` (required), `nameEn`, `brNo`, `crNo`, `incorporationDate` (required, `YYYY-MM-DD`), `registeredAddress`, `contactEmail`, `contactWechat`, `contactWhatsapp` (optional, stored when non-empty) — plus `createdAt` and a `complianceStatus` placeholder (`green`) for later workflow use. An obligation row stores `clientId`, `kind` (`NAR1`/`AB56`/`PTR`/`ITR`), `periodLabel`, `dueDate`, `status` (`open`/`submitted`), and `createdAt`. The version stays 1 for the same reason the `web_login` domain stayed 1: a medium that predates the tables parses them as empty, so existing deployments open unchanged, and bumping the version would strand every medium at open.

**The Remote namespace owns the reads, the derived values, and the year's schedule.** `clients` returns every row in creation order with its open-obligation count folded in; `obligations` joins each row with the client's current name (so a renamed client does not stale the ledger) and sorts open rows first, soonest due first; `addClient`/`removeClient`, `addObligation`/`markObligation`/`removeObligation` are the writes, all queued on the domain's single chain. `markObligation` moving a row to `submitted` is the SOP's client-submitted closing step. Every read derives `daysUntilDue` and `dueTier` from today's UTC date at call time — tiers are never stored, so the ladder re-grades itself on every read without a sweeper.

**`complianceSchedule` folds the year's calendar; the ledger stays authoritative.** Stored obligations due in the current year are authoritative rows (`source: 'ledger'`). Every client whose incorporation anniversary falls in the year also gets one projected NAR1 row (`source: 'derived'`) due `NAR1_FILING_WINDOW_DAYS` (31) days after the anniversary — unless an NAR1 obligation for that year is already recorded for that client, so a recorded filing never double-reminds alongside its projection. Rows sort soonest due first, and the client page renders the projection as informational until someone records the real obligation.

**The client page reads the triple and validates only field presence.** `WorkbenchController` gains a fourth snapshot store; `loadClients()` issues `workbench.clients`, `workbench.obligations`, and `workbench.complianceSchedule` and parks the answer in one snapshot, so the page cannot render a master row the schedule does not know about or vice versa. `ClientsPage` validates required fields and date shape locally (the submit control disables until they hold), maps the host's wire error codes (`gateway/bad-request`, `workbench/client-not-found`, `workbench/obligation-not-found`) to friendly copy, and treats every state change as a host round trip — the page owns no client state of its own. A seventh `sidebar.nav` entry opens the page; slot registration stays static.

## Alternatives considered

**A separate clients/filings package.** The ledger joins nothing that is not already in the workbench domain, and splitting it would put one storage domain's spec across two plugins for no second consumer. Rejected; the domain extends in place.

**Storing the reminder tier on the row.** A stored tier goes stale the moment the day changes and needs a sweeper or a read-time re-check anyway. Rejected; tiers derive at call time from the due date.

**Deriving the schedule entirely client-side.** The page would re-implement the NAR1 window rule and re-join client names per render, and any future consumer (bot reminders, the month report) would re-derive it again. Rejected; the host fold is the one answer.

**Blocking duplicate obligations per client/kind/period.** Real filings arrive as revisions and corrections; the ledger is a bookkeeping surface, not a statutory source of truth. Deferred; deduplication belongs to a later workflow stage that records submissions from agent output.

## Consequences

Existing `workbench` media open unchanged with empty `clients`/`obligations`; credits and team status keep working. Removing a client removes its obligations with it — the ledger has no orphan rows by construction. The projected NAR1 row is informational: until the filing is recorded it reappears every read, so deleting an obligation without recording a replacement resurrects the projection rather than silencing it. Client and filing data are deployment-wide with no per-member ownership, matching this pass's client-side scoping; the compliance status is a fixed `green` placeholder until a workflow stage computes it. The schedule's year is the UTC year at call time.

## Testing

Workbench host tests cover the master CRUD (id sequencing across years, validation, unknown-id refusals), the obligation lifecycle (record, mark, remove, client-name join, sort order), tier derivation across the ladder boundaries including `overdue`, the schedule fold (ledger authority, anniversary projection, recorded-filing suppression, year cutoff), and old-medium compatibility (a medium predating the tables reads as empty). Client tests cover the store round trips (`loadClients` triple, add/remove client, add/mark/remove obligation), the page rendering (schedule tiers and sources, master rows, ledger rows, empty/loading/error states), the forms (optional-field-only payloads, local validation through the disabled submit, host refusals surfacing), and the browser-plugin nav expectations for the seventh entry.
