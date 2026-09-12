# Agent Note: Phone-bound team member roles for the Web workbench

Status: implemented

English | [中文](2026-09-12-web-team-member-roles.zh.md)

## Problem

The login surface knew only accounts: every logged-in phone saw the same workbench, no position, no scope. The deployment needs a phone number bound to AI-team roles (secretary, accountant, legal, audit), several roles per phone, and, after login, a workspace scoped to those roles — without a task-data isolation layer on the server in this pass. How members are enrolled, who may enroll them, and where each rule lives had to be fixed before the UI could filter anything.

## Decision

**The member model lives in `dsh-web-login`, on top of accounts.** The `web_login` domain gains two tables: `members` (per-phone `{roles, grantedBy, grantedAt}`) and `invites` (per-code `{roles, createdBy, createdAt, expiresAt, acceptedAt?}`). The owner is not stored anywhere: it is derived per call as the earliest-registered account (ties broken by phone order), so ownership follows the accounts table and cannot disagree with it. Enrollment is invitation-only: the owner creates a single-use invite for a validated role set (`POST /team/invites`, random 6-byte base64url code, validity as Config `inviteValiditySeconds`, default one week), and any logged-in phone redeems it (`POST /team/invites/redeem`), unioning the invite's roles into its existing binding and stamping `acceptedAt` so replay answers 409. The owner manages the roster through `GET /team/members` and `DELETE /team/members/:phone`; unbinding the owner's own phone is refused because ownership would survive it. All four routes answer 401 to the unlogged-in and 403 to anyone but the owner, and `/auth/status` extends with `roles?` and `isOwner?` so consumers need no second read. Role ids (`secretary`/`accountant`/`legal`/`audit`) are the client workbench's `roles.ts` vocabulary, validated by one zod schema (non-empty, no duplicates).

**The domain version stays 1.** `single`-layout reads match the declared version exactly, so bumping to 2 would strand every existing `web_login.json` medium at open. Purely adding declared tables is compatible: the pre-existing `accounts` table keeps its schema, and a medium that predates the new tables parses them as empty. Both new tables therefore ship inside version 1.

**The client scopes the workspace from `/auth/status`.** `WorkbenchState` gains `my: {name, roles, isOwner}`; `load()` probes the same-origin route once and fails silently to the unbound-visitor shape, so a non-web composition renders exactly as before. `scopedRoles`/`scopedMembers` filter the role vocabulary and the preset roster to the caller's roles plus role-less presets — the owner and unbound visitors see the full roster. The greeting appends the bound roles, and the roster, task-assistant picker, and team page read the scoped views. The owner gets a sixth nav entry, **Members**, opening a frame-wide page that drives the published `/team` routes (create invite from checked roles, list the roster with grant metadata, unbind). Slot registration stays static; the entry binds `useMy` at render time and renders null for anyone but the owner — the one workable gate, because nav registration completes before the async owner state arrives.

**Workspace isolation is client-side rendering plus the four guarded routes.** Role bindings filter what a browser renders and gate the management routes; task and session data are not scoped server-side. The login page carries an optional invite-code field that redeems right after verification, closing the enroll loop for a member who arrives with a code.

## Alternatives considered

**Bumping the domain version to 2.** Correct-looking but wrong: the strict version match would refuse every existing medium on open, turning a compatible addition into a migration. Rejected in favor of add-tables-in-place.

**Storing ownership as a flag or a role.** A stored owner flag can disagree with the accounts table (who registered first) and needs its own transfer story. Deriving from `createdAt` keeps one source of truth; the owner-self-unbind refusal covers the one interaction that would have needed a rule anyway.

**A separate members package.** The member model is meaningless without the accounts and cookies web-login already owns; splitting it would put one enroll flow across two plugins. Rejected; web-login extends in place and republishes the wire contract through `./shared`.

**Server-side task-data isolation now.** It needs per-request subject context in the session and workbench Remotes — a different seam than the login surface. Deferred; this pass scopes rendering and management routes only, and both READMEs say so.

## Consequences

Existing `web_login.json` media open unchanged with empty `members`/`invites`; accounts keep working. Before the first registration there is no owner, so every management route answers 403 and invites are impossible — the first registered phone becomes the owner by simply existing. A member bound to several roles sees the union everywhere; unbinding requires the owner. The client trusts `/auth/status` for visibility, so a crafted browser could locally un-hide the Members entry, but every route behind it still answers 403 — the guard is server-side, the filtering is convenience. Invites are single-use and expire server-side; a redeemed or expired code fails loudly at redeem.

## Testing

Web-login tests cover the owner guard (401 unauthenticated, 403 non-owner, refusal before any owner exists), invite creation with random codes and invalid roles, the redeem lifecycle (unknown, already-used, expired, replay, role union) with `/auth/status` reflecting the binding, the roster and unbind routes including the owner-self-unbind refusal, owner derivation under controlled registration order, persistence across the domain file, and post-dispose 404. Client tests cover the `my` state and `scopedMembers`/`scopedRoles` filtering, the greeting roles suffix (silent for visitors), the owner-only nav entry, the members page (invite creation, roster, unbind), and the browser-plugin integration (nav expectations, fetch stubs, members actions).
