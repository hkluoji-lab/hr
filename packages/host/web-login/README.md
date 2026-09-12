---
description: "Web login surface: the rendered login page with a brand wall, the phone + SMS-code and password credential routes (register, login, reset), the loginSession identity service, and the owner's team-member invite and roster management."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-login

English | [中文](README.zh.md)

## Summary

Mount `dsh-web-login` to give a Web deployment a real login page: unauthenticated browsers land on `/login`, register with a phone number and a password (plus an SMS code only where configured), sign in with either factor, and leave with an account-bound session cookie; the page also redeems an optional invite code after login. Without an SMS provider, each code is logged server-side under an explicit demo marker. On top sits a member model: the first registered phone becomes the owner, single-use invites bind phones to AI-team roles, and `/auth/status` answers roles and ownership.

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

Mount the package in a composition that carries `webServer` (the route carrier), `connection` (the trust fence and session cookies), and `storageDomain` (the account medium) — the shipped Web composition qualifies. The `/?token=...` process-launch exchange keeps working: it mints an anonymous session, and this surface upgrades it to an account-bound one on login.

### When to choose it

Choose it for a Web deployment that must distinguish who is at the browser: the workbench greeting, credits, and future per-account surfaces read the logged-in identity instead of an anonymous cookie, and bound roles scope the workbench's rendered views. Avoid it as a per-route authorization layer for other surfaces — outside the team-management routes the issued cookie grants the same Web access an anonymous session had, and server-side task-data isolation does not exist yet.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-web-login'
  config:
    codeCooldownSeconds: 60
    codeValiditySeconds: 300
    maxVerificationAttempts: 5
    requireRegistrationCode: false
    inviteValiditySeconds: 604800
