# Agent Note: Deleting a registered account from the Web workbench

Status: implemented

English | [中文](2026-09-12-web-account-deletion.zh.md)

## Problem

The member model gave the owner role management but no way to remove an account. The roster lists bindings, and a row exists only after a grant, so an account that never bound a role — a mistyped registration or a spent test phone — stayed invisible on every surface; the only removal the surface offered was unbinding, which leaves the account row and its credential in place. Removing such an account meant editing `web_login.json` by hand with the deployment stopped.

## Decision

**`dsh-web-login` gains two owner-only routes over the accounts table.** `GET /team/accounts` answers `{ok, owner, accounts}` with every registered account (phone, masked display name, registration and last-login times) ordered by registration time — the only list that reaches an account with no binding. `DELETE /team/accounts/:phone` removes one account with its credential and its role binding and answers 204. It refuses the owner's own phone with 403: ownership derives from the earliest-registered account, so deleting the owner would hand every management route to whichever account registered next. Malformed phones answer 400 `bad-phone`, unknown phones 400 `no-account`, non-owners 403, anonymous callers 401. The three deletes run credential → binding → account, so a concurrent reader between two of them sees a binding without its account rather than an account whose bindings survived it.

**The client lists accounts beside the roster.** `loadMembers()` reads both routes through the same fetcher, one `Promise.all` behind one status, and the `members` snapshot gains `owner` and `accounts`. The page joins the two lists by phone, because the account list does not repeat the granted roles. The owner's row renders a hint instead of a delete control, matching the host's refusal rather than relying on it; a refused delete shows the host's message in the page's alert.

**The routes hang off the accounts table, with no new table and no version bump.** Ownership already derives from that table, and the credential and the binding are its dependents; deleting what they depend on is the operation those two tables are missing.

## Alternatives considered

**Extending `DELETE /team/members/:phone` to delete the account when no binding exists.** Rejected: one route would then mean two different deletions selected by hidden state, and its 204 could not say which one happened.

**Letting the owner delete itself and moving ownership to the next account.** Rejected: an irreversible, silent handover of every management route, triggered by an ordinary delete. The owner's phone is refused instead.

**A soft delete or a disabled flag.** Rejected: the account row is a phone key and the credential is a hash, neither carrying history worth keeping, and every read would have to filter the flag. A removed test phone should be registrable again immediately.

## Consequences

Deleting an account drops its credential and its binding, so the phone registers afresh and holds no roles until one is granted. No deletion moves ownership, because the owner cannot delete itself. A browser still holding a live login cookie keeps it: `/auth/status` answers `authenticated: true` with its subject, and with neither `displayName` nor `roles`, because the account row and the binding it read are gone. Registration and last-login times are exposed on the account list to the owner only.

## Testing

Web-login tests cover both routes end to end: the owner guard chain (401 anonymous, 403 non-owner, the owner-self refusal), registration-order listing including an account with no binding, the method guards, `bad-phone` and `no-account`, and the cascade — after the delete the roster is empty, password login answers `no-credential`, and the freed phone registers again. The trust-fence and disposal tests enumerate the two routes beside the existing ones. Client tests cover the two-read snapshot (one status, both routes recorded), the delete round trip, and the page's account section: roles joined from the roster, the unbound note, the owner row without a delete control, a landed delete, and the host refusal rendered in the alert.
