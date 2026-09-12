---
description: "Host workbench capability for clients and maintainers composing the persisted credits ledger, the client master with its statutory-filing obligation ledger, yearly schedule, signature-delivery follow-up ladder, follow-up center, and the roster-vs-session team-status Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-workbench

English | [中文](README.zh.md)

## Summary

This package is the host half of the Web GUI workbench. It persists the credits grant ledger, the secretary-company client master, the statutory-filing obligation ledger, and the signature-delivery ledger in one `workbench` storage domain, and serves the `workbench` Typert Remote namespace: `snapshot` folds an AI-team read model from the preset roster and live sessions, `ledger`/`addCredits` keep the grants, `clients`/`obligations`/`complianceSchedule` answer the client master, its filings, and the year's schedule, `deliveries`/`addDelivery`/`markDelivery`/`removeDelivery` keep the delivery follow-up queue, and `followUps`/`recordFollowUp` fold the chase queue and log reminders. Mount it alongside a storage domain, agent presets, and the session store.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin after a storage backend, the storage-domain service, agent presets, and the session store. The shipped web-app bundle composes exactly this row; a storage-domain backend (json in the shipped composition) must already be open.

### Composition

```yaml
- name: '@deepseek-ai/dsh-storage-json'
- name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- name: '@deepseek-ai/dsh-agent-presets'
- name: '@deepseek-ai/dsh-workbench'
  config:
    startingBalance: 0
    maxGrant: 100000
```

### Configuration

| Field | Meaning |
|---|---|
| `startingBalance` | Non-negative integer balance a fresh medium serves before the first grant; an existing medium keeps its persisted balance |
| `maxGrant` | Positive integer ceiling for one grant, validated at every call |

### Remote surface

The `workbench` namespace is mounted browser-side through `@deepseek-ai/dsh-api-remotes`.

| Method | Returns |
|---|---|
| `snapshot()` | `{ credits: { balance }, team: { online, busy, offline, members }, user? }` — `user` names the greeting identity: the web login's display name when one exists, else the host OS account |
| `ledger()` | `{ entries: [{ id, amount, reason, at }] }`, newest first, at most `LEDGER_READ_LIMIT` (50) rows |
| `addCredits(amount, reason)` | `{ balance, entry }` after appending one ledger row and setting the new balance |
| `clients()` | `{ clients: [{ id, nameCn, nameEn?, brNo?, crNo?, incorporationDate, registeredAddress?, contactEmail?, contactWechat?, contactWhatsapp?, complianceStatus, openObligations, createdAt }] }`, creation order preserved |
| `addClient(payload)` | `{ client }` after storing one master row; the id is `C-<year>-<serial>` with the serial advancing past every id already stored for that year |
| `removeClient(id)` | removes the client row and every obligation recorded for it |
| `obligations()` | `{ obligations: [{ id, clientId, clientNameCn, kind, periodLabel, dueDate, status, createdAt, daysUntilDue, dueTier }] }`, open rows first, each group soonest due first |
| `addObligation(payload)` | `{ obligation }` after storing one row keyed by random UUID; the client must exist |
| `markObligation(id, status)` | moves one row between `open` and `submitted` — the SOP's client-submitted closing step |
| `removeObligation(id)` | removes one obligation row |
| `complianceSchedule()` | `{ year, rows: [{ clientId, clientNameCn, kind, periodLabel, dueDate, status, source, daysUntilDue, dueTier }] }` — the current year's filing calendar, soonest due first |
| `deliveries()` | `{ deliveries: [{ id, clientId, clientNameCn, title, channel, status, createdAt, daysSinceSent, followUpTier }] }`, open rows first, each group oldest sent first |
| `addDelivery(payload)` | `{ delivery }` after storing one row keyed by random UUID, opening in `sent`, sent now; the client must exist |
| `markDelivery(id, status)` | moves one row along `sent` → `viewed` → `signed` → `returned` — the SOP's view, sign, and returned-archive steps |
| `removeDelivery(id)` | removes one delivery row |
| `followUps()` | `{ followUps: [{ id, targetKind, targetId, clientId, clientNameCn, title, tier, suggestedChannel, dueDate?, days, message, reminderCount, lastReminderAt? }] }` — open deliveries in a chase rung and open obligations in a reminder rung folded into one queue, most urgent rung first |
| `recordFollowUp(payload)` | `{ reminder }` after storing one reminder row keyed by random UUID; the target must exist and be open, and its rung derives from today's date |

A grant accepts only a positive integer amount at or below `maxGrant` and a trimmed reason of 1–200 characters; anything else rejects with `gateway/bad-request` and leaves both stores untouched. The ledger page is bounded because the ledger is append-only and accumulates one row per grant. Team rows mirror the browser dashboard's derivation: a preset is `busy` while a started (non-blank) session projects it, `offline` when discovery reports it broken, and otherwise `online`; broken rows sort last, and `online` counts busy members as reachable.

Client and obligation writes validate at the same wire boundary: `nameCn`, `incorporationDate` (`YYYY-MM-DD`), `kind` (`NAR1`/`AB56`/`PTR`/`ITR`), `periodLabel`, and `dueDate` are required, optional fields are stored when non-empty, and unknown client ids reject with `workbench/client-not-found`; unknown obligation ids reject with `workbench/obligation-not-found`. `daysUntilDue` and `dueTier` derive from today's UTC date, and `dueTier` buckets the reminder ladder the UI renders: `ok` (not due within 30 days), `d30`, `d15`, `d7`, `d1`, then `overdue`. `complianceSchedule` treats stored obligations due in the year as authoritative and adds one projected NAR1 row per client whose incorporation anniversary falls in the year (`source: 'derived'`) — due `NAR1_FILING_WINDOW_DAYS` (31) days after the anniversary — unless an NAR1 obligation for that year is already recorded, so recorded and projected rows never double-remind.