```

| Field | Default | Meaning |
|---|---|---|
| `codeCooldownSeconds` | 60 | Minimum gap between two sends for one phone, in seconds. |
| `codeValiditySeconds` | 300 | How long one code stays verifiable, in seconds. |
| `maxVerificationAttempts` | 5 | Wrong verifications allowed before one challenge is destroyed. |
| `requireRegistrationCode` | false | Whether `POST /auth/register` demands an SMS code beside the password. False registers from a phone and a password alone and hides the code field, so a deployment with no SMS provider still registers accounts. |
| `inviteValiditySeconds` | 604800 | How long one member invite stays redeemable, in seconds. |

The defaults are the shipped experience; a demo deployment may tighten them. The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-web-login) is the exhaustive source for every accepted field.

### The HTTP surface

| Route | Semantics |
|---|---|
| `GET /login` | The rendered page (200, `no-store`, HEAD supported). |
| `GET /auth/status` | `{authenticated, subject?, displayName?, roles?, isOwner?}` for the caller's session — roles and ownership are the member-model facts. |
| `POST /auth/sms/send` | Issues one code for `^1\d{10}$`; 429 with `cooldownSeconds` when in cooldown. The code is logged server-side as `[演示]` — never returned in the response. |
| `POST /auth/sms/verify` | Verifies the code: 400 `no-challenge`/`bad-code` (with remaining attempts), 410 `expired`/`exhausted`; success registers the account on first login, mints the account-bound cookie, and answers `{ok, redirect: '/'}`. |
| `POST /auth/register` | Registers `phone` with a `password` (8–64 chars, one letter and one digit), plus `code` when `requireRegistrationCode` is set, mints the cookie, and answers `{ok, redirect: '/'}`; 400 `weak-password`/`no-challenge`/`bad-code`, 409 `phone-registered`. |
| `POST /auth/password/login` | Verifies the password against the stored credential; `remember: true` mints a persistent cookie, otherwise a browser-session cookie. 400 `no-credential`/`wrong-password`. |
| `POST /auth/password/reset` | Replaces the credential after SMS verification and logs in; 400 `no-account`/`weak-password`. |
| `POST /auth/logout` | Clears the session cookie (204). |
| `POST /team/invites` | Owner creates one single-use invite for a role set and receives `{ok, code, expiresAt}`; 401 unauthenticated, 403 non-owner, 400 invalid roles. |
| `POST /team/invites/redeem` | Any logged-in phone redeems one invite; the invite's roles union into the caller's existing binding. 400 `bad-invite`, 409 `invite-used`, 410 `invite-expired`. |
| `GET /team/members` | Owner reads the roster `{ok, owner, members}` ordered by grant time. |
| `PUT /team/members/:phone` | Owner assigns a registered account its whole role set in one call `{roles}`; the set replaces any prior binding. 400 `bad-phone`/`bad-request`/`no-account`, 403 non-owner or the owner phone itself. |
| `DELETE /team/members/:phone` | Owner unbinds one member (204); the owner's own phone is refused (403). |
| `GET /team/accounts` | Owner reads every registered account `{ok, owner, accounts}` ordered by registration time — the only list that reaches an account which never bound a role. |
| `DELETE /team/accounts/:phone` | Owner deletes one account with its credential and role binding (204). 400 `bad-phone`/`no-account`, 403 non-owner or the owner phone itself, which ownership derives from. |

### The `loginSession` service

The plugin provides `ctx.loginSession`, holding the most recent login this process life (`displayName()`/`phone()`). In-memory by design: the durable account lives in the `web_login` storage domain; the service answers "who just logged in" without a domain read. Host surfaces read it for display (the workbench greeting) and fall back when absent.

### The `./shared` subpath

Route paths and wire payload types are published as the browser-safe `./shared` subpath (constants and types only).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

[`src/index.ts`](src/index.ts) is a function plugin opening the `web_login` domain (single-layout `accounts` table keyed by phone; the masked display name `138****1234` is derived at write time) and registering the routes on `ctx.webServer`. Trust reuses the composition's connection fence as-is: every route asks `requestRejection` first, where 403 (Host/Origin fence — DNS rebinding, cross-site POSTs) refuses and 401 ("trusted caller, not logged in") passes, because that is the caller the surface exists for. POST bodies are validated at the wire: `application/json` essence, a 64 KiB ceiling, and exact string fields. Verification codes live in the in-memory store [`src/sms.ts`](src/sms.ts) — one live challenge per phone with cooldown, expiry, and an attempt ceiling; every terminal outcome destroys the challenge. A successful verification upserts the account, records `loginSession`, and mints the cookie through `connection.issueSessionCookie(headers, phone)`, so cookie signing, attributes, and lifetime stay in one place. [`src/page.ts`](src/page.ts) renders the page from [`src/strings.ts`](src/strings.ts) — inline CSS and vanilla JS, no external assets; the page script probes `/auth/status` and skips the form for an already-logged-in browser, offering instead the invite-code field when the caller holds none of the roles.

The password credentials live beside the accounts: the domain's `credentials` table stores per-phone `passwordHash` values, and [`src/password.ts`](src/password.ts) hashes with scrypt (per-hash salt, algorithm parameters in the stored string) and compares with `timingSafeEqual`. Registration writes the credential after verifying an SMS challenge only when `requireRegistrationCode` is set — otherwise the phone and the password are the whole request and the page renders no code field; reset always verifies a challenge. Password login mints the cookie with the connection's default lifetime for "remember me" and a browser-session cookie otherwise. The login page offers the four tabs (password, SMS code, register, WeChat placeholder) plus the reset panel behind the forgot link; front-end validation mirrors the wire rules before any POST, and the register policy reaches the page script as a serialized flag.

The member model lives in [`src/spec.ts`](src/spec.ts): the domain's `members` table stores per-phone role bindings (`roles`, `grantedBy`, `grantedAt`) and the `invites` table stores per-code single-use invitations (`roles`, `createdBy`, `expiresAt`, `acceptedAt?`). The owner is derived per call as the earliest-registered account (ties broken by phone order), so ownership follows the accounts table with no second source of truth; redeem unions the invite's roles into the caller's binding and stamps the invite `acceptedAt`, making replay a 409. Direct assignment (`PUT /team/members/:phone`) instead replaces the target's whole role set — the owner edits one member's binding as a single decision. The domain version stays 1 across the members/invites addition: `single`-layout reads match the version exactly, so bumping it would strand every existing `web_login.json` medium, while a missing declared table parses as empty and the pre-existing `accounts` table's schema is unchanged. The accounts table is also the deletion surface: `GET /team/accounts` lists every registered account, bound or not, and `DELETE /team/accounts/:phone` removes one with its credential and its binding, refusing the owner's own phone because ownership derives from the earliest account.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-client-connection](../../client/connection/README.md) — the trust fence (`requestRejection`) and the session-cookie issuer (`issueSessionCookie`) this surface composes.
- [dsh-host-webserver](../webserver/README.md) — the route registry carrying the thirteen HTTP endpoints.
- [dsh-storage-domain](../../storage/storage-domain/README.md) — the domain layer owning the durable `web_login` accounts.
- [Host package map](../README.md) — the GUI-host family this package belongs to.

-----

<a id="model-experience"></a>
## Model Experience

### The login page and the `loginSession` service

#### What the model sees

Nothing. The package serves a human login flow over thirteen HTTP routes (`/login`, `/auth/status`, `/auth/sms/send`, `/auth/sms/verify`, `/auth/register`, `/auth/password/login`, `/auth/password/reset`, `/auth/logout`, `/team/invites`, `/team/invites/redeem`, `/team/members`, `PUT /team/members/:phone`, `DELETE /team/members/:phone`) and an in-memory challenge store; it registers no tool, prompt section, message content, or event the model ever reads, and the logged-in identity stays server-side in the `web_login` domain and `ctx.loginSession`.

#### Token effect

None; no model request contains login-page bytes, route payloads, or the logged-in identity.

#### KV Cache effect

None; the package never assembles or sends provider requests, so there is nothing to cache or evict.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No real SMS provider.** Codes are logged server-side with an explicit `[演示]` marker; a deployment must not expose this route set to untrusted networks until a provider lands behind `issue`/`verify`. Registration itself needs no provider while `requireRegistrationCode` stays false (the default), which is what lets a provider-less deployment create accounts.
- **WeChat scan is a placeholder.** The second tab renders "coming soon"; no backend exists. Wiring it means a real provider plus its own cookie minting through `connection`.
- **The cookie does not scope access.** Role bindings gate the owner's management routes and scope the workbench's rendered views; on every other surface a logged-in cookie and an anonymous one grant the same access, and server-side task-data isolation is deferred until a consumer needs it.
- **`loginSession` is per-process.** A restart forgets the most recent login; host surfaces fall back to their own defaults until the next login.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The forced-login redesign — the v2 subject-bearing cookie, removing the loopback trust bypass, the login redirect, and this surface's promotion decision — is recorded in the [login page Agent Note](../../../.agents/notes/implemented/feature/2026-09-11-web-phone-login.md). The member model — owner derivation, the invite lifecycle, the version-1 domain extension, and the workspace-scoping split between host and client — is recorded in the [team member roles Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-web-team-member-roles.md). The password credential layer — the scrypt hash format, the credentials domain table, the remember-me cookie persistence split, and the four-tab page — is recorded in the [password auth Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-web-password-auth.md). The registration without SMS — the `requireRegistrationCode` Config field, the page's conditional code field, and the now-optional wire `code` — is recorded in the [password-only registration Agent Note](../../../.agents/notes/implemented/feature/2026-09-12-web-registration-without-sms.md).

</details>

**Runtime invariant:** No companion is published. The plugin registers thirteen stateless routes over one domain and one in-memory challenge store; the route registrations prove disposal through their HMR-safety spec. Owner derivation and invite redemption are each a single operation point inside their routes, so no independent observations can diverge.
