---
description: "Host workbench capability for clients and maintainers composing the persisted credits ledger and the roster-vs-session team-status Remote."
kind: "package-reference"
---

# @deepseek-ai/dsh-workbench

English | [中文](README.zh.md)

## Summary

This package is the host half of the Web GUI workbench. It persists a credits balance with an append-only grant ledger in a `workbench` storage domain and serves the `workbench` Typert Remote namespace: `snapshot` returns the balance beside an AI-team read model folded from the agent-preset roster and the live session list, `ledger` returns the most recent grants newest-first, and `addCredits` appends one validated grant and advances the balance. Mount it alongside a storage domain, agent presets, and the session store when browser surfaces need one host-owned answer for points and team status.

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
| `snapshot()` | `{ credits: { balance }, team: { online, busy, offline, members } }` |
| `ledger()` | `{ entries: [{ id, amount, reason, at }] }`, newest first, at most `LEDGER_READ_LIMIT` (50) rows |
| `addCredits(amount, reason)` | `{ balance, entry }` after appending one ledger row and setting the new balance |

A grant accepts only a positive integer amount at or below `maxGrant` and a trimmed reason of 1–200 characters; anything else rejects with `gateway/bad-request` and leaves both stores untouched. The ledger page is bounded because the ledger is append-only and accumulates one row per grant. Team rows mirror the browser dashboard's derivation: a preset is `busy` while a started (non-blank) session projects it, `offline` when discovery reports it broken, and otherwise `online`; broken rows sort last, and `online` counts busy members as reachable.

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
| [`src/index.ts`](src/index.ts) | The `Workbench` Remote service: init/open/close, `snapshot`, `ledger`, `addCredits`, the team fold |
| [`src/spec.ts`](src/spec.ts) | The `workbench` domain spec, persisted-record schemas, and grant length limits |
| [`src/types.ts`](src/types.ts) | Client-safe snapshot, ledger, member, and grant types |

### Persistence

The domain is versioned (`name: 'workbench'`, version 1) with a per-record layout: one global record `{ balance }` and an `entries` table keyed by random UUID, each row `{ amount, reason, at }`. A grant puts the ledger row first, then replaces the global; both writes queue on the domain chain, so concurrent grants cannot interleave or lose increments.

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

None.

</details>

**Runtime invariant:** No companion is published. The service is a single join over relations other surfaces own and runtime-check: the storage domain validates the global and entry records against the spec schemas, the preset directory owns roster health including `broken`, and the session projection surface owns the `agentPreset` and `turnBoundary` values the busy fold reads.