Delivery writes validate at the same boundary: `clientId` and `title` (1–`MAX_DELIVERY_TITLE_LENGTH` (120) characters) are required, `channel` defaults to `email` (`email`/`wechat`/`whatsapp`), and unknown client ids reject with `workbench/client-not-found`; unknown delivery ids reject with `workbench/delivery-not-found`. `daysSinceSent` counts whole days since the send date (UTC), and `followUpTier` buckets the ladder the 催办 workflow acts on: `fresh` before the first rung, `nudge` from `DELIVERY_NUDGE_DAYS` (3) while not yet viewed, `chase` from `DELIVERY_CHASE_DAYS` (7) while not yet signed, `escalate` from `DELIVERY_ESCALATE_DAYS` (14), and `done` once the row closes (`signed`/`returned`).

Follow-up logging validates at the same boundary: `targetKind` (`delivery`/`obligation`) selects the ledger, the target must exist (`workbench/delivery-not-found` / `workbench/obligation-not-found`) and be open (`workbench/follow-up-not-open`), and a target that has not entered its ladder yet rejects with `gateway/bad-request`. The rung re-derives from today's date so the stored record stays truthful. `channel` defaults to the rung's suggestion (`nudge` → `whatsapp`, `chase` → `wechat`, `escalate`/`d30`/`d15`/`overdue` → `email`, `d7`/`d1` → `whatsapp`) and `message` defaults to the host draft for the rung; both accept the secretary's override, with `message` up to `MAX_REMINDER_MESSAGE_LENGTH` (500) characters.

### Failures and recovery

Opening the domain is part of service init, so a missing or failing backend fails the service loudly rather than serving empty data. The domain handle closes on the service fiber's dispose. Balance and ledger are per-record json files, so a restart reopens both unchanged; a crash between the ledger append and the balance set can leave a grant recorded without its increment, which an operator reconciles from the ledger.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the storage and fold behind the Remote answers; observable behavior is fully covered in [Use this package](#use-this-package).

### Design concept

Two joins that otherwise duplicate across surfaces become one host answer. Credits need durable, serialized writes, which the storage domain's single chain provides. Team status needs the preset directory (`agentPresets.list`) joined to live sessions via the `agentPreset` and `turnBoundary` projections; hosting it keeps the busy rule (a session with no started turn is blank work, matching the select lock) in one place instead of re-deriving it in every client.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The `Workbench` Remote service: init/open/close, `snapshot`, `ledger`, `addCredits`, the client master and obligation ledger with their schedule fold, the delivery ledger with its follow-up fold, the follow-up center over both ladders, and the team fold |
| [`src/spec.ts`](src/spec.ts) | The `workbench` domain spec, persisted-record schemas, grant length limits, and the due-date helpers |
| [`src/types.ts`](src/types.ts) | Client-safe snapshot, ledger, member, grant, client, obligation, schedule, delivery, and follow-up types |

### Persistence

The domain is versioned (`name: 'workbench'`, version 1) with a per-record layout: one global record `{ balance }`, an `entries` table keyed by random UUID, each row `{ amount, reason, at }`, a `clients` table keyed by the `C-<year>-<serial>` master id, each row the client fields plus `createdAt` and `complianceStatus`, an `obligations` table keyed by random UUID, each row the filing fields plus `status` and `createdAt`, a `deliveries` table keyed by random UUID, each row the delivery fields plus `createdAt`, and a `reminders` table keyed by random UUID, each row `{ targetKind, targetId, tier, channel, message, createdAt }`. Tables the medium predates read as empty, so old media load unchanged. A grant puts the ledger row first, then replaces the global; both writes queue on the domain chain, so concurrent grants cannot interleave or lose increments.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the service contract is not enough.

- [Storage domain package](../../storage/storage-domain/README.md) — the `open(spec)` seam, global/table API, and per-record layout.
- [Agent presets package](../../preset/agent-presets/README.md) — the roster fields, including `broken`, this package folds.
- [Browser workbench UI](../../client/ui-workbench/README.md) — the hero dashboard that renders the snapshot.

-----

<a id="model-experience"></a>
## Model Experience

None, as the Remote reads the preset directory and already-recorded session projections and persists a bookkeeping integer, assembling no prompt section, tool, or provider request.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the service answers. They are current package constraints.

- **One global balance** — credits are deployment-wide; there is no per-user, per-session, or per-member balance and no debit or spend path, only grants.
- **Pull-only Remote** — `snapshot` answers on call and emits no events; clients re-read after actions they take and do not see grants made elsewhere until their next read.
- **Json medium in the shipped composition** — durability and single-writer behavior match the storage-domain json backend; swapping the backend is a deployment composition choice, not a package option.
- **Team status is point-in-time** — the fold joins the roster against the session list at call time, and `online` means reachable (busy members count inside it), not idle.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The client master, the filing ledger, and the year's schedule fold are recorded in the [clients & filings Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-workbench-clients-filings.md). The delivery ledger and its follow-up ladder are recorded in the [deliveries Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-workbench-deliveries-followup.md). The follow-up center over both ladders is recorded in the [follow-up center Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-workbench-follow-up-center.md).

</details>

**Runtime invariant:** No companion is published. The service is a single join over relations other surfaces own and runtime-check: the storage domain validates the global and entry records against the spec schemas, the preset directory owns roster health including `broken`, and the session projection surface owns the `agentPreset` and `turnBoundary` values the busy fold reads.
