---
description: "The workbench package group map: the host half of the Web GUI workbench, for readers choosing or navigating the group."
kind: "package-group"
---

# workbench/ — Host-side Web GUI workbench

English | [中文](README.zh.md)

## Summary

The workbench group owns the host half of the Web GUI workbench: one durable credits balance with an append-only grant ledger, and one AI-team status read model folded from the agent-preset roster and live sessions. The single package serves both over the `workbench` Typert Remote namespace, so browser surfaces share one host-owned answer instead of re-deriving points and presence. It opens a `workbench` domain on the storage domain form; the browser half lives in the client group.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`workbench/`](workbench/README.md) | Host workbench capability: the persisted credits domain, the validated grant path, and the roster-vs-session team-status Remote | `ctx.workbench` |

-----

<a id="related-documentation"></a>
## Related documentation

- [Storage subsystem](../../docs/subsystems/storage.md) — the domain form the credits domain opens over, including its `per-record` layout.
- [Preset group map](../preset/README.md) — the agent-preset roster the team fold reads.
- [Browser workbench UI](../client/ui-workbench/README.md) — the browser half that renders both Remote answers.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
