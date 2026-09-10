# Workbench

English | [中文](workbench.zh.md)

[`@deepseek-ai/dsh-workbench`](../../packages/workbench/workbench) is the host half of the Web GUI workbench: one durable credits balance with an append-only grant ledger, and one AI-team status read model folded from the agent-preset roster against live sessions. It declares the `workbench` storage domain and serves `snapshot`, `ledger`, and `addCredits` through the `workbench` Typert Remote namespace, so a browser surface reads one host answer for points and presence instead of re-deriving the join.

Source: [`packages/workbench/workbench/src/index.ts`](../../packages/workbench/workbench/src/index.ts)

## Credits

The domain is version 1 with a `per-record` layout: one global record holds `{ balance }`, and an `entries` table keyed by a random UUID holds one `{ amount, reason, at }` row per grant. `addCredits(amount, reason)` validates before touching either store — a positive integer amount at or below `Config.maxGrant` and a trimmed reason of 1–200 non-whitespace characters, anything else rejecting with `gateway/bad-request`. A valid grant appends the ledger row and then replaces the balance global; both writes queue on the domain's single chain, so concurrent grants cannot interleave or lose an increment. A fresh medium serves `Config.startingBalance` until the first grant, and an existing medium keeps its persisted balance.

`ledger()` returns the most recent grants newest-first, bounded by `LEDGER_READ_LIMIT` (50) because the ledger is append-only and accumulates one row per grant.

## Team status

`snapshot()` returns the current balance beside a team read model: every preset `agentPresets.list()` discovers, each with an aggregated status, plus the three counts and the members in roster order with broken presets last. A preset is `offline` when discovery reports it broken, `busy` while a live non-blank session projects that preset through the `agentPreset` and `turnBoundary` projections, and `online` otherwise. `online` counts busy members as reachable, so it measures members a client can reach rather than idle ones. The fold runs on the host at call time; the browser never recomputes it.

## Web surface

`@deepseek-ai/dsh-api-remotes` mounts the generated `workbench` contribution, and `@deepseek-ai/dsh-client-ui-workbench` consumes it for the hero credits pill, the credits page and tab, and the AI-team status page and tab. Every one of those surfaces renders Remote answers directly and holds no balance or presence state of its own.

## Boundaries and limitations

- Credits are deployment-wide: one global balance, with no per-user, per-session, or per-member balance and no debit or spend path, only grants.
- The Remote is pull-only: `snapshot` and `ledger` answer on call and emit no events, so a grant made elsewhere appears on the reader's next call rather than immediately.
- Team status is a point-in-time join of the roster against the session list, and `online` means reachable rather than idle.
- The domain handle is opened during service init, so a missing or failing storage backend fails the service loudly instead of serving empty data.
- A crash between the ledger append and the balance set can leave a grant recorded without its increment; the durable ledger is the reconciliation source.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworkbench--workbench"></a>

### `ctx.workbench` — `Workbench`

The workbench Remote service: credits storage plus roster aggregation.

```ts cordis-catalog
/**
 * The Remote read: current credits balance beside the aggregated team.
 * @returns one snapshot over both halves.
 */
@Remote('snapshot') async remoteSnapshot(): Promise<WorkbenchSnapshot>

/**
 * Grant points: append one ledger entry, then replace the balance global.
 * Both writes queue on the domain's single chain, so concurrent grants
 * never interleave or lose an increment.
 * @param amount - positive integer points, at most `config.maxGrant`.
 * @param reason - non-empty trimmed reason, at most {@link MAX_REASON_LENGTH} characters.
 * @returns the new balance beside the appended entry.
 * @throws RemoteError `gateway/bad-request` when the amount or reason is invalid.
 */
@Remote('addCredits') async addCredits(amount: number, reason: string): Promise<WorkbenchCreditGrant>

/**
 * The Remote ledger read: the most recent grants, newest first. The page is
 * bounded because the ledger is append-only — a long-lived deployment
 * accumulates one row per grant.
 * @returns the recent entries, at most {@link LEDGER_READ_LIMIT}.
 */
@Remote('ledger') remoteLedger(): Promise<WorkbenchLedger>
```

Source: [`packages/workbench/workbench/src/index.ts`](../../packages/workbench/workbench/src/index.ts)
<!-- END GENERATED cordis-surface -->
