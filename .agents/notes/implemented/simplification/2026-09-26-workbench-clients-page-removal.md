# Agent Note: The Clients & filings page leaves the workbench

Status: implemented

English | [中文](2026-09-26-workbench-clients-page-removal.zh.md)

## Problem

The [clients & filings Agent Note](../feature/2026-09-12-workbench-clients-filings.md) shipped a seventh sidebar entry — 客户与申报 / Clients & filings — opening a page of the secretary-company SOP: the client master, the statutory-filing obligation ledger, the year's compliance schedule, the signature-delivery ledger, and the follow-up center, each with its own record/edit/advance actions.

Its content had two homes. The AI team page already folds the same host data through `rolePending` into each role card's pending line — the admin's open chase queue, finance's open obligations, legal's obligations closing in — so the seven vocational roles in the sidebar and the six task entries below them named the same work twice, and the deployment's users asked for the client page's entry to go.

The page's data is not only the page's. `TeamPage` reads `ClientsState` and `rolePending` over it, so the domain, the Remotes, and the six-call read had to outlive the surface that originally motivated them.

## Decision

**The surface goes; the data read stays.** Removed: the `sidebar.nav` entry `workbench-clients` and its `clients` target, the `'clients'` member of `WorkbenchPageId`, `TITLES`/`SUBTITLES`/`NAV_TARGETS` entries, the ~950-line `ClientsPage` component, the two dictionary blocks (`nav.clients` and every `clients.*` key, Chinese and English), the nine write methods (`addClient`, `removeClient`, `addObligation`, `markObligation`, `removeObligation`, `addDelivery`, `markDelivery`, `removeDelivery`, `recordFollowUp`), `setReportMonth`, the `MutationOutcome` type, the clients-only rules in `WorkbenchPages.module.css`, and the `shellInjected` write surface in `client/index.ts`.

Kept: `ClientsState`, `CLIENTS_INITIAL`, `rolePending`, the controller's `loadClients()` six-call read into the `clients` snapshot, and the shell face's `clients`/`loadClients` bindings. `WorkbenchShell` now triggers that read only when the team page opens, which is its one consumer.

**Deleting the module, not hiding it.** The entry is gone from `NAV_TARGETS`, so no configuration can bring the page back; a deployment that wants client bookkeeping writes the host Remote directly or ships the surface again.

**Copy and CSS leave with the surface.** Both dictionaries drop the clients block; `WorkbenchPages.module.css` drops the schedule, master, ledger, delivery, follow-up, and report-control rules that only `ClientsPage` applied. The classes the other pages share (`.section`, `.sectionTitle`, `.ledgerList`, `.field`, `.formError`, and the rest) stay.

## Alternatives considered

**Delete the host domain, its Remotes, and `loadClients()` with the page.** The cleanest-looking deletion, and it removes the workbench domain's client, obligation, delivery, and reminder tables outright. Rejected: those six reads are what each AI-team role card's pending line folds, so the deletion would also remove the per-role pending summary — a second feature the request did not mention.

**Keep the page behind a config flag or a hidden route.** A deployment-varying entry point would need a validated `Config` field, and the page's component, copy, and CSS would ship either way. Rejected: an unwanted surface is deleted, not gated — a flag keeps dead code alive and invites the same request again.

**Move the master's editing forms onto the AI team page.** Rejected: the role card is a summary that starts work, and turning it into a CRUD surface is a redesign nobody asked for. The pending line is the summary the roster needed.

**Retitle the entry and keep the page.** The complaint was the entry and the work behind it, not its label. Rejected.

## Consequences

The sidebar is six entries — task hall, task assistant, active tasks, AI team, projects, and the owner's members management — and the clients bookkeeping the domain still stores is read once, by the team page, as the input to the role pending lines. There is no surface on which to record a client, an obligation, or a delivery, mark one filed, or log a reminder; the host Remotes for those writes remain served, without a browser consumer.

`MutationOutcome` had no consumer left once the page and its write methods went, so the type is gone rather than kept for a future surface.

## Verification

`pnpm run typecheck` spans the client program; the ui-workbench specs pin the six sidebar entries, the shell's team-page clients read, the `rolePending` folds, and the removal of the clients page from the page-switch cases (158 tests). The served page was checked in a browser after `pnpm run build`, `node apps/web/hr-portal/install.mjs`, and a `dsh-web.service` restart: the sidebar lists six entries with no 客户与申报, the task pages open unchanged, and the AI team cards still carry their pending lines.